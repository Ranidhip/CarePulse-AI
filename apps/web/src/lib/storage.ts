/**
 * Local demo data layer. Persists via localStorage so refreshing the
 * browser never loses data (acceptance criterion #10). Seeds only when no
 * saved data exists (criterion re: seeding), and exposes a reset function
 * for the "Reset Demo Data" control.
 *
 * This mirrors what the real Supabase-backed backend would store; see
 * openspec/changes/carepulse-working-prototype/proposal.md for why this
 * prototype uses a local layer instead of the live API.
 */

import type { CheckIn, FollowUpAction, Patient } from "../types";

const KEYS = {
  patients: "carepulse:patients",
  checkIns: "carepulse:checkins",
  followUps: "carepulse:followups",
  seeded: "carepulse:seeded",
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const db = {
  getPatients(): Patient[] {
    return read<Patient[]>(KEYS.patients, []);
  },
  setPatients(patients: Patient[]): void {
    write(KEYS.patients, patients);
  },
  getPatient(id: string): Patient | undefined {
    return this.getPatients().find((p) => p.id === id);
  },

  getCheckIns(): CheckIn[] {
    return read<CheckIn[]>(KEYS.checkIns, []);
  },
  setCheckIns(checkIns: CheckIn[]): void {
    write(KEYS.checkIns, checkIns);
  },
  addCheckIn(checkIn: CheckIn): void {
    const all = this.getCheckIns();
    all.push(checkIn);
    this.setCheckIns(all);
  },
  getLatestCheckIn(patientId: string): CheckIn | undefined {
    const mine = this.getCheckIns()
      .filter((c) => c.patientId === patientId)
      .sort(
        (a, b) =>
          new Date(b.patientSubmittedAt).getTime() -
          new Date(a.patientSubmittedAt).getTime()
      );
    return mine[0];
  },

  getFollowUps(patientId: string): FollowUpAction[] {
    return read<FollowUpAction[]>(KEYS.followUps, []).filter(
      (f) => f.patientId === patientId
    );
  },
  addFollowUp(action: FollowUpAction): void {
    const all = read<FollowUpAction[]>(KEYS.followUps, []);
    all.unshift(action);
    write(KEYS.followUps, all);
  },

  isSeeded(): boolean {
    return read<boolean>(KEYS.seeded, false);
  },
  markSeeded(): void {
    write(KEYS.seeded, true);
  },

  resetAll(): void {
    localStorage.removeItem(KEYS.patients);
    localStorage.removeItem(KEYS.checkIns);
    localStorage.removeItem(KEYS.followUps);
    localStorage.removeItem(KEYS.seeded);
  },
};

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
