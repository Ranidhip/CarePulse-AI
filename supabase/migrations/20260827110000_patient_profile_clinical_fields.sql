-- Adds the patient-context fields the Patient Record screen's header
-- shows alongside name/age/contact (see PHASE6_FILES.txt provider
-- dashboard wireframes, screen "03 — Patient Record"): the clinical
-- condition being tracked, which clinic the patient belongs to, and when
-- they were enrolled. None of these existed anywhere in the schema
-- before this migration — the header previously had nowhere to read
-- them from.
--
-- All three are nullable (condition/clinic) or backfilled with a default
-- (enrolled_at) so existing patient_profiles rows remain valid without a
-- manual backfill step.

alter table public.patient_profiles
  add column condition text,
  add column clinic text,
  add column enrolled_at timestamptz not null default now();
