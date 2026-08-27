-- Adds provider feedback on AI-generated summaries to risk_assessments.
-- A provider reviewing an AI-generated summary on the Risk Assessment
-- Review screen can mark it Helpful, Not helpful, or Report an issue
-- (with an optional note on the latter). This never edits or hides the
-- original summary (audit trail stays intact) — it only records what a
-- human thought of it alongside it.
--
-- Superseded design: this migration originally added a single
-- flagged_incorrect boolean. It was never applied (caught before this
-- file was run against any real database), so it was safe to redesign
-- in place as a tri-state feedback column instead of layering a second,
-- overlapping migration on top of an unused one.

create type risk_assessment_feedback as enum ('helpful', 'not_helpful', 'reported');

alter table public.risk_assessments
  add column feedback risk_assessment_feedback,
  add column feedback_at timestamptz,
  add column feedback_by uuid references public.provider_profiles(id),
  add column feedback_note text;
