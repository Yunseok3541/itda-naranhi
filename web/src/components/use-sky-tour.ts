'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { FOV_MAX, RAD, skyView } from '@/lib/sky-view';

const reducedMotion = '(prefers-reduced-motion: reduce)';
const idleTime = 3000;
const viewingTime = 3700;

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(reducedMotion);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export function useSkyTour() {
  const reducesMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(reducedMotion).matches, () => true);
  useEffect(() => {
    if (reducesMotion) return;
    const held = new Set<number>();
    let timer = 0;
    let touring = false;

    function stop() {
      window.clearTimeout(timer);
      if (touring) skyView.stopFlight();
      touring = false;
    }

    function schedule(delay = idleTime) {
      window.clearTimeout(timer);
      if (!document.hidden && !held.size) timer = window.setTimeout(visit, delay);
    }

    function visit() {
      const frame = skyView.frame();
      if (!frame || skyView.isFlying() || document.querySelector('dialog[open], .night :is(.sheet, .night-list[open], .char-bubble, .nstar-label), .sky-locked > .help')) {
        schedule(800);
        return;
      }
      const from = skyView.get();
      if (from.fov < FOV_MAX - 3 * RAD) {
        schedule();
        return;
      }
      touring = true;
      skyView.flyTo({ ...from, lon: from.lon + 12 * RAD }, 8500, {
        onArrival: () => {
          touring = false;
          schedule(viewingTime);
        },
      });
    }

    function activity() {
      stop();
      schedule();
    }

    function pointerDown(event: PointerEvent) { held.add(event.pointerId); activity(); }
    function pointerEnd(event: PointerEvent) { held.delete(event.pointerId); schedule(); }
    function blur() { held.clear(); activity(); }

    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointerup', pointerEnd, true);
    window.addEventListener('pointercancel', pointerEnd, true);
    window.addEventListener('wheel', activity, { passive: true });
    window.addEventListener('keydown', activity, true);
    window.addEventListener('click', activity, true);
    window.addEventListener('focusin', activity);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', activity);
    document.addEventListener('visibilitychange', activity);
    schedule();
    return () => {
      stop();
      window.removeEventListener('pointerdown', pointerDown, true);
      window.removeEventListener('pointerup', pointerEnd, true);
      window.removeEventListener('pointercancel', pointerEnd, true);
      window.removeEventListener('wheel', activity);
      window.removeEventListener('keydown', activity, true);
      window.removeEventListener('click', activity, true);
      window.removeEventListener('focusin', activity);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', activity);
      document.removeEventListener('visibilitychange', activity);
    };
  }, [reducesMotion]);
}
