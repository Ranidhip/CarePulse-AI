"""
Tests for the demo-mode provider endpoints (app/api/demo_provider.py).

These build a small isolated FastAPI app containing only the demo
routers, rather than importing the shared app.main `app` — that keeps
these tests independent of whether DEMO_MODE was set before some other
test module already imported and cached app.main with it off. The demo
SQLite database itself (backend/demo_data.sqlite3) is real, reset and
reseeded at the start of this module so results are deterministic.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.demo_patient import router as demo_patient_router
from app.api.demo_provider import router as demo_provider_router
from app.demo import repository, seed
from app.demo.db import init_db, reset_db

test_app = FastAPI()
test_app.include_router(demo_patient_router)
test_app.include_router(demo_provider_router)
client = TestClient(test_app)


def setup_module() -> None:
    reset_db()
    init_db()
    seed.ensure_seeded()


def _provider_token() -> str:
    response = client.post(
        "/demo/provider/auth/sign-in",
        json={"email": "anjali.silva@clinic.lk", "password": "anything"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers() -> dict:
    return {"Authorization": f"Bearer {_provider_token()}"}


def test_provider_sign_in_returns_token_and_profile():
    response = client.post(
        "/demo/provider/auth/sign-in",
        json={"email": "anjali.silva@clinic.lk", "password": "anything"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"] == seed.DEMO_PROVIDER_ID
    assert body["provider"]["name"] == "Dr. Anjali Silva"


def test_provider_routes_require_auth():
    response = client.get("/demo/provider/patients")
    assert response.status_code == 401


def test_dashboard_summary_counts_match_seed_data():
    response = client.get("/demo/provider/dashboard/summary", headers=auth_headers())
    assert response.status_code == 200
    body = response.json()
    assert body["totalPatients"] == 6
    # Exact counts from the seeded risk spread (see app/demo/seed.py):
    # 2 high (Ruwan: stopped, Chamari: BP), 1 medium (Kamala: low supply),
    # 2 pending (Nimal, Sunil have no check-in), 1 low (Priyani).
    assert body["highRisk"] == 2
    assert body["mediumRisk"] == 1
    assert body["pendingReview"] == 2


def test_priority_queue_sorted_high_risk_first():
    response = client.get("/demo/provider/patients", headers=auth_headers())
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 6
    risk_order = {"high": 0, "medium": 1, "pending": 2, "low": 3}
    levels = [risk_order[r["riskLevel"]] for r in rows]
    assert levels == sorted(levels)  # high-risk patients appear first


def test_priority_queue_filters_by_risk():
    response = client.get(
        "/demo/provider/patients", params={"risk": "high"}, headers=auth_headers()
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 2
    assert all(r["riskLevel"] == "high" for r in rows)


def test_patient_detail_returns_risk_evidence_and_summary():
    response = client.get(
        "/demo/provider/patients/demo-patient-ruwan", headers=auth_headers()
    )
    assert response.status_code == 200
    body = response.json()
    assert body["patient"]["name"] == "Ruwan Bandara"
    assert body["riskLevel"] == "high"
    assert "MEDICATION_STOPPED" in body["latestCheckIn"]["reason_codes"]
    assert body["latestCheckIn"]["summary"]  # fallback summary present
    assert body["medications"]  # at least one seeded medication


def test_patient_detail_404_for_unknown_patient():
    response = client.get(
        "/demo/provider/patients/does-not-exist", headers=auth_headers()
    )
    assert response.status_code == 404


def test_create_and_list_follow_up():
    response = client.post(
        "/demo/provider/patients/demo-patient-kamala/follow-up",
        json={
            "contact_method": "Phone",
            "notes": "Discussed missed doses and supply.",
            "next_action": "Check in again next week.",
            "alert_status": "Follow-up Recorded",
            "next_action_date": "2026-08-20",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 200
    saved = response.json()
    assert saved["contact_method"] == "Phone"
    assert saved["alert_status"] == "Follow-up Recorded"

    history = client.get(
        "/demo/provider/patients/demo-patient-kamala/follow-ups", headers=auth_headers()
    )
    assert history.status_code == 200
    items = history.json()
    assert len(items) == 1
    assert items[0]["id"] == saved["id"]

    # And it should now show up as this patient's current alert status
    # in the priority queue too.
    queue = client.get("/demo/provider/patients", headers=auth_headers()).json()
    kamala = next(r for r in queue if r["id"] == "demo-patient-kamala")
    assert kamala["alertStatus"] == "Follow-up Recorded"


def test_follow_up_rejects_invalid_contact_method():
    response = client.post(
        "/demo/provider/patients/demo-patient-priyani/follow-up",
        json={
            "contact_method": "Carrier Pigeon",
            "alert_status": "New",
        },
        headers=auth_headers(),
    )
    assert response.status_code == 422
