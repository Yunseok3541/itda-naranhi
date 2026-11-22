"use client";
// 메인 배경 "천구 뷰": 실제 별 위치(적경·적위)를 구 위에 놓고, 끌면 하늘이 돌아간다
// - 데이터: public/sky/celestial.json (5.5등급까지 별 2,851개 + 은하수 밝기 격자, 약 27KB 압축)
//   만드는 법·출처: scripts/build-celestial-data.mjs, 라이선스: public/sky/LICENSE-d3-celestial.txt
// - 시점은 lib/sky-view.ts에 함께 둔다 → 별자리 화면(night-sky)이 같은 시점으로 퀘스트 별을 올린다
// - 그림: Canvas 2D + 평사도법. 3D 라이브러리 없음, 시점이 바뀔 때만 다시 그림 (가만히 있으면 연산 0)
// - 조작: 한 손가락·마우스로 끌기, 두 손가락·휠로 확대, 방향키·+/- 키
// - 위치·시간·카메라 권한을 쓰지 않음 (실제 내 위치의 하늘이 아니라 별자리 지도)
// - 시작 안내 직후에는 별이 하나씩 반짝이며 켜짐 (lib/service-guide.ts 밤하늘 연출). 그동안만 매 프레임 그림
import { useEffect, useRef } from 'react';
import { lightenSkyReveal, skyRevealElapsed, skyRevealLite, subscribeSkyReveal } from '@/lib/service-guide';
import { projector, scaleFor, skyView, unit, type SkyView, type Vec3 } from '@/lib/sky-view';
import SkyPerson from '@/components/sky-person';
import { drawGround, drawSkyLight } from './sky-landscape';
import './sky-preview.css';

type Celestial = { stars: [number, number, number, number][]; milkyway: [number, number, number][] };

/** 배경 별 밝기 (퀘스트 별이 돋보이도록 전체를 조금 낮춤) */
const BACKGROUND_DIM = 0.72;

// 밤하늘 연출: 별마다 켜지는 차례(0~1.7초)에 0.52초 동안 반짝(잠깐 커졌다 제자리)하며 켜짐, 은하수는 0.5~2초에 번짐
const REVEAL_SPREAD_MS = 1700;
const STAR_FADE_MS = 520;
const REVEAL_STARS_END = REVEAL_SPREAD_MS + STAR_FADE_MS;
/** 밝은 별이 조금 먼저, 나머지는 하늘 전체에 흩어져 켜지도록 (같은 별은 늘 같은 차례) */
function revealDelay(index: number, count: number) {
  const noise = Math.abs(Math.sin(index * 12.9898) * 43758.5453) % 1;
  return REVEAL_SPREAD_MS * (0.4 * Math.sqrt(index / count) + 0.6 * noise);
}
/** 연출 초반(0.12~0.8초)에 이보다 긴 프레임(30fps 미만)이 3번 나오면 가벼운 연출로 */
const SLOW_FRAME_MS = 34;
const SLOW_FRAMES = 3;
const dustLightAt = (elapsed: number) => Math.max(0, Math.min(1, (elapsed - 500) / 1500));

// 페이지를 옮겨 다녀도 한 번만 받음
let dataPromise: Promise<Celestial> | null = null;
function loadCelestial() {
  dataPromise ??= fetch('/sky/celestial.json').then(r => {
    if (!r.ok) throw new Error(`celestial ${r.status}`);
    return r.json() as Promise<Celestial>;
  }).catch(error => { dataPromise = null; throw error; });
  return dataPromise;
}

/** 색지수(B-V) → 별빛 색 (푸른 별 ~ 붉은 별) */
function starColor(bv100: number) {
  const bv = bv100 / 100;
  if (bv < 0) return '196, 212, 255';
  if (bv < 0.4) return '232, 236, 255';
  if (bv < 0.8) return '255, 246, 228';
  if (bv < 1.3) return '255, 222, 182';
  return '255, 198, 156';
}

function turn(host: HTMLElement, dx: number, dy: number, dome: boolean) {
  const view = skyView.get();
  const perPixel = 1 / scaleFor(view.fov, host.clientWidth, host.clientHeight);
  // Longitude lines converge overhead. Keep a similar response to the same swipe across pitches.
  const horizontalScale = Math.max(0.3, Math.cos(view.lat));
  skyView.pan(dx * perPixel / horizontalScale, dy * perPixel, dome);
}

export default function SkyPanorama({ background = false, dome = false }: { background?: boolean; dome?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = surface.current;
    const stage = canvas.current;
    if (!host || !stage) return;
    const context = stage.getContext('2d');
    if (!context) return;
    let requested = 0;
    let alive = true;
    let dpr = 1;
    let raw: Celestial | null = null;
    // 미리 계산한 단위 벡터 (그릴 때마다 삼각함수를 다시 부르지 않게)
    let stars: { v: Vec3; alpha: number; sprite: HTMLCanvasElement; half: number; delay: number }[] = [];
    let dust: { v: Vec3; alpha: number }[] = [];
    /** 켜지는 차례대로 정렬한 별 번호 (가벼운 연출에서 다 켜진 별부터 모아 둠) */
    let revealOrder: number[] = [];
    /** 가벼운 연출: 시점이 그대로인 동안 은하수와 다 켜진 별을 모아 둔 그림. 매 프레임에는 지금 켜지는 별만 그림 */
    let lite: { view: SkyView; width: number; height: number; dust: HTMLCanvasElement; settled: HTMLCanvasElement;
      spots: ({ x: number; y: number; alpha: number } | null)[]; next: number } | null = null;

    // 은하수 칸·밝은 별 둘레를 그릴 부드러운 빛 점
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const g = glow.getContext('2d');
    if (g) {
      const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(214, 200, 255, 1)');
      gradient.addColorStop(1, 'rgba(214, 200, 255, 0)');
      g.fillStyle = gradient;
      g.fillRect(0, 0, 64, 64);
    }

    let paintedView: ReturnType<typeof skyView.get> | undefined;
    /** 아래쪽(지평선 빛)으로 갈수록 별이 옅어짐 */
    function fadeAt(y: number, altitude: number, height: number) {
      const horizonFade = height * 0.72;
      return dome ? Math.min(1, 0.25 + Math.max(0, altitude) * 5)
        : y < horizonFade ? 1 : Math.max(0, 1 - (y - horizonFade) / (height - horizonFade)) * 0.9 + 0.1;
    }
    const inside = (p: { x: number; y: number } | null, pad: number, width: number, height: number) =>
      !!p && p.x > -pad && p.x < width + pad && p.y > -pad && p.y < height + pad;
    const DUST_CELL = 3 * (Math.PI / 180) * 3.4; // 은하수 칸 간격 3°보다 크게 겹쳐 그려 덩어리 없이 이어지게
    function drawDust(target: CanvasRenderingContext2D, view: SkyView, width: number, height: number, light: number) {
      const project = projector(view, width, height);
      for (const d of dust) {
        if (dome && d.v[2] < 0) continue;
        const p = project(d.v);
        const size = p ? DUST_CELL * p.k : 0;
        if (!p || !inside(p, size, width, height)) continue;
        target.globalAlpha = d.alpha * fadeAt(p.y, d.v[2], height) * light;
        target.drawImage(glow, p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    /** 가벼운 연출의 한 프레임: 모아 둔 은하수·다 켜진 별 + 지금 켜지는 별만 */
    function drawLite(view: SkyView, width: number, height: number, elapsed: number) {
      if (!context) return;
      if (!lite || lite.view !== view || lite.width !== width || lite.height !== height) {
        const project = projector(view, width, height);
        const layer = () => Object.assign(document.createElement('canvas'), { width, height });
        const dustLayer = layer();
        drawDust(dustLayer.getContext('2d')!, view, width, height, 1);
        lite = { view, width, height, dust: dustLayer, settled: layer(), next: 0, spots: stars.map(s => {
          if (dome && s.v[2] < 0) return null;
          const p = project(s.v);
          return p && inside(p, s.half, width, height) ? { x: p.x, y: p.y, alpha: s.alpha * fadeAt(p.y, s.v[2], height) * BACKGROUND_DIM } : null;
        }) };
      }
      const settled = lite.settled.getContext('2d')!;
      while (lite.next < revealOrder.length) {
        const i = revealOrder[lite.next], s = stars[i], spot = lite.spots[i];
        if (s.delay + STAR_FADE_MS > elapsed) break;
        if (spot) { settled.globalAlpha = spot.alpha; settled.drawImage(s.sprite, spot.x - s.half, spot.y - s.half); }
        lite.next++;
      }
      context.clearRect(0, 0, width, height);
      if (dome) drawSkyLight(context, view, width, height);
      context.globalAlpha = dustLightAt(elapsed);
      context.drawImage(lite.dust, 0, 0);
      context.globalAlpha = 1;
      context.drawImage(lite.settled, 0, 0);
      for (let k = lite.next; k < revealOrder.length; k++) {
        const i = revealOrder[k], s = stars[i], spot = lite.spots[i];
        const t = (elapsed - s.delay) / STAR_FADE_MS;
        if (t <= 0) break;
        if (!spot) continue;
        const size = s.half * 2 * (1 + 0.9 * Math.sin(Math.PI * t));
        context.globalAlpha = spot.alpha * (1 - (1 - t) ** 2);
        context.drawImage(s.sprite, spot.x - size / 2, spot.y - size / 2, size, size);
      }
      context.globalAlpha = 1;
      if (dome) drawGround(context, view, width, height);
    }
    function draw() {
      if (!context || !stage || !host) return;
      const { width, height } = stage;
      const view = skyView.get();
      const moved = view !== paintedView;
      paintedView = view;
      const elapsed = skyRevealElapsed();
      const revealing = elapsed !== null && elapsed < REVEAL_STARS_END;
      // 가벼운 연출은 시점이 그대로일 때만 (끌어서 움직이는 중이면 아래처럼 전부 그림)
      if (revealing && skyRevealLite() && !moved) { drawLite(view, width, height, elapsed); return; }
      lite = null;
      context.clearRect(0, 0, width, height);
      if (dome) drawSkyLight(context, view, width, height);
      const project = projector(view, width, height);
      const fade = (y: number, altitude: number) => fadeAt(y, altitude, height);
      const visible = (p: { x: number; y: number } | null, pad: number) => inside(p, pad, width, height);

      // ① 은하수
      drawDust(context, view, width, height, revealing ? dustLightAt(elapsed) : 1);
      // ② 별 (밝은 별부터 저장되어 있어 뒤에서부터 그려 밝은 별이 위에 오게)
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        if (dome && s.v[2] < 0) continue;
        const p = project(s.v);
        if (!p || !visible(p, s.half)) continue;
        let light = 1;
        if (revealing) {
          const t = (elapsed - s.delay) / STAR_FADE_MS;
          if (t <= 0) continue;
          if (t < 1) {
            light = 1 - (1 - t) ** 2;
            const size = s.half * 2 * (1 + 0.9 * Math.sin(Math.PI * t));
            context.globalAlpha = s.alpha * fade(p.y, s.v[2]) * BACKGROUND_DIM * light;
            context.drawImage(s.sprite, p.x - size / 2, p.y - size / 2, size, size);
            continue;
          }
        }
        context.globalAlpha = s.alpha * fade(p.y, s.v[2]) * BACKGROUND_DIM * light;
        context.drawImage(s.sprite, p.x - s.half, p.y - s.half);
      }
      context.globalAlpha = 1;
      if (dome) drawGround(context, view, width, height);
    }
    function schedule() {
      if (!requested) requested = requestAnimationFrame(() => {
        requested = 0;
        draw();
      });
    }
    function drawCameraFrame() {
      // 밤하늘 연출 중에는 아래 연출 루프가 매 프레임 그림
      if (revealFrame || paintedView === skyView.get()) return;
      // Camera motion already runs in an animation frame. Paint this view
      // alongside the quest anchors instead of drawing it on the next frame.
      cancelAnimationFrame(requested);
      requested = 0;
      draw();
    }
    function prepareSizes() {
      if (!raw) return;
      const sprites = new Map<string, HTMLCanvasElement>();
      const count = raw.stars.length;
      stars = raw.stars.map(([ra, dec, mag, bv], index) => {
        const radius = Math.round(Math.max(0.55, 2.7 - 0.42 * mag) * dpr * 8) / 8;
        const color = starColor(bv);
        const lit = mag < 1.6;
        const key = `${radius}/${color}/${lit}`;
        const half = Math.ceil(lit ? radius * 4.5 : radius + 1);
        let sprite = sprites.get(key);
        if (!sprite) {
          sprite = document.createElement('canvas');
          sprite.width = sprite.height = half * 2;
          const brush = sprite.getContext('2d')!;
          if (lit) {
            const size = radius * 9;
            brush.globalAlpha = 0.35;
            brush.drawImage(glow, half - size / 2, half - size / 2, size, size);
            brush.globalAlpha = 1;
          }
          brush.fillStyle = `rgb(${color})`;
          brush.beginPath();
          brush.arc(half, half, radius, 0, Math.PI * 2);
          brush.fill();
          sprites.set(key, sprite);
        }
        return { v: unit(ra, dec), sprite, half, alpha: mag < 3.5 ? 1 : Math.max(0.3, 1 - (mag - 3.5) * 0.33), delay: revealDelay(index, count) };
      });
      revealOrder = stars.map((_, index) => index).sort((a, b) => stars[a].delay - stars[b].delay);
      lite = null;
      dust = raw.milkyway.map(([ra, dec, level]) => ({ v: unit(ra, dec), alpha: 0.03 + level * 0.025 }));
    }
    function resize() {
      if (!host || !stage) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      stage.width = Math.max(1, Math.round(r.width * dpr));
      stage.height = Math.max(1, Math.round(r.height * dpr));
      skyView.setFrame({ left: r.left, top: r.top, width: r.width, height: r.height });
      prepareSizes();
      schedule();
    }

    // 밤하늘 연출: 예약되면 별을 숨긴 채 그리고, 시작되면 다 켜질 때까지 매 프레임 그림
    let revealFrame = 0;
    let lastFrame = 0, slowFrames = 0;
    function revealLoop(now: number) {
      revealFrame = 0;
      const elapsed = skyRevealElapsed();
      // 저사양 기기 대비: 연출 초반에 버벅이면 시점 이동을 끝내고(바로 도착) 가벼운 연출로
      if (elapsed !== null && elapsed > 120 && elapsed < 800 && !skyRevealLite()) {
        if (lastFrame && now - lastFrame > SLOW_FRAME_MS) slowFrames++;
        if (slowFrames >= SLOW_FRAMES && lightenSkyReveal()) skyView.finishFlight();
      }
      lastFrame = now;
      draw();
      if (!revealFrame && elapsed !== null && elapsed > 0 && elapsed < REVEAL_STARS_END) revealFrame = requestAnimationFrame(revealLoop);
      if (elapsed === null || elapsed >= REVEAL_STARS_END) lite = null;
    }
    const unsubscribeReveal = subscribeSkyReveal(() => {
      cancelAnimationFrame(revealFrame);
      revealFrame = requestAnimationFrame(revealLoop);
    });
    const unsubscribe = skyView.subscribe(drawCameraFrame);
    loadCelestial().then(data => {
      if (!alive) return;
      raw = data;
      prepareSizes();
      schedule();
    }).catch(() => { /* 데이터를 못 받으면 배경 그라데이션만 보임 */ });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    window.addEventListener('resize', resize);
    resize();
    // 이미 연출이 시작된 뒤에 그려지기 시작했으면 바로 이어서
    if (skyRevealElapsed()) revealFrame = requestAnimationFrame(revealLoop);
    return () => {
      alive = false;
      unsubscribe();
      unsubscribeReveal();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(requested);
      cancelAnimationFrame(revealFrame);
    };
  }, [dome]);

  useEffect(() => {
    const host = surface.current;
    if (!host) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragging = false;
    let suppressClick = false;
    let pinchDistance = 0;
    let queuedX = 0, queuedY = 0, queuedZoom = 1, frame = 0;

    function applyMotion() {
      frame = 0;
      if (queuedZoom !== 1) skyView.zoom(queuedZoom);
      if (queuedX || queuedY) turn(host!, queuedX, queuedY, dome);
      queuedX = queuedY = 0;
      queuedZoom = 1;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(applyMotion); };
    const onSky = (target: EventTarget | null) => host.isConnected && host.clientWidth > 0 && target instanceof Element &&
      (host.contains(target) || (dome && !!target.closest('.sky-locked .nstar, .sky-locked .edge-hit')));
    const distance = () => {
      const [a, b] = pointers.values();
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const capture = (id: number) => {
      try { host.setPointerCapture(id); } catch { /* Window listeners still follow the pointer. */ }
    };
    const down = (event: PointerEvent) => {
      if (!pointers.size) suppressClick = false;
      if (!onSky(event.target) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        dragging = suppressClick = true;
        pointers.forEach((_, id) => capture(id));
        pinchDistance = distance();
        if (dome) skyView.showPan();
      }
    };
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (!dragging && Math.hypot(dx, dy) < 7) return;
      if (!dragging) {
        dragging = suppressClick = true;
        capture(event.pointerId);
        if (dome) skyView.showPan();
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size > 1) {
        const next = distance();
        if (next && pinchDistance) queuedZoom *= pinchDistance / next;
        pinchDistance = next;
      } else {
        queuedX += dx;
        queuedY += dy;
      }
      schedule();
    };
    const end = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      pinchDistance = distance();
      if (pointers.size) return;
      if (dome && dragging) skyView.endPan();
      dragging = false;
    };
    const resetGesture = () => {
      if (dome && dragging) skyView.endPan();
      pointers.clear();
      dragging = suppressClick = false;
      pinchDistance = 0;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    const wheel = (event: WheelEvent) => {
      if ((background && !dome) || !onSky(event.target)) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      queuedZoom *= Math.exp(delta * 0.0015);
      schedule();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', resetGesture);
    window.addEventListener('click', click, true);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      resetGesture();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', resetGesture);
      window.removeEventListener('click', click, true);
      window.removeEventListener('wheel', wheel);
    };
  }, [background, dome]);

  return (
    <div className={`panorama-shell${background ? ' panorama-background' : ''}${dome ? ' panorama-dome' : ''}`}>
      <div className="panorama-surface" ref={surface} tabIndex={0}
        role="region" aria-label="실제 별 위치로 그린 밤하늘. 끌어서 둘러보고, 두 손가락이나 휠로 확대하세요. 방향키와 +, - 키도 쓸 수 있어요."
        onKeyDown={event => {
          const step = 40;
          const rotate = (x: number, y: number) => turn(event.currentTarget, x, y, dome);
          const keys: Record<string, () => void> = {
            ArrowLeft: () => rotate(-step, 0), ArrowRight: () => rotate(step, 0), ArrowUp: () => rotate(0, step), ArrowDown: () => rotate(0, -step),
            '+': () => skyView.zoom(0.8), '=': () => skyView.zoom(0.8), '-': () => skyView.zoom(1.25),
          };
          const run = keys[event.key];
          if (!run) return;
          event.preventDefault();
          run();
        }}>
        <canvas ref={canvas} className="panorama-canvas" aria-hidden="true" />
        {!dome && <><div className="panorama-hills" aria-hidden="true" /><div className="panorama-grass" aria-hidden="true" /></>}
        {!dome && <div className="panorama-person" aria-hidden="true"><SkyPerson sculpted={background} /></div>}
      </div>
    </div>
  );
}
