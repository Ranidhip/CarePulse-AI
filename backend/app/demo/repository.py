"""
Plain CRUD functions over the demo SQLite database. Deliberately not an
ORM — this is a prototype-scale demo layer, not the production data
access path (that remains Supabase via app.core.security).
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.demo.db import get_connection


def get_patient(patient_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM demo_patients WHERE id = ?", (patient_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def find_patient_by_email(email: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM demo_patients WHERE lower(email) = lower(?)", (email,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_all_patients() -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM demo_patients").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def list_medications(patient_id: str) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM demo_medications WHERE patient_id = ? ORDER BY scheduled_time",
            (patient_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def add_bp_reading(
    patient_id: str,
    systolic: int,
    diastolic: int,
    pulse: int | None,
    measured_at: str,
    notes: str | None,
) -> dict[str, Any]:
    conn = get_connection()
    try:
        reading_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO demo_bp_readings
               (id, patient_id, systolic, diastolic, pulse, measured_at, notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (reading_id, patient_id, systolic, diastolic, pulse, measured_at, notes, created_at),
        )
        conn.commit()
        return {
            "id": reading_id,
            "patient_id": patient_id,
            "systolic": systolic,
            "diastolic": diastolic,
            "pulse": pulse,
            "measured_at": measured_at,
            "notes": notes,
        }
    finally:
        conn.close()


def list_bp_readings(patient_id: str) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM demo_bp_readings WHERE patient_id = ?
               ORDER BY measured_at DESC""",
            (patient_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_latest_bp_reading(patient_id: str) -> dict[str, Any] | None:
    readings = list_bp_readings(patient_id)
    return readings[0] if readings else None


def add_checkin(
    patient_id: str,
    missed_doses: bool,
    missed_dose_count: int | None,
    medication_stopped: bool,
    supply_bucket: str,
    supply_remaining: bool,
    systolic: int | None,
    diastolic: int | None,
    difficulty_reported: bool,
    difficulty_text: str | None,
    patient_submitted_at: str,
    risk_level: str,
    reason_codes: list[str],
    rule_version: str,
    summary: str,
) -> dict[str, Any]:
    conn = get_connection()
    try:
        checkin_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO demo_checkins
               (id, patient_id, missed_doses, missed_dose_count, medication_stopped,
                supply_bucket, supply_remaining, systolic, diastolic,
                difficulty_reported, difficulty_text, patient_submitted_at,
                risk_level, reason_codes, rule_version, summary, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                checkin_id,
                patient_id,
                int(missed_doses),
                missed_dose_count,
                int(medication_stopped),
                supply_bucket,
                int(supply_remaining),
                systolic,
                diastolic,
                int(difficulty_reported),
                difficulty_text,
                patient_submitted_at,
                risk_level,
                json.dumps(reason_codes),
                rule_version,
                summary,
                created_at,
            ),
        )
        conn.commit()
        return {
            "id": checkin_id,
            "patient_id": patient_id,
            "risk_level": risk_level,
            "reason_codes": reason_codes,
            "rule_version": rule_version,
            "summary": summary,
            "patient_submitted_at": patient_submitted_at,
        }
    finally:
        conn.close()


def list_checkins(patient_id: str) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM demo_checkins WHERE patient_id = ?
               ORDER BY patient_submitted_at DESC""",
            (patient_id,),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["reason_codes"] = json.loads(d["reason_codes"])
            result.append(d)
        return result
    finally:
        conn.close()


def get_latest_checkin(patient_id: str) -> dict[str, Any] | None:
    checkins = list_checkins(patient_id)
    return checkins[0] if checkins else None


def add_follow_up(
    patient_id: str,
    provider_id: str,
    contact_method: str,
    notes: str | None,
    next_action: str | None,
    alert_status: str,
    next_action_date: str | None,
) -> dict[str, Any]:
    conn = get_connection()
    try:
        follow_up_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO demo_follow_ups
               (id, patient_id, provider_id, contact_method, notes, next_action,
                alert_status, next_action_date, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                follow_up_id, patient_id, provider_id, contact_method, notes,
                next_action, alert_status, next_action_date, created_at,
            ),
        )
        conn.commit()
        return {
            "id": follow_up_id,
            "patient_id": patient_id,
            "provider_id": provider_id,
            "contact_method": contact_method,
            "notes": notes,
            "next_action": next_action,
            "alert_status": alert_status,
            "next_action_date": next_action_date,
            "created_at": created_at,
        }
    finally:
        conn.close()


def list_follow_ups(patient_id: str) -> list[dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT * FROM demo_follow_ups WHERE patient_id = ?
               ORDER BY created_at DESC""",
            (patient_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_latest_follow_up(patient_id: str) -> dict[str, Any] | None:
    items = list_follow_ups(patient_id)
    return items[0] if items else None


# --- Provider ---


def get_provider(provider_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM demo_providers WHERE id = ?", (provider_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def find_provider_by_email(email: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM demo_providers WHERE lower(email) = lower(?)", (email,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_patient_summary(patient_id: str) -> dict[str, Any]:
    """
    Everything the provider Priority Queue / Patient Record screens need
    for one patient, assembled from the existing per-table functions —
    no duplicated data, no separately-computed risk.
    """
    patient = get_patient(patient_id)
    latest_checkin = get_latest_checkin(patient_id)
    latest_bp = get_latest_bp_reading(patient_id)
    latest_follow_up = get_latest_follow_up(patient_id)
    return {
        "patient": patient,
        "latestCheckIn": latest_checkin,
        "latestBP": latest_bp,
        "latestFollowUp": latest_follow_up,
    }


def list_patient_summaries() -> list[dict[str, Any]]:
    return [get_patient_summary(p["id"]) for p in list_all_patients()]
