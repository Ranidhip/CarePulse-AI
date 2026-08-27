-- Adds a real provider override of the risk LEVEL itself, distinct from
-- the tri-state feedback (helpful/not_helpful/reported) added by
-- 20260820090000_risk_assessment_flags.sql, which only rates the AI
-- summary's text quality and never changes what level is shown anywhere.
--
-- Unlike the AI (which may only ever raise the rule-derived level, never
-- lower it — see backend/app/services/agents/safety.py), a provider
-- override is a licensed clinician's final judgment call and may move the
-- level in either direction. It never edits or deletes rule_result_level,
-- ai_suggested_level, or final_level — those stay exactly as computed, so
-- the full "what the system concluded vs. what the provider decided"
-- audit trail stays intact.

alter table public.risk_assessments
  add column provider_override_level risk_level,
  add column provider_override_at timestamptz,
  add column provider_override_by uuid references public.provider_profiles(id),
  add column provider_override_reason text;
