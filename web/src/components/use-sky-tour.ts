'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { FOV_MAX, RAD, skyView } from '@/lib/sky-view';

const reducedMotion = '(prefers-reduced-motion: reduce)';
const idleTime = 3000;
/** 초당 천구 위 이동 거리. 기존 8.5초에 7.5° 구간의 평균 속도. */
const driftSpeed = 7.5 * RAD / 8.5;
const zoomOutRate = 1.08;
const overlaySelector = 'dialog[open], .night :is(.sheet, .night-list[open], .nstar-label), .sky-locked > .help';

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
    const direction = Math.random() < 0.5 ? -1 : 1;

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
      if (!frame || skyView.isFlying() || document.querySelector(overlaySelector)) {
        schedule(800);
        return;
      }
      touring = true;
      let driftTime = 0;
      let sinceOverlayCheck = 0;
      skyView.glide((from, elapsed) => {
        sinceOverlayCheck += elapsed;
        if (sinceOverlayCheck >= 0.2) {
          sinceOverlayCheck = 0;
          if (document.querySelector(overlaySelector)) {
            touring = false;
            schedule(800);
            return null;
          }
        }
        // 넓은 시야로 천천히 돌아온 뒤, 한 방향으로 이어서 움직인다.
        if (from.fov < FOV_MAX) {
          return { ...from, fov: Math.min(FOV_MAX, from.fov * zoomOutRate ** elapsed) };
        }
        driftTime += elapsed;
        const ramp = Math.min(1, driftTime / 1.2);
        const distance = direction * driftSpeed * ramp * elapsed;
        return { ...from, lon: from.lon + distance / Math.max(Math.cos(from.lat), 0.3) };
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
