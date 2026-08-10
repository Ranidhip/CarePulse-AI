"""
Unit test for the health-check endpoint.

This is deliberately the first test in the project: if this fails, nothing
else in the backend can be trusted to run.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "carepulse-ai-backend"}
