-- CarePulse AI — initial schema
-- Generated from docs/01-erd-api-contract.md
--
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query),
-- or via `supabase db reset` if you later switch to CLI-managed migrations.
--
-- Safe to re-run from scratch on an EMPTY project. If you've already run part
-- of this, ask before rerunning — it does not use "IF NOT EXISTS" everywhere,
-- to avoid silently masking mistakes during development.

-- ============================================================
-- 1. Enum types
-- ============================================================

create type user_role as enum ('patient', 'provider', 'admin');
create type supply_status as enum ('adequate', 'low', 'out');
create type risk_level as enum ('low', 'medium', 'high');
create type ai_status as enum ('completed', 'pending', 'failed');
create type reason_source as enum ('rule', 'ai');
create type alert_status as enum ('open', 'acknowledged', 'resolved');
create type followup_action_type as enum ('note', 'phone_call', 'reassignment', 'status_update');
create type followup_outcome as enum ('contacted', 'unreachable', 'referred_to_doctor', 'medication_supply_issue_reported', 'other');
create type followup_status as enum ('needs_review', 'in_progress', 'completed');
create type reason_code as enum (
  'MISSED_DOSES', 'MEDICATION_STOPPED', 'LOW_SUPPLY', 'SIDE_EFFECTS',
  'SCHEDULE_DIFFICULTY', 'ABNORMAL_BP', 'REPEATED_NONRESPONSE', 'OTHER'
);

-- ============================================================
-- 2. Tables
-- ============================================================

-- Identity -----------------------------------------------------

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text not null,
  age int,
  contact_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text not null,
  role_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Access ---------------------------------------------------------

create table public.patient_provider_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  consent_version text not null,
  consented_at timestamptz not null default now()
);

-- Patient tracking -------------------------------------------------

create table public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  medication_name text not null,
  dosage_description text,
  scheduled_time text,
  supply_status supply_status not null default 'adequate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.weekly_check_ins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  idempotency_key text not null unique,
  missed_doses boolean not null,
  missed_dose_count int,
  medication_stopped boolean not null,
  supply_remaining boolean not null,
  difficulty_reported boolean not null default false,
  difficulty_text text,
  requests_contact boolean not null default false,
  patient_submitted_at timestamptz not null,
  server_received_at timestamptz not null default now()
);

create table public.blood_pressure_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  systolic int not null,
  diastolic int not null,
  measured_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  source_check_in_id uuid references public.weekly_check_ins(id) on delete set null
);

-- Assessment ---------------------------------------------------------

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.weekly_check_ins(id) on delete cascade,
  rule_result_level risk_level not null,
  rule_version text not null,
  ai_suggested_level risk_level,
  ai_confidence numeric(3,2),
  requires_manual_review boolean not null default false,
  final_level risk_level not null,
  provider_summary text,
  ai_status ai_status not null default 'pending',
  model_version text,
  created_at timestamptz not null default now()
);

create table public.risk_reasons (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  reason_code reason_code not null,
  source reason_source not null,
  evidence_text text
);

-- Workflow ----------------------------------------------------------

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  status alert_status not null default 'open',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.provider_profiles(id)
);

create table public.follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  provider_id uuid not null references public.provider_profiles(id),
  action_type followup_action_type not null,
  note_text text,
  outcome followup_outcome,
  status followup_status not null default 'needs_review',
  created_at timestamptz not null default now()
);

-- Operations --------------------------------------------------------

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  notification_type text not null,
  sent_at timestamptz not null default now(),
  delivery_status text
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3. Indexes on common lookup columns
-- ============================================================

create index on public.patient_provider_assignments (patient_id);
create index on public.patient_provider_assignments (provider_id);
create index on public.medication_schedules (patient_id);
create index on public.weekly_check_ins (patient_id);
create index on public.blood_pressure_readings (patient_id);
create index on public.risk_assessments (check_in_id);
create index on public.risk_reasons (risk_assessment_id);
create index on public.alerts (patient_id);
create index on public.alerts (status);
create index on public.follow_up_actions (alert_id);
create index on public.audit_logs (target_type, target_id);

-- ============================================================
-- 4. Helper functions for RLS policies
-- ============================================================

create or replace function public.current_role()
returns user_role
language sql stable
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_patient_id()
returns uuid
language sql stable
as $$
  select id from public.patient_profiles where user_id = auth.uid();
$$;

create or replace function public.current_provider_id()
returns uuid
language sql stable
as $$
  select id from public.provider_profiles where user_id = auth.uid();
$$;

create or replace function public.has_active_assignment(target_patient_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.patient_provider_assignments
    where patient_id = target_patient_id
      and provider_id = public.current_provider_id()
      and is_active = true
  );
$$;

-- ============================================================
-- 5. Row-Level Security
-- ============================================================
-- Pattern used throughout: patients see only their own rows; providers see
-- rows for patients they have an ACTIVE assignment to; admin manages
-- identity/access tables only, never clinical content directly.
--
-- Tables not listed with any policy below (device_tokens, notification_logs,
-- audit_logs) have RLS enabled with NO policies — meaning only the backend's
-- service-role key (which bypasses RLS) can touch them. This is intentional:
-- clients should never write audit/notification records directly.

alter table public.users enable row level security;
create policy "users read own row" on public.users for select using (id = auth.uid());

alter table public.patient_profiles enable row level security;
create policy "patient reads own profile" on public.patient_profiles for select using (user_id = auth.uid());
create policy "patient updates own profile" on public.patient_profiles for update using (user_id = auth.uid());
create policy "provider reads assigned patient profiles" on public.patient_profiles for select using (public.has_active_assignment(id));
create policy "admin full access patient_profiles" on public.patient_profiles for all using (public.current_role() = 'admin');

alter table public.provider_profiles enable row level security;
create policy "provider reads own profile" on public.provider_profiles for select using (user_id = auth.uid());
create policy "admin full access provider_profiles" on public.provider_profiles for all using (public.current_role() = 'admin');

alter table public.patient_provider_assignments enable row level security;
create policy "patient reads own assignments" on public.patient_provider_assignments for select using (patient_id = public.current_patient_id());
create policy "provider reads own assignments" on public.patient_provider_assignments for select using (provider_id = public.current_provider_id());
create policy "admin manages assignments" on public.patient_provider_assignments for all using (public.current_role() = 'admin');

alter table public.consent_records enable row level security;
create policy "patient manages own consent" on public.consent_records for all using (patient_id = public.current_patient_id());
create policy "provider reads assigned consent records" on public.consent_records for select using (public.has_active_assignment(patient_id));
create policy "admin full access consent_records" on public.consent_records for all using (public.current_role() = 'admin');

alter table public.medication_schedules enable row level security;
create policy "patient manages own medications" on public.medication_schedules for all using (patient_id = public.current_patient_id());
create policy "provider reads assigned medications" on public.medication_schedules for select using (public.has_active_assignment(patient_id));

alter table public.weekly_check_ins enable row level security;
create policy "patient inserts own check-ins" on public.weekly_check_ins for insert with check (patient_id = public.current_patient_id());
create policy "patient reads own check-ins" on public.weekly_check_ins for select using (patient_id = public.current_patient_id());
create policy "provider reads assigned check-ins" on public.weekly_check_ins for select using (public.has_active_assignment(patient_id));

alter table public.blood_pressure_readings enable row level security;
create policy "patient manages own bp readings" on public.blood_pressure_readings for all using (patient_id = public.current_patient_id());
create policy "provider reads assigned bp readings" on public.blood_pressure_readings for select using (public.has_active_assignment(patient_id));

alter table public.risk_assessments enable row level security;
create policy "provider reads assessments for assigned patients" on public.risk_assessments for select
  using (exists (
    select 1 from public.weekly_check_ins c
    where c.id = check_in_id and public.has_active_assignment(c.patient_id)
  ));

alter table public.risk_reasons enable row level security;
create policy "provider reads reasons for assigned patients" on public.risk_reasons for select
  using (exists (
    select 1 from public.risk_assessments a
    join public.weekly_check_ins c on c.id = a.check_in_id
    where a.id = risk_assessment_id and public.has_active_assignment(c.patient_id)
  ));

alter table public.alerts enable row level security;
create policy "provider reads and updates assigned alerts" on public.alerts for all using (public.has_active_assignment(patient_id));

alter table public.follow_up_actions enable row level security;
create policy "provider manages follow-ups for assigned alerts" on public.follow_up_actions for all
  using (exists (
    select 1 from public.alerts al
    where al.id = alert_id and public.has_active_assignment(al.patient_id)
  ));

alter table public.device_tokens enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_logs enable row level security;
-- (intentionally no policies on the three above — service-role only, see note)
