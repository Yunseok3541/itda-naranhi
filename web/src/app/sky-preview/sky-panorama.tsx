"use client";
// 메인 배경 "천구 뷰": 실제 별 위치(적경·적위)를 구 위에 놓고, 끌면 하늘이 돌아간다
// - 데이터: public/sky/celestial.json (5.5등급까지 별 2,851개 + 은하수 밝기 격자, 약 27KB 압축)
//   만드는 법·출처: scripts/build-celestial-data.mjs, 라이선스: public/sky/LICENSE-d3-celestial.txt
// - 그림: Canvas 2D + 평사도법(stereographic). 3D 라이브러리 없음, 끌 때만 다시 그림 (가만히 있으면 연산 0)
// - 위치·시간·카메라 권한을 쓰지 않음 (실제 내 위치의 하늘이 아니라 별자리 지도)
import { useEffect, useRef } from 'react';
import './sky-preview.css';

type Celestial = { stars: [number, number, number, number][]; milkyway: [number, number, number][] };

const RAD = Math.PI / 180;
/** 화면의 긴 쪽에 보이는 하늘 각도 */
const FOV = 110 * RAD;
/** 처음 바라보는 곳: 카시오페이아자리 근처 (앱의 첫 별자리) */
const START = { lon: 15 * RAD, lat: 52 * RAD };
const LAT_LIMIT = 85 * RAD;

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

function unit(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * RAD, dec = decDeg * RAD;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

function wrapped(value: number, period: number) {
  return ((value % period) + period) % period;
}

export default function SkyPanorama({ background = false }: { background?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hills = useRef<HTMLDivElement>(null);
  const view = useRef({ ...START });
  const renderFrame = useRef<() => void>(() => {});
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const host = surface.current;
    const stage = canvas.current;
    if (!host || !stage) return;
    const context = stage.getContext('2d');
    if (!context) return;
    let requested = 0;
    let alive = true;
    let dpr = 1;
    // 미리 계산한 단위 벡터 (그릴 때마다 삼각함수를 다시 부르지 않게)
    let stars: { v: [number, number, number]; r: number; alpha: number; color: string; glow: boolean }[] = [];
    let dust: { v: [number, number, number]; alpha: number }[] = [];

    // 은하수 칸 하나를 그릴 부드러운 빛 점
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

      const { lon, lat } = view.current;
      // 바라보는 방향(f)과 화면의 오른쪽·위쪽 축. 하늘은 안에서 올려다보므로 동쪽이 왼쪽
      const f = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
      const east = [-Math.sin(lon), Math.cos(lon), 0];
      const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
      const scale = Math.max(width, height) / 2 / (2 * Math.tan(FOV / 4));
      const cx = width / 2, cy = height / 2;
      const horizonFade = height * 0.72; // 아래쪽(지평선 빛)으로 갈수록 별이 옅어짐

      const project = (v: [number, number, number]) => {
        const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
        if (z < -0.2) return null;
        const k = 2 / (1 + z) * scale;
        const x = cx - (v[0] * east[0] + v[1] * east[1]) * k;
        const y = cy - (v[0] * north[0] + v[1] * north[1] + v[2] * north[2]) * k;
        return x < -60 || x > width + 60 || y < -60 || y > height + 60 ? null : { x, y, k };
      };
      const fade = (y: number) => (y < horizonFade ? 1 : Math.max(0, 1 - (y - horizonFade) / (height - horizonFade)) * 0.9 + 0.1);

      // ① 은하수
      const cell = 3 * RAD * 3.4; // 칸 간격(3°)보다 크게 겹쳐 그려 덩어리 없이 이어지게
      for (const d of dust) {
        const p = project(d.v);
        if (!p) continue;
        const size = cell * p.k;
        context.globalAlpha = d.alpha * fade(p.y);
        context.drawImage(glow, p.x - size / 2, p.y - size / 2, size, size);
      }
      // ② 별 (밝은 별부터 저장되어 있어 어두운 별이 위로 덮지 않음 → 뒤에서부터 그림)
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        const p = project(s.v);
        if (!p) continue;
        const a = s.alpha * fade(p.y);
        if (s.glow) {
          context.globalAlpha = a * 0.35;
          const size = s.r * 9;
          context.drawImage(glow, p.x - size / 2, p.y - size / 2, size, size);
        }
        context.globalAlpha = a;
        context.fillStyle = `rgb(${s.color})`;
        context.beginPath();
        context.arc(p.x, p.y, s.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (hills.current) hills.current.style.backgroundPositionX = `${wrapped(lon / (2 * Math.PI) * host.clientWidth * 2, host.clientWidth * 2)}px`;
    }
    function schedule() {
      if (!requested) requested = requestAnimationFrame(draw);
    }
    function resize() {
      if (!host || !stage) return;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      stage.width = Math.max(1, Math.round(host.clientWidth * dpr));
      stage.height = Math.max(1, Math.round(host.clientHeight * dpr));
      prepareSizes();
      schedule();
    }
    let raw: Celestial | null = null;
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

    renderFrame.current = schedule;
    loadCelestial().then(data => {
      if (!alive) return;
      raw = data;
      prepareSizes();
      schedule();
    }).catch(() => { /* 데이터를 못 받으면 배경 그라데이션만 보임 */ });
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => {
      alive = false;
      observer.disconnect();
      cancelAnimationFrame(requested);
      renderFrame.current = () => {};
    };
  }, []);

  /** 끈 만큼 하늘을 돌림 (화면 가운데 기준 1px ≈ 같은 각도) */
  function turn(dx: number, dy: number) {
    const host = surface.current;
    if (!host) return;
    const perPixel = 1 / (Math.max(host.clientWidth, host.clientHeight) / 2 / (2 * Math.tan(FOV / 4)));
    const v = view.current;
    v.lon = wrapped(v.lon + dx * perPixel, 2 * Math.PI);
    v.lat = Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, v.lat + dy * perPixel));
    renderFrame.current();
  }

  return (
    <div className={background ? 'panorama-shell panorama-background' : 'panorama-shell'}>
      <div className="panorama-surface" ref={surface} tabIndex={0}
        role="region" aria-label="실제 별 위치로 그린 밤하늘. 끌거나 방향키로 둘러보세요."
        onKeyDown={event => {
          const step = 40;
          const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
          const move = keys[event.key];
          if (!move) return;
          event.preventDefault();
          turn(...move);
        }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const active = pointer.current;
          if (!active || active.id !== event.pointerId) return;
          turn(event.clientX - active.x, event.clientY - active.y);
          active.x = event.clientX;
          active.y = event.clientY;
        }}
        onLostPointerCapture={() => { pointer.current = null; }}>
        <canvas ref={canvas} className="panorama-canvas" aria-hidden="true" />
        <div ref={hills} className="panorama-hills" aria-hidden="true" />
        <div className="panorama-grass" aria-hidden="true" />
        <div className="panorama-person" aria-hidden="true" />
      </div>
    </div>
  );
}
