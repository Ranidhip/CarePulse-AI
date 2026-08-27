-- Gives side effects their own signal, separate from difficulty_reported.
--
-- The mobile check-in flow (CheckInStep2Screen) has always asked "Did you
-- experience any side effects?" as its own Yes/No question, independent
-- of the "What made treatment difficult?" checkboxes — but with nowhere
-- of its own to go, CheckInReviewScreen folded it into difficulty_reported
-- via `sideEffectsReported === true || difficultyReasons.length > 0`
-- before submitting. A patient reporting side effects with no scheduling
-- difficulty was therefore recorded — and shown to the provider — as
-- SCHEDULE_DIFFICULTY, never as SIDE_EFFECTS (which has existed as a
-- reason_code enum value and a REASON_CODE_LABELS entry on the web
-- dashboard since it was introduced, but nothing ever produced it).
--
-- This migration adds the missing column; app/services/rules/engine.py
-- and the mobile submission payload are updated in the same change to
-- stop merging the two signals.

alter table public.weekly_check_ins
  add column side_effects_reported boolean not null default false,
  add column side_effects_text text;
