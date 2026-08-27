/**
 * Local write queue for BP readings and check-in submissions made while
 * offline, plus the app-wide sync-status store the Home screen's status
 * dot reads from.
 *
 * Deliberately built on AsyncStorage + "retry when a network error is
 * seen" rather than a connectivity-detection library — this app's stated
 * policy (see BottomNav.tsx and BPTrendChart.tsx) is to avoid new native
 * dependencies that can't be verified installing/linking without a real
 * device or simulator in this build sandbox. api/client.ts's request()
 * already throws a distinguishable "Could not reach the backend…" Error
 * whenever fetch() itself fails (as opposed to the server responding
 * with an error status) — that's what "offline" means here, and it's
 * exactly the signal a real connectivity check would also be reacting to.
 */

import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import type { SupplyBucket } from "../types";

const QUEUE_KEY = "carepulse:offline_queue";

export type SyncState = "idle" | "syncing" | "offline" | "synced";

interface QueuedBPReading {
  kind: "bp_reading";
  id: string;
  createdAt: string;
  payload: {
    systolic: number;
    diastolic: number;
    pulse: number | null;
    notes: string | null;
    measured_at: string;
  };
}

interface QueuedCheckIn {
  kind: "check_in";
  // Doubles as the idempotency key sent on every retry — see
  // api/client.ts's submitCheckIn() for why that has to stay stable.
  id: string;
  createdAt: string;
  payload: {
    missed_doses: boolean;
    missed_dose_count: number | null;
    medication_stopped: boolean;
    supply_bucket: SupplyBucket;
    difficulty_reported: boolean;
    difficulty_text: string | null;
    patient_submitted_at: string;
  };
}

export type QueuedItem = QueuedBPReading | QueuedCheckIn;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True only for the specific "fetch itself failed" error api/client.ts throws — never a 4xx/5xx ApiError. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith("Could not reach the backend");
}

async function readQueue(): Promise<QueuedItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedItem[]) : [];
}

async function writeQueue(items: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

// --- Sync-status store (plain module-level pub/sub, read via useSyncStatus) ---

let snapshot: { state: SyncState; pendingCount: number } = { state: "idle", pendingCount: 0 };
const listeners = new Set<() => void>();

function publish(state: SyncState, pendingCount: number) {
  snapshot = { state, pendingCount };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return snapshot;
}

export function useSyncStatus(): { state: SyncState; pendingCount: number } {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function getPendingCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function enqueueBPReading(payload: QueuedBPReading["payload"]): Promise<void> {
  const queue = await readQueue();
  queue.push({ kind: "bp_reading", id: makeId("bp"), createdAt: new Date().toISOString(), payload });
  await writeQueue(queue);
  publish("offline", queue.length);
}

/** Returns the idempotency key the queued check-in was assigned, for CheckInSubmittedScreen to display. */
export async function enqueueCheckIn(payload: QueuedCheckIn["payload"]): Promise<string> {
  const id = makeId("checkin");
  const queue = await readQueue();
  queue.push({ kind: "check_in", id, createdAt: new Date().toISOString(), payload });
  await writeQueue(queue);
  publish("offline", queue.length);
  return id;
}

/**
 * Attempts every queued item in order (oldest first). A network-error
 * failure means the device is still offline — that item and everything
 * after it (order matters: a later check-in shouldn't sync before an
 * earlier one) stay queued and flushing stops there. Any other failure
 * (validation, auth, etc.) can't be fixed by retrying automatically, so
 * that single item is dropped and the rest still get a chance.
 */
export async function flushQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) {
    publish("synced", 0);
    return;
  }

  publish("syncing", queue.length);
  let stoppedAt = -1;
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    try {
      if (item.kind === "bp_reading") {
        await api.saveBPReading(item.payload);
      } else {
        await api.submitCheckIn(item.payload, item.id);
      }
    } catch (e) {
      if (isNetworkError(e)) {
        stoppedAt = i;
        break;
      }
      // Non-network failure — nothing more an automatic retry can do.
    }
  }

  const remaining = stoppedAt === -1 ? [] : queue.slice(stoppedAt);
  await writeQueue(remaining);
  publish(remaining.length > 0 ? "offline" : "synced", remaining.length);
}
