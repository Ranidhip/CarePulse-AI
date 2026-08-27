-- Adds the Record Follow-up form fields that had UI on the wireframe
-- (screen "05 — Record Follow-up") but nowhere to persist to: who was
-- contacted, when the contact actually happened, who the follow-up is
-- assigned to, whether the patient should be notified in-app, and when
-- the next action is due. Also gives next_advice its own column —
-- previously the web app encoded it into note_text with a "\nNext
-- advice: " marker and split it back apart on read (see
-- apps/web/src/lib/providerApi.ts's splitNoteText/NEXT_ADVICE_PREFIX),
-- purely because there was no dedicated column for it. That marker-based
-- splitting stays in the frontend only as a read-path fallback for rows
-- written before this migration; every new write goes straight to this
-- column.
--
-- next_action_date is what the Follow-up History screen's "Next
-- follow-up [date]" header line reads — before this column existed, the
-- date typed into the form was silently discarded on save.
--
-- assigned_to_provider_id is deliberately independent of provider_id
-- (which stays "who recorded this follow-up action"): a nurse can record
-- a follow-up and assign the *next* action to the supervising doctor.

alter table public.follow_up_actions
  add column contacted_person text,
  add column follow_up_date date,
  add column follow_up_time time,
  add column assigned_to_provider_id uuid references public.provider_profiles(id),
  add column notify_patient boolean not null default false,
  add column next_action_date date,
  add column next_advice text;
