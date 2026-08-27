-- Fixes infinite RLS recursion in the four identity-resolution helper
-- functions from the original init_schema migration. Confirmed live: an
-- authenticated patient querying blood_pressure_readings/
-- medication_schedules/weekly_check_ins directly via PostgREST (anon key
-- + user JWT) got Postgres error 54001 "stack depth limit exceeded"
-- instead of their own rows.
--
-- Root cause: none of these functions were `security definer`, so each
-- one's own internal query was ITSELF subject to RLS. e.g.
-- current_patient_id() reads patient_profiles, whose "provider reads
-- assigned patient profiles" policy calls has_active_assignment(), which
-- reads patient_provider_assignments, whose "patient reads own
-- assignments" policy calls current_patient_id() again -> infinite loop.
--
-- Fix: mark all four `security definer` (the standard Postgres/Supabase
-- pattern for exactly this problem) so each one resolves identity by
-- reading its target table as the function OWNER, bypassing RLS for that
-- one internal lookup — not for the caller's actual query, which is
-- still fully subject to RLS using whatever these functions return.
-- `set search_path = ''` (with fully-schema-qualified references) is the
-- accompanying best practice: without it, a security definer function is
-- a classic search-path-hijack target.
--
-- Purely a security/robustness fix — no behavior change for the
-- application today, since the FastAPI backend always uses the
-- service-role key (bypasses RLS entirely) and enforces authorization
-- itself via app/api/deps.py. This closes the gap for whoever adds a
-- Supabase Realtime subscription or a direct-client feature later, where
-- these policies would actually be evaluated for real.

create or replace function public.current_role()
returns user_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_patient_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.patient_profiles where user_id = auth.uid();
$$;

create or replace function public.current_provider_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.provider_profiles where user_id = auth.uid();
$$;

create or replace function public.has_active_assignment(target_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_provider_assignments
    where patient_id = target_patient_id
      and provider_id = public.current_provider_id()
      and is_active = true
  );
$$;
