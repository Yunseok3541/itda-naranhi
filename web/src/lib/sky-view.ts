// 천구 시점(어디를 얼마나 크게 보고 있는지)을 배경(sky-panorama)과 별자리(night-sky)가 함께 쓰는 저장소
// - 배경은 이 시점으로 실제 별을 그리고, 별자리 화면은 같은 시점으로 퀘스트 별 위치를 계산한다
// - 투영은 평사도법(stereographic): 가운데는 그대로, 가장자리로 갈수록 조금 넓게 보임

export type Vec3 = [number, number, number];
export type SkyView = { lon: number; lat: number; fov: number }; // 라디안. fov = 화면 긴 쪽에 보이는 각도
export type Frame = { left: number; top: number; width: number; height: number }; // 배경 캔버스의 화면 위치(CSS px)
type ViewBand = { top: number; bottom: number };

export const RAD = Math.PI / 180;
export const FOV_MIN = 6 * RAD;
/** 가장 넓게 둘러볼 때의 시야각. */
export const FOV_MAX = 100 * RAD;
const LAT_LIMIT = Math.PI / 2;

let view: SkyView = { lon: 15 * RAD, lat: 52 * RAD, fov: 80 * RAD };
let frame: Frame | null = null;
let version = 0;
let anim = 0;
let flying = false;
let panned = false;
let panVisible = false;
let panTimer = 0;
const listeners = new Set<() => void>();

const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const clampView = (v: SkyView): SkyView => ({
  lon: wrap(v.lon),
  lat: Math.max(-LAT_LIMIT, Math.min(LAT_LIMIT, v.lat)),
  fov: Math.max(FOV_MIN, Math.min(FOV_MAX, v.fov)),
});
function emit() {
  version++;
  for (const l of listeners) l();
}

export const skyView = {
  get: () => view,
  frame: () => frame,
  version: () => version,
  isFlying: () => flying,
  wasPanned: () => panned,
  isPanVisible: () => panVisible,
  showPan() {
    clearTimeout(panTimer);
    if (!panVisible) { panVisible = true; emit(); }
  },
  endPan() {
    if (!panVisible) return;
    clearTimeout(panTimer);
    panTimer = window.setTimeout(() => { panVisible = false; emit(); }, 1500);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  stopFlight() {
    cancelAnimationFrame(anim);
    flying = false;
  },
  zoom(factor: number) {
    skyView.set({ fov: view.fov * factor });
  },
  pan(lon: number, lat: number, hemisphere = false) {
    skyView.set({ lon: view.lon + lon, lat: Math.max(hemisphere ? 0 : -LAT_LIMIT, view.lat + lat) }, true);
  },
  /** 바로 바꿈 (끌기·확대). 이동 중이던 애니메이션은 멈춤 */
  set(next: Partial<SkyView>, byPan = false) {
    skyView.stopFlight();
    const position = clampView({ ...view, ...next });
    if (position.lon === view.lon && position.lat === view.lat && position.fov === view.fov) return;
    panned ||= byPan;
    view = position;
    emit();
  },
  setFrame(next: Frame) {
    if (frame && frame.left === next.left && frame.top === next.top && frame.width === next.width && frame.height === next.height) return;
    frame = next;
    emit();
  },
  /** 목표 방향으로 돌아본 뒤, 그 별자리에 맞는 시야각으로 다가간다. */
  flyTo(target: SkyView, ms = 600, { onArrival }: { onArrival?: () => void } = {}) {
    skyView.stopFlight();
    panned = false;
    target = clampView(target);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || ms <= 0) { view = target; emit(); onArrival?.(); return; }
    const from = view;
    let dLon = wrap(target.lon - from.lon);
    if (dLon > Math.PI) dLon -= 2 * Math.PI; // 짧은 쪽으로 돌기
    const distance = Math.hypot(dLon * Math.cos((target.lat + from.lat) / 2), target.lat - from.lat);
    const duration = ms + Math.min(450, distance / RAD * 4);
    const wideFov = Math.min(FOV_MAX, Math.max(from.fov, target.fov, distance));
    const ease = (t: number) => t * t * (3 - 2 * t);
    const start = performance.now();
    flying = true;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      const fov = distance > 25 * RAD
        ? t < 0.45 ? from.fov * (wideFov / from.fov) ** ease(t / 0.45)
          : wideFov * (target.fov / wideFov) ** ease((t - 0.45) / 0.55)
        : from.fov * (target.fov / from.fov) ** e;
      view = t === 1 ? target : clampView({
        lon: from.lon + dLon * e,
        lat: from.lat + (target.lat - from.lat) * e,
        fov,
      });
      emit();
      if (t < 1) anim = requestAnimationFrame(tick);
      else { flying = false; onArrival?.(); }
    };
    anim = requestAnimationFrame(tick);
  },
};

export function unit(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg * RAD, dec = decDeg * RAD;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** 벡터 → (적경, 적위) 라디안 */
export function toLonLat(v: Vec3): { lon: number; lat: number } {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return { lon: wrap(Math.atan2(v[1], v[0])), lat: Math.asin(v[2] / n) };
}

export function angleBetween(a: Vec3, b: Vec3) {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

/** 화면 긴 쪽 기준 배율 (px / 평사도법 거리) */
export const scaleFor = (fov: number, width: number, height: number) => Math.max(width, height) / 2 / (2 * Math.tan(fov / 4));

function cameraAxes({ lon, lat }: Pick<SkyView, 'lon' | 'lat'>) {
  const forward: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  return { forward, east, north };
}

/** Image axes on the sky dome, in the order left, right, top, bottom. */
export function skyImageAxes(center: Vec3, radius: number) {
  const { forward, east, north } = cameraAxes(toLonLat(center));
  const cos = Math.cos(radius), sin = Math.sin(radius);
  const offset = (axis: Vec3, sign: number): Vec3 => [
    forward[0] * cos + axis[0] * sin * sign,
    forward[1] * cos + axis[1] * sin * sign,
    forward[2] * cos + axis[2] * sin * sign,
  ];
  return [offset(east, 1), offset(east, -1), offset(north, 1), offset(north, -1)];
}

/** Inverse of the sky projection, used to draw the camera outline on the dome map. */
export function screenRay(view: SkyView, width: number, height: number) {
  const { forward, east, north } = cameraAxes(view);
  const scale = scaleFor(view.fov, width, height);
  return (x: number, y: number): Vec3 => {
    const u = (width / 2 - x) / scale;
    const v = (height / 2 - y) / scale;
    const q = (u * u + v * v) / 4;
    return [
      (forward[0] * (1 - q) + east[0] * u + north[0] * v) / (1 + q),
      (forward[1] * (1 - q) + east[1] * u + north[1] * v) / (1 + q),
      (forward[2] * (1 - q) + east[2] * u + north[2] * v) / (1 + q),
    ];
  };
}

export function foregroundVisibility(view: SkyView, width: number, height: number) {
  const verticalFov = 4 * Math.atan(height / (4 * scaleFor(view.fov, width, height)));
  return Math.max(0, Math.min(1, (verticalFov / 2 + 7 * RAD - view.lat) / (12 * RAD)));
}

/**
 * 주어진 시점·화면 크기로 천구 위 점을 화면 좌표로 바꾸는 함수를 만든다
 * 하늘은 안에서 올려다보므로 동쪽이 왼쪽. 등 뒤(보이지 않는 쪽)는 null
 */
export function projector(v: SkyView, width: number, height: number) {
  const { forward: f, east: [e0, e1], north: n } = cameraAxes(v);
  const scale = scaleFor(v.fov, width, height);
  const cx = width / 2, cy = height / 2;
  return (p: Vec3) => {
    const z = p[0] * f[0] + p[1] * f[1] + p[2] * f[2];
    if (z < -0.2) return null;
    const k = (2 / (1 + z)) * scale;
    return { x: cx - (p[0] * e0 + p[1] * e1) * k, y: cy - (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) * k, k, z };
  };
}

/**
 * 점들이 화면에 알맞게 들어오는 시점
 * - band(화면 안 빈 공간의 위·아래 y, 캔버스 기준 px)를 주면 그 가운데에, 없으면 화면 가운데에 놓음
 * - 별자리 반지름이 화면 폭의 38%와 빈 공간 높이의 절반(이름표 자리 빼고) 중 작은 값이 되도록 확대
 */
export function fitView(points: Vec3[], width: number, height: number, band?: ViewBand): SkyView {
  const sum: Vec3 = [0, 0, 0];
  for (const p of points) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
  const center = toLonLat(sum);
  const c = unit(center.lon / RAD, center.lat / RAD);
  const radius = Math.max(1.5 * RAD, ...points.map(p => angleBetween(c, p)));
  const free = band && band.bottom - band.top > 120 ? band : { top: height * 0.27, bottom: height * 0.73 };
  const target = Math.max(60, Math.min(width * 0.38, (free.bottom - free.top) / 2 - 26)); // px (아래 이름표 자리 26px)
  const fov = clampView({ lon: 0, lat: 0, fov: 4 * Math.atan(Math.max(width, height) / 2 / (2 * (target / (2 * Math.tan(radius / 2)))) ) }).fov;
  // 별자리 가운데가 빈 공간 가운데에 오도록 시점을 옮김 (가운데 근처에서는 1px ≈ 1/scale 라디안)
  const scale = scaleFor(fov, width, height);
  const dy = (free.top + free.bottom) / 2 - height / 2;
  let view = clampView({ lon: center.lon, lat: center.lat + dy / scale, fov });
  // 모양이 한쪽으로 긴 별자리(돌고래 꼬리 등)는 평균 위치와 화면 상자 가운데가 달라서, 실제로 그려 본 상자로 한 번 더 보정
  const project = projector(view, width, height);
  const pts = points.map(project).filter((p): p is NonNullable<typeof p> => !!p);
  if (pts.length) {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const boxX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const boxY = (Math.min(...ys) + Math.max(...ys) + 26) / 2; // 맨 아래 별 밑 이름표 자리 포함
    view = clampView({
      lon: view.lon + (width / 2 - boxX) / (scale * Math.max(Math.cos(view.lat), 0.2)),
      lat: view.lat + ((free.top + free.bottom) / 2 - boxY) / scale,
      fov,
    });
  }
  return view;
}
