import type { SessionActivityEntry } from '@/lib/station/session-activity';
import { sessionActivityRepository } from './repositories/session-activity-repository';

type Entry = Omit<SessionActivityEntry, 'id' | 'recordedAt'> & { recordedAt?: string };
const pending: Omit<SessionActivityEntry, 'id'>[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> | undefined;

/** Diagnostics never block or reject a railway command. Bounded during storage outages. */
export function recordSessionActivity(entry: Entry) {
  if (pending.length >= 2000) {
    console.error('[session-activity] Buffer full; event dropped.');
    return;
  }
  pending.push({ ...entry, recordedAt: entry.recordedAt ?? new Date().toISOString() });
  if (!timer) {
    timer = setTimeout(() => {
      timer = undefined;
      void flushSessionActivity();
    }, 250);
    timer.unref?.();
  }
}

export async function flushSessionActivity(): Promise<void> {
  if (flushing) {
    await flushing;
    if (pending.length) return flushSessionActivity();
    return;
  }
  const batch = pending.splice(0, 2000);
  if (!batch.length) return;
  flushing = sessionActivityRepository
    .append(batch)
    .catch(() => {
      console.error('[session-activity] Could not persist activity batch.');
    })
    .finally(() => {
      flushing = undefined;
    });
  await flushing;
}
