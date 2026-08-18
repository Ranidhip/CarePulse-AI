/**
 * AsyncStorage is used for exactly two things, per requirement: the
 * signed-in session (so the app doesn't ask you to sign in on every
 * launch) and the in-progress check-in draft (so answers survive
 * backgrounding the app mid-flow). All actual patient data — home,
 * medications, BP readings, check-ins, history — lives in the FastAPI
 * backend and is fetched fresh; it is never cached here.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CheckInDraft, PatientSession } from "../types";
import { EMPTY_CHECKIN_DRAFT } from "../types";

const KEYS = {
  session: "carepulse:session",
  draft: "carepulse:checkin_draft",
} as const;

export async function getSession(): Promise<PatientSession | null> {
  const raw = await AsyncStorage.getItem(KEYS.session);
  return raw ? (JSON.parse(raw) as PatientSession) : null;
}

export async function setSession(session: PatientSession): Promise<void> {
  await AsyncStorage.setItem(KEYS.session, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.session);
}

export async function getDraft(): Promise<CheckInDraft> {
  const raw = await AsyncStorage.getItem(KEYS.draft);
  return raw ? (JSON.parse(raw) as CheckInDraft) : EMPTY_CHECKIN_DRAFT;
}

export async function setDraft(draft: CheckInDraft): Promise<void> {
  await AsyncStorage.setItem(KEYS.draft, JSON.stringify(draft));
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.draft);
}
