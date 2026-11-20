'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { angleBetween, fitView, RAD, skyView, toLonLat, unit, type Vec3 } from '@/lib/sky-view';

const reducedMotion = '(prefers-reduced-motion: reduce)';
const idleTime = 3000;
const viewingTime = 3700;

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(reducedMotion);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

type ViewBand = { top: number; bottom: number };

export function useSkyTour(centers: Vec3[], skies: { points: Vec3[] }[], freeBand: () => ViewBand | undefined, onArrival: (index: number) => void) {
  const reducesMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(reducedMotion).matches, () => true);
  useEffect(() => {
    if (reducesMotion || centers.length < 2) return;
    const route = centers.map((center, index) => ({ lon: toLonLat(center).lon, index })).sort((a, b) => a.lon - b.lon);
    const held = new Set<number>();
    let timer = 0;
    let cursor: number | undefined;
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
      if (!frame || skyView.isFlying() || document.querySelector('dialog[open], .night :is(.sheet, .night-list[open], .char-bubble, .nstar-label, .sky-guide), .sky-locked > .help')) {
        schedule(800);
        return;
      }
      const from = skyView.get();
      const direction = unit(from.lon / RAD, from.lat / RAD);
      const { width, height } = frame;
      const band = freeBand();
      function targetView(index: number) {
        const fit = fitView(skies[index].points, width, height, band);
        return { ...fit, lat: Math.max(0, fit.lat) };
      }
      if (cursor === undefined) {
        const distances = route.map(stop => angleBetween(direction, centers[stop.index]));
        cursor = distances.indexOf(Math.min(...distances));
        const nearest = targetView(route[cursor].index);
        const offset = angleBetween(direction, unit(nearest.lon / RAD, nearest.lat / RAD));
        if (offset < 4 * RAD && Math.abs(Math.log(from.fov / nearest.fov)) < 0.14) cursor = (cursor + 1) % route.length;
      }
      const destination = route[cursor];
      const target = targetView(destination.index);
      const degrees = angleBetween(direction, unit(target.lon / RAD, target.lat / RAD)) / RAD;
      const duration = Math.max(1800, Math.min(7800, degrees * 125));
      touring = true;
      skyView.flyTo(target, duration, {
        onArrival: () => {
          touring = false;
          cursor = ((cursor ?? 0) + 1) % route.length;
          onArrival(destination.index);
          schedule(viewingTime);
        },
      });
    }

    function activity() {
      stop();
      cursor = undefined;
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
  }, [centers, freeBand, onArrival, reducesMotion, skies]);
}
