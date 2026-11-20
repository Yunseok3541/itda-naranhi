import type { Mode } from './mobile-data';

const key = 'naranhi-pending-constellation';
type Completion = { mode: Mode; attemptId: number; constellationId: number };

// Keep a one-time event for the next sky screen in this tab.
let pending: Completion | undefined;

export function queueConstellationCelebration(event: Completion) {
  pending = event;
  try { sessionStorage.setItem(key, JSON.stringify(event)); } catch { /* client navigation still has the event */ }
  return `/sky?completed=${event.attemptId}`;
}

export function consumeConstellationCelebration(mode: Mode, attemptId: number) {
  let event = pending;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored && !event) event = JSON.parse(stored) ?? undefined;
  } catch { /* ignore invalid or unavailable storage */ }
  if (event?.mode !== mode || event.attemptId !== attemptId || !Number.isSafeInteger(event.constellationId)) return;
  pending = undefined;
  try { sessionStorage.removeItem(key); } catch { /* the in-memory event is already consumed */ }
  return event.constellationId;
}
