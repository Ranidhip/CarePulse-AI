"""
Isolated demo-mode data layer.

This is a completely separate storage path from Supabase — a single
file-backed SQLite database, used only when DEMO_MODE=true. It exists
because the real Supabase seeding is currently blocked by a key-format
issue; this lets the mobile app, web dashboard, and rule engine all be
exercised end-to-end through the real FastAPI backend without depending
on that being fixed.

Nothing here touches supabase/migrations/, app/core/security.py, or any
production route. When DEMO_MODE is false (the default), this module is
never imported by main.py and the app behaves exactly as before.
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "demo_data.sqlite3"

SCHEMA = """
CREATE TABLE IF NOT EXISTS demo_patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    age INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_medications (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    reminder_on INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_bp_readings (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse INTEGER,
    measured_at TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_checkins (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    missed_doses INTEGER NOT NULL,
    missed_dose_count INTEGER,
    medication_stopped INTEGER NOT NULL,
    supply_bucket TEXT NOT NULL,
    supply_remaining INTEGER NOT NULL,
    systolic INTEGER,
    diastolic INTEGER,
    difficulty_reported INTEGER NOT NULL,
    difficulty_text TEXT,
    patient_submitted_at TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    reason_codes TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    clinic TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_follow_ups (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    contact_method TEXT NOT NULL,
    notes TEXT,
    next_action TEXT,
    alert_status TEXT NOT NULL,
    next_action_date TEXT,
    created_at TEXT NOT NULL
);
"""


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def reset_db() -> None:
    """Drops and recreates all demo tables. Used by the reset-demo-data endpoint."""
    conn = get_connection()
    try:
        conn.executescript(
            """
            DROP TABLE IF EXISTS demo_patients;
            DROP TABLE IF EXISTS demo_providers;
            DROP TABLE IF EXISTS demo_medications;
            DROP TABLE IF EXISTS demo_bp_readings;
            DROP TABLE IF EXISTS demo_checkins;
            DROP TABLE IF EXISTS demo_follow_ups;
            """
        )
        conn.commit()
    finally:
        conn.close()
    init_db()
