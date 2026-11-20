"use client";
// 메인 배경 "천구 뷰": 실제 별 위치(적경·적위)를 구 위에 놓고, 끌면 하늘이 돌아간다
// - 데이터: public/sky/celestial.json (5.5등급까지 별 2,851개 + 은하수 밝기 격자, 약 27KB 압축)
//   만드는 법·출처: scripts/build-celestial-data.mjs, 라이선스: public/sky/LICENSE-d3-celestial.txt
// - 시점은 lib/sky-view.ts에 함께 둔다 → 별자리 화면(night-sky)이 같은 시점으로 퀘스트 별을 올린다
// - 그림: Canvas 2D + 평사도법. 3D 라이브러리 없음, 시점이 바뀔 때만 다시 그림 (가만히 있으면 연산 0)
// - 조작: 한 손가락·마우스로 끌기, 두 손가락·휠로 확대, 방향키·+/- 키
// - 위치·시간·카메라 권한을 쓰지 않음 (실제 내 위치의 하늘이 아니라 별자리 지도)
import { useEffect, useRef } from 'react';
import { projector, scaleFor, skyView, unit, type Vec3 } from '@/lib/sky-view';
import SkyPerson from '@/components/sky-person';
import './sky-preview.css';

type Celestial = { stars: [number, number, number, number][]; milkyway: [number, number, number][] };

/** 배경 별 밝기 (퀘스트 별이 돋보이도록 전체를 조금 낮춤) */
const BACKGROUND_DIM = 0.72;

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

export default function SkyPanorama({ background = false }: { background?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hills = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

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
    let stars: { v: Vec3; r: number; alpha: number; color: string; glow: boolean }[] = [];
    let dust: { v: Vec3; alpha: number }[] = [];

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

    function draw() {
      requested = 0;
      if (!context || !stage || !host) return;
      const { width, height } = stage;
      context.clearRect(0, 0, width, height);
      if (!stars.length) return;
      const view = skyView.get();
      const project = projector(view, width, height);
      const horizonFade = height * 0.72; // 아래쪽(지평선 빛)으로 갈수록 별이 옅어짐
      const fade = (y: number) => (y < horizonFade ? 1 : Math.max(0, 1 - (y - horizonFade) / (height - horizonFade)) * 0.9 + 0.1);
      const visible = (p: { x: number; y: number } | null, pad: number) => p && p.x > -pad && p.x < width + pad && p.y > -pad && p.y < height + pad;

      // ① 은하수 (칸 간격 3°보다 크게 겹쳐 그려 덩어리 없이 이어지게)
      const cell = 3 * (Math.PI / 180) * 3.4;
      for (const d of dust) {
        const p = project(d.v);
        const size = p ? cell * p.k : 0;
        if (!p || !visible(p, size)) continue;
        context.globalAlpha = d.alpha * fade(p.y);
        context.drawImage(glow, p.x - size / 2, p.y - size / 2, size, size);
      }
      // ② 별 (밝은 별부터 저장되어 있어 뒤에서부터 그려 밝은 별이 위에 오게)
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        const p = project(s.v);
        if (!visible(p, 20)) continue;
        const a = s.alpha * fade(p!.y) * BACKGROUND_DIM;
        if (s.glow) {
          context.globalAlpha = a * 0.35;
          const size = s.r * 9;
          context.drawImage(glow, p!.x - size / 2, p!.y - size / 2, size, size);
        }
        context.globalAlpha = a;
        context.fillStyle = `rgb(${s.color})`;
        context.beginPath();
        context.arc(p!.x, p!.y, s.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      // 언덕은 움직이지 않음: 하늘과 반대로 미끄러지면 움직임이 엇갈려 멀미가 남
    }
    function schedule() {
      if (!requested) requested = requestAnimationFrame(draw);
    }
    function prepareSizes() {
      if (!raw) return;
      stars = raw.stars.map(([ra, dec, mag, bv]) => ({
        v: unit(ra, dec),
        r: Math.max(0.55, 2.7 - 0.42 * mag) * dpr,
        alpha: mag < 3.5 ? 1 : Math.max(0.3, 1 - (mag - 3.5) * 0.33),
        color: starColor(bv),
        glow: mag < 1.6,
      }));
      dust = raw.milkyway.map(([ra, dec, level]) => ({ v: unit(ra, dec), alpha: 0.03 + level * 0.025 }));
    }
    function resize() {
      if (!host || !stage) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      stage.width = Math.max(1, Math.round(host.clientWidth * dpr));
      stage.height = Math.max(1, Math.round(host.clientHeight * dpr));
      const r = stage.getBoundingClientRect();
      skyView.setFrame({ left: r.left, top: r.top, width: r.width, height: r.height });
      prepareSizes();
      schedule();
    }

    const unsubscribe = skyView.subscribe(schedule);
    // 메인(배경 모드)에서는 별·이름표 위에서 휠을 돌려도 하늘이 확대·축소되게 창 전체에서 받음
    // 단, 스크롤되는 창(목록·기억·도움 안내) 안에서는 원래대로 스크롤
    const onWindowWheel = (event: WheelEvent) => {
      if (!document.documentElement.classList.contains('sky-locked-page')) return;
      if ((event.target as Element | null)?.closest?.('.night-list-body, .sheet, .help, .char-bubble')) return;
      skyView.set({ fov: skyView.get().fov * Math.exp(event.deltaY * 0.0015) });
    };
    if (background) window.addEventListener('wheel', onWindowWheel, { passive: true });
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
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener('wheel', onWindowWheel);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(requested);
    };
  }, [background]);

  /** 끈 만큼 하늘을 돌림 (화면 가운데 기준 1px ≈ 같은 각도) */
  function turn(dx: number, dy: number) {
    const host = surface.current;
    if (!host) return;
    const v = skyView.get();
    const perPixel = 1 / scaleFor(v.fov, host.clientWidth, host.clientHeight);
    skyView.set({ lon: v.lon + dx * perPixel, lat: v.lat + dy * perPixel });
  }
  /** 확대(factor < 1) · 축소(factor > 1) */
  function zoom(factor: number) {
    skyView.set({ fov: skyView.get().fov * factor });
  }
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };

  return (
    <div className={background ? 'panorama-shell panorama-background' : 'panorama-shell'}>
      <div className="panorama-surface" ref={surface} tabIndex={0}
        role="region" aria-label="실제 별 위치로 그린 밤하늘. 끌어서 둘러보고, 두 손가락이나 휠로 확대하세요. 방향키와 +, - 키도 쓸 수 있어요."
        onKeyDown={event => {
          const step = 40;
          const keys: Record<string, () => void> = {
            ArrowLeft: () => turn(-step, 0), ArrowRight: () => turn(step, 0), ArrowUp: () => turn(0, step), ArrowDown: () => turn(0, -step),
            '+': () => zoom(0.8), '=': () => zoom(0.8), '-': () => zoom(1.25),
          };
          const run = keys[event.key];
          if (!run) return;
          event.preventDefault();
          run();
        }}
        onWheel={event => { if (!background) zoom(Math.exp(event.deltaY * 0.0015)); }}
        onPointerDown={event => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 이미 끝난 손가락 등: 잡지 못해도 끌기는 동작 */ }
          pinch.current = spread();
        }}
        onPointerMove={event => {
          const prev = pointers.current.get(event.pointerId);
          if (!prev) return;
          const next = { x: event.clientX, y: event.clientY };
          pointers.current.set(event.pointerId, next);
          if (pointers.current.size >= 2) {
            // 두 손가락: 벌린 만큼 확대
            const now = spread();
            if (now && pinch.current) zoom(pinch.current / now);
            pinch.current = now;
            return;
          }
          turn(next.x - prev.x, next.y - prev.y);
        }}
        onLostPointerCapture={event => {
          pointers.current.delete(event.pointerId);
          pinch.current = spread();
        }}>
        <canvas ref={canvas} className="panorama-canvas" aria-hidden="true" />
        <div ref={hills} className="panorama-hills" aria-hidden="true" />
        <div className="panorama-grass" aria-hidden="true" />
        <div className="panorama-person" aria-hidden="true"><SkyPerson /></div>
      </div>
    </div>
  );
}
