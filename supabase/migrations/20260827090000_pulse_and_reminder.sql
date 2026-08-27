-- P0 data-model gaps identified against the patient-app wireframes:
--   1. Record Blood Pressure / History showed an optional Pulse reading
--      and an optional Notes field that blood_pressure_readings had no
--      column for.
--   2. Medication List showed a per-medication Reminder ON/OFF toggle
--      that medication_schedules had no column for.
-- Both are additive, nullable-or-defaulted columns — safe to apply
-- without touching existing rows or RLS policies (already permissive
-- "for all" / "select" policies on both tables cover new columns too).

alter table public.blood_pressure_readings
  add column pulse int,
  add column notes text;

alter table public.medication_schedules
  add column reminder_enabled boolean not null default true;
