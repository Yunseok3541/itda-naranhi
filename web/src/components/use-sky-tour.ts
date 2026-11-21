'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { FOV_MAX, RAD, skyView, type SkyView } from '@/lib/sky-view';

const reducedMotion = '(prefers-reduced-motion: reduce)';
const idleTime = 3000;
const viewingTime = 3700;
/** 한 번 이동할 때 화면에서 보이는 거리. 기존(고도 52°에서 경도 12°)과 같은 속도 */
const step = 7.5 * RAD;
/** 이동과 이동 사이(멈춘 상태)에서만 방향을 바꾸고, 한 번에 이만큼까지만 꺾는다 */
const maxTurn = 60 * RAD;
/** 지평선·캐릭터가 크게 출렁이지 않도록 고도 범위를 제한 */
const latMin = 35 * RAD;
const latMax = 65 * RAD;
/** 자동 축소 속도: 1초에 시야가 이 배율만큼 넓어짐 (가장 확대한 6° → 100°까지 약 37초, 30° → 100°는 약 16초) */
const zoomOutRate = 1.08;

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
    // 화면 위 진행 방향(라디안, 0 = 왼쪽으로 흐름). 멀미를 막으려고 한 번에 조금씩만 꺾고 되돌아가지 않는다
    // 출발 방향은 무작위 (0으로 두면 한동안 왼쪽으로만 돌아 파노라마처럼 보임). 멈춘 상태에서 정하므로 멀미와는 무관
    let heading = (Math.random() * 2 - 1) * Math.PI;

    function nextStop(from: SkyView): SkyView {
      heading += (Math.random() * 2 - 1) * maxTurn;
      heading = Math.atan2(Math.sin(heading), Math.cos(heading));
      // 고도 끝에 닿았거나(사용자가 범위 밖으로 끌어 놓은 경우 포함) 더 벗어나려 하면,
      // 되돌아가지 않고 수평으로 눕혀서 옆으로 흐른다 (최대 90°만 꺾임). 이후 무작위로 꺾이며 범위 안으로 들어온다
      const toward = from.lat + step * Math.sin(heading);
      if ((toward > latMax && heading > 0) || (toward < latMin && heading < 0)) {
        heading = Math.cos(heading) >= 0 ? 0 : Math.PI;
      }
      const dLat = step * Math.sin(heading);
      const dLon = step * Math.cos(heading) / Math.max(Math.cos(from.lat), 0.3);
      return { ...from, lon: from.lon + dLon, lat: from.lat + dLat };
    }

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
        // 확대해 둔 상태면 먼저 제자리에서 천천히 끝까지 축소한다 (돌리기와 섞지 않음)
        // 일정한 비율 속도로 한 번에 이어서 줄여야 화면이 출렁이지 않는다
        touring = true;
        const duration = Math.log(FOV_MAX / from.fov) / Math.log(zoomOutRate) * 1000;
        skyView.flyTo({ ...from, fov: FOV_MAX }, duration, {
          onArrival: () => {
            touring = false;
            schedule(viewingTime);
          },
        });
        return;
      }
      touring = true;
      skyView.flyTo(nextStop(from), 8500, {
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
