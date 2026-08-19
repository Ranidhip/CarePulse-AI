-- CarePulse AI — agent workflow tables (Phase 1 of AI-agent integration)
--
-- Purely additive. Does not modify, drop, or rename anything in
-- 20260811043241_init_schema (2).sql. Adds the three tables needed to
-- persist the three-agent workflow (analysis, coordination, safety review)
-- and its auditable actions, reusing existing tables (risk_assessments,
-- risk_reasons, alerts, audit_logs) for everything they already cover.
--
-- Apply via the Supabase SQL Editor, or `supabase db push` /
-- `supabase migration up` if you're using the CLI against a linked project.
--
-- Before applying: confirm the original init_schema migration has already
-- been run against this project (public.users, public.patient_profiles,
-- public.weekly_check_ins, public.alerts, etc. should already exist, along
-- with the public.has_active_assignment() and public.risk_level type this
-- file depends on). This migration will fail loudly if those are missing,
-- rather than silently creating a partial/inconsistent schema.

-- ============================================================
-- 1. Enum types
-- ============================================================

create type agent_run_status as enum ('running', 'completed', 'failed', 'manual_review');

-- Enforces "exactly three agents" at the database level, not just in code.
create type agent_name as enum (
  'CheckInAnalysisAgent',
  'FollowUpCoordinatorAgent',
  'ClinicalSafetyAgent'
);

create type agent_action_status as enum ('success', 'failed', 'skipped');

create type follow_up_task_type as enum (
  'nurse_review',
  'pharmacist_review',
  'doctor_review',
  'reminder',
  'other'
);

create type follow_up_task_status as enum ('pending', 'in_progress', 'completed', 'dismissed');

-- ============================================================
-- 2. Tables
-- ============================================================

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null unique references public.weekly_check_ins(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  status agent_run_status not null default 'running',
  model text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
-- unique(check_in_id): at most one agent run per check-in. A retry of the
-- same idempotency key must update this row, never insert a second one —
-- this is the DB-level backstop for "duplicate check-in does not duplicate
-- agent actions."

create table public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  agent_name agent_name not null,
  action_type text not null,
  tool_name text not null,
  tool_input jsonb not null default '{}'::jsonb,
  tool_output jsonb,
  status agent_action_status not null default 'success',
  requires_provider_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete set null,
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  task_type follow_up_task_type not null,
  priority risk_level not null,
  rationale text not null,
  status follow_up_task_status not null default 'pending',
  provider_id uuid references public.provider_profiles(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
-- alert_id is nullable: not every task (e.g. a proposed reminder) maps to
-- an alert. agent_run_id is not null: every row here is agent-created —
-- provider-initiated actions continue to use the existing
-- follow_up_actions table, unchanged.

-- ============================================================
-- 3. Indexes
-- ============================================================

create index on public.agent_runs (check_in_id);
create index on public.agent_runs (patient_id);
create index on public.agent_runs (status);
create index on public.agent_actions (agent_run_id);
create index on public.follow_up_tasks (patient_id);
create index on public.follow_up_tasks (alert_id);
create index on public.follow_up_tasks (agent_run_id);
create index on public.follow_up_tasks (provider_id);
create index on public.follow_up_tasks (status);

-- ============================================================
-- 4. Row-Level Security
-- ============================================================
-- Same pattern as the rest of the schema: providers see rows for patients
-- they have an ACTIVE assignment to, via the existing has_active_assignment()
-- helper. The backend's service-role key bypasses RLS (per
-- core/security.py's trust-boundary note) — this is defense-in-depth, not
-- the primary access control. No patient-facing policies: this workflow
-- data is provider/internal only, same treatment as audit_logs.

alter table public.agent_runs enable row level security;
create policy "provider reads agent runs for assigned patients"
  on public.agent_runs for select
  using (public.has_active_assignment(patient_id));

alter table public.agent_actions enable row level security;
create policy "provider reads agent actions for assigned patients"
  on public.agent_actions for select
  using (exists (
    select 1 from public.agent_runs r
    where r.id = agent_run_id and public.has_active_assignment(r.patient_id)
  ));

alter table public.follow_up_tasks enable row level security;
create policy "provider reads and updates follow-up tasks for assigned patients"
  on public.follow_up_tasks for all
  using (public.has_active_assignment(patient_id));
