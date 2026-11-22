"use client";
// 메인 화면 "내 밤하늘" — 천구 배경(sky-panorama) 위 실제 별자리 자리에 퀘스트 별을 올린다
// - 퀘스트 별 하나 = 실제 별 하나 (lib/sky-constellations.ts). 배경과 같은 시점(lib/sky-view.ts)으로 위치 계산
// - 이전·다음 버튼을 누르면 그 별자리로 하늘이 이동하며 알맞게 확대
// - 별을 누르면 이름표가 열리고, 한 번 더 누르면 그 별의 기억을 본다
// - 별 상태: 아직 만나기 전(흰 점) / 손을 뻗은 별(은은한 금빛) / 딴 별(밝게 반짝임)
// - 시인성: 배경 별은 어둡게, 퀘스트 별은 크게, 지금 별자리는 별 이름·실선, 다른 별자리는 흐리게
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { characters } from '@/app/catalog/characters';
import { getActivityConstellation, getCompletedConstellationIds, getStarConstellationId } from '@/lib/constellations';
import type { Mode, Star } from '@/lib/mobile-data';
import { angleBetween, fitView, FOV_MAX, FOV_MIN, projector, RAD, scaleFor, skyImageAxes, skyView, toLonLat, unit, type SkyView, type Vec3 } from '@/lib/sky-view';
import { skyConstellation } from '@/lib/sky-constellations';
import SkyMinimap from './sky-minimap';
import ConstellationCelebration from './constellation-celebration';
import { useSkyTour } from './use-sky-tour';
import MeteorRewards from './meteor-rewards';
import SkyControlIcon from './sky-control-icon';
import StarList from './star-list';
import DressedSkyPerson from './dressed-sky-person';
import { useCloseDialogOnHide } from './use-close-dialog-on-hide';
import { finishHint, useSkyHints } from '@/lib/sky-hints';
import { clearSkyFocus, peekSkyFocus } from '@/lib/service-guide';
import { DAILY_STAR_LIMIT_MESSAGE, hasReachedDailyStarLimit, isTutorialStar } from '@/lib/star-limit';
import { starDisplayDescription, starDisplayTitle } from '@/lib/star-display';

const labels = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;
/** 지금 별자리가 화면에서 이만큼(px, 대각선) 이상일 때만 퀘스트 이름표·큰 별 표시 */
const DETAIL_SPAN = 90;
const CHARACTER_ART_SIZE = 128;

function fadeBetween(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function viewportLight(x: number, y: number, width: number, height: number) {
  return fadeBetween(-8, 56, Math.min(x, y, width - x, height - y));
}

const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
function memoryDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}년 ${Number(dateOnly[2])}월 ${Number(dateOnly[3])}일`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : koreanDate.format(date);
}

export type Group = { id: number; name: string; theme: string; stars: Star[] };

export function groupStars(stars: Star[]): Group[] {
  const byId = new Map<number, Star[]>();
  for (const s of stars) {
    const id = getStarConstellationId(s);
    byId.set(id, [...(byId.get(id) ?? []), s]);
  }
  return [...byId.entries()].map(([id, list]) => {
    const constellation = getActivityConstellation(id);
    return {
      id,
      name: list[0].constellationName ?? constellation?.name ?? '이름 없는 별자리',
      theme: constellation?.theme ?? '',
      stars: [...list].sort((a, b) => (a.position ?? a.starId) - (b.position ?? b.starId)),
    };
  });
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 단어 단위 줄바꿈(word-break: keep-all)으로 몇 줄·얼마나 넓은지 어림. 글자 0.72rem 기준 */
function measure(text: string, maxLine: number) {
  const CHAR = 11.8, SPACE = 3.6;
  const lines: number[] = [];
  for (const paragraph of text.split('\n')) {
    let line = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = word.length * CHAR;
      if (line > 0 && line + SPACE + w > maxLine) { lines.push(line); line = w; }
      else line += (line > 0 ? SPACE : 0) + w;
    }
    lines.push(line);
  }
  return { lines: lines.length, width: Math.max(...lines) };
}

function placeLabel({ x, y, text }: { x: number; y: number; text: string }, stars: { x: number; y: number }[], width: number, height: number, band?: { top: number; bottom: number }, minimap?: Box) {
  const STAR = 16, GAP = 20, PAD = 22, LINE = 16.2;
  const starBoxes = stars.map(i => ({ x: i.x - STAR, y: i.y - STAR, w: STAR * 2, h: STAR * 2 }));
  const maxWidth = Math.min(180, width - 16);
  const measured = measure(text, maxWidth - PAD - 4);
  const w = Math.min(maxWidth, Math.ceil(measured.width) + PAD + 4);
  const h = measured.lines * LINE + 12;
  const centered = Math.max(4, Math.min(width - w - 4, x - w / 2));
  const candidates: Box[] = [
    { x: centered, y: y + GAP, w, h },
    { x: centered, y: y - GAP - h, w, h },
    { x: x + GAP + 4, y: y - h / 2, w, h },
    { x: x - GAP - 4 - w, y: y - h / 2, w, h },
  ];
  const minY = band ? Math.max(4, band.top) : 4, maxY = band ? Math.min(height - 4, band.bottom) : height - 4;
  const box = candidates.find(box => box.x >= 4 && box.x + w <= width - 4 && box.y >= minY && box.y + h <= maxY
    && (!minimap || !overlaps(box, minimap)) && !starBoxes.some(star => overlaps(box, star)));
  return { left: (box?.x ?? centered) - x + 28, top: (box?.y ?? Math.max(minY, Math.min(maxY - h, y + GAP))) - y + 28, width: w };
}

/** 가장 최근에 별을 기록한(따거나 손을 뻗은) 별자리 번호. 기록이 없으면 -1 */
export function latestGroupIndex(groups: Group[]) {
  let best = -1, bestKey = '';
  groups.forEach((g, gi) => g.stars.forEach(s => s.memories.forEach(m => {
    // 날짜가 같으면 나중에 저장된 기록(번호가 큰 것)이 최근
    const key = `${m.date}|${String(m.attemptId).padStart(16, '0')}`;
    if (key > bestKey) { bestKey = key; best = gi; }
  })));
  return best;
}

/** 지금 화면(배경 캔버스) 크기. 아직 모르면 창 크기 */
function frameSize() {
  const f = skyView.frame();
  return f ? { width: f.width, height: f.height } : { width: window.innerWidth, height: window.innerHeight };
}

/** 화면 위쪽 조작부와 아래쪽 메뉴 사이의 별자리 배치 영역. */
function freeBand() {
  const frame = skyView.frame();
  const actions = document.querySelector('.night-actions')?.getBoundingClientRect().bottom;
  // 처음 안내 카드가 떠 있으면 그 아래부터 (안내가 가리키는 별을 카드가 가리지 않게)
  const hint = document.querySelector('.sky-hint')?.getBoundingClientRect().bottom;
  const top = actions === undefined ? undefined : Math.max(actions, hint ?? 0);
  return frame && top !== undefined ? { top: top + 12 - frame.top, bottom: frame.height * 0.70 } : undefined;
}

// 별 상세를 열 때: 별자리 전체가 아니라 고른 별을 크게. 별자리 맞춤 시야의 이 비율만큼 더 확대
// (같은 별자리에서 여러 번 골라도 확대 정도가 같게, 별자리 크기로만 정함)
const STAR_ZOOM = 0.6;
/** 고른 별을 둘 세로 위치(캔버스 기준 px): 위쪽 버튼 줄 아래, 화면 높이의 36% 근처. 창은 이 별 바로 아래에 뜸 */
function starAnchorY(height: number) {
  const band = freeBand();
  return Math.max((band?.top ?? 0) + 70, height * 0.36);
}
/** points[index] 별이 화면 가로 가운데·starAnchorY 자리에 크게 오는 시점 */
function starView(points: Vec3[], index: number, width: number, height: number): SkyView {
  const fov = Math.max(FOV_MIN, fitView(points, width, height, freeBand()).fov * STAR_ZOOM);
  const y = starAnchorY(height), scale = scaleFor(fov, width, height);
  let view: SkyView = { ...toLonLat(points[index]), fov };
  for (let pass = 0; pass < 3; pass++) { // 투영이 곡면이라 몇 번 맞춰 봄 (fitView와 같은 보정)
    const point = projector(view, width, height)(points[index]);
    if (!point) break;
    view = {
      lon: view.lon + (width / 2 - point.x) / (scale * Math.max(Math.cos(view.lat), 0.2)),
      lat: view.lat + (y - point.y) / scale,
      fov,
    };
  }
  return { ...view, lat: Math.max(0, view.lat) };
}

// 별자리로 옮겨 가는 시간 (목록·하늘의 별자리·미니맵·최근 별자리·수평선 모두 같게).
// 어디로 가는지 따라볼 수 있게 천천히: 1.6초 + 거리에 따라 최대 0.45초 (sky-view.ts flyTo)
const FLIGHT_MS = 1600;
// 목록에서 별을 고르고 도착한 뒤, 이름표가 눈에 들어올 만큼만 두고 바로 할 일 창
const SHEET_DELAY_MS = 350;
const HINT_DURATION_MS = { drag: 5500, star: 8000 };

export default function NightSky({ stars, selected, onSelect, busy, onReload, footer, nextLink, completedId, mode, totalPoints, onOpenQuest, questTrigger, questOpen, hintsPaused = false }: {
  stars: Star[];
  selected: Star | null;
  onSelect: (star: Star | null) => void;
  busy: boolean;
  onReload: () => void;
  /** 메인은 한 화면에 고정이라 페이지 아래 안내(footer)를 "모든 별 목록" 창 맨 아래에 둔다 */
  footer?: ReactNode;
  nextLink?: ReactNode;
  completedId?: number;
  mode: Mode;
  totalPoints?: number;
  onOpenQuest: () => void;
  questTrigger: RefObject<HTMLButtonElement | null>;
  questOpen: boolean;
  /** 메뉴 한 장 안내(menu-tour.tsx)가 떠 있는 동안은 첫 안내 카드·별똥별 안내를 미룸 */
  hintsPaused?: boolean;
}) {
  const starLight = useId();
  const groups = useMemo(() => groupStars(stars), [stars]);
  const completed = useMemo(() => getCompletedConstellationIds(stars), [stars]);
  const completedGroup = groups.find(group => group.id === completedId);
  const skies = useMemo(() => groups.map(g => skyConstellation(g.id, g.stars.length)), [groups]);
  const centers = useMemo(() => skies.map(s => {
    const sum: Vec3 = [0, 0, 0];
    for (const p of s.points) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
    const c = toLonLat(sum);
    return unit(c.lon / RAD, c.lat / RAD);
  }), [skies]);
  const companions = useMemo(() => groups.map((group, i) => {
    if (!completed.has(group.id)) return null;
    const character = characters.find(art => art.constellationId === group.id);
    if (!character) return null;
    const center = centers[i];
    const radius = Math.max(1.5 * RAD, ...skies[i].points.map(point => angleBetween(center, point)));
    return { character, center, axes: skyImageAxes(center, radius * 0.82) };
  }), [centers, completed, groups, skies]);
  // 시작 안내를 마친 직후면 그 안내가 정한 별자리(첫 친구 별마중의 양자리)를 "지금 별자리"로. 확대는 하지 않고 넓은 화면(캐릭터가 보이는)으로 시작해
  // 메뉴 안내를 그 위에서 하고, 첫 안내 카드의 "가까이 보기"를 누르면 양자리로 확대 (lib/service-guide.ts)
  const [guideFocus] = useState(peekSkyFocus);
  useEffect(() => { if (guideFocus !== null) clearSkyFocus(); }, [guideFocus]);
  // 처음에는 가장 최근에 기록한 별자리, 기록이 없으면 아직 다 따지 않은 첫 별자리
  const [index, setIndex] = useState(() => {
    const all = groups;
    const completedIndex = all.findIndex(group => group.id === completedId);
    if (completedIndex >= 0) return completedIndex;
    const memoryIndex = selected ? all.findIndex(group => group.id === getStarConstellationId(selected)) : -1;
    if (memoryIndex >= 0) return memoryIndex;
    const guideIndex = guideFocus === null ? -1 : all.findIndex(group => group.id === guideFocus);
    if (guideIndex >= 0) return guideIndex;
    const recent = latestGroupIndex(all);
    if (recent >= 0) return recent;
    const i = all.findIndex(g => g.stars.some(s => s.status !== 'bright'));
    return i < 0 ? 0 : i;
  });
  const [focus, setFocus] = useState<{ index: number; direction: Vec3; fov: number } | null>(null);
  const [namedStar, setNamedStar] = useState<number | null>(null);
  // "모든 별 보기"에서 고른 뒤의 순서: 별자리로 이동 → 도착하면 그 별에 이름표 → 잠시 뒤 할 일(별 상세) 열기
  // (누르자마자 창이 뜨면 뒤에서 하늘이 왜 움직이는지 알 수 없음)
  const [reveal, setReveal] = useState<{ index: number; star: Star | null; arrived: boolean } | null>(null);
  const finishFocus = useCallback((index: number, starId: number | null = null) => {
    const view = skyView.get();
    setIndex(index);
    setFocus({ index, direction: unit(view.lon / RAD, view.lat / RAD), fov: view.fov });
    setNamedStar(starId);
    setReveal(r => (r && r.index === index ? { ...r, arrived: true } : r));
  }, []);
  useSkyTour();
  const recent = useMemo(() => latestGroupIndex(groups), [groups]);
  const [burst, setBurst] = useState<{ key: number; x: number; y: number } | null>(null);
  // 다른 화면으로 갔다 돌아오면 닫혀 있게 (cacheComponents로 숨겨진 화면도 상태가 남음, use-collapse-on-hide.ts 참고)
  useLayoutEffect(() => () => setNamedStar(null), []);
  const sheet = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(sheet);
  useCloseDialogOnHide(list);
  const burstCount = useRef(0);
  const closeList = () => list.current?.close();
  const [listKey, setListKey] = useState(0);

  // 처음 한 번 안내 (끌기 → 별 누르기). 직접 해 보면 끝남
  const hints = useSkyHints();
  const hintCard = useRef<HTMLDivElement>(null);

  // 배경 시점이 바뀌면 다시 그림 (끌기·확대·이동 애니메이션)
  useSyncExternalStore(skyView.subscribe, skyView.version, () => 0);
  const view = skyView.get();
  const frame = skyView.frame();
  const flying = skyView.isFlying();
  const panned = skyView.wasPanned();
  const focusedIndex = focus && !flying && view.fov <= focus.fov * 1.25
    && angleBetween(focus.direction, unit(view.lon / RAD, view.lat / RAD)) <= Math.min(20 * RAD, view.fov * 0.32)
    ? focus.index : null;

  const safeIndex = Math.min(index, Math.max(groups.length - 1, 0));
  const current = groups[safeIndex];
  const complete = !!current && completed.has(current.id);

  /** i번째 별자리로 하늘을 옮기고 알맞게 확대 */
  function flyToGroup(i: number, starId: number | null = null) {
    const sky = skies[i];
    if (!sky) return;
    const { width, height } = frameSize();
    const target = fitView(sky.points, width, height, freeBand());
    skyView.flyTo({ ...target, lat: Math.max(0, target.lat) }, FLIGHT_MS, { onArrival: () => finishFocus(i, starId) });
  }
  const initialized = useRef(false);
  const openFocused = useRef(completedId !== undefined || selected !== null);
  useEffect(() => {
    const sky = skies[safeIndex];
    if (initialized.current || !frame || !sky?.points.length) return;
    initialized.current = true;
    const center = toLonLat(centers[safeIndex]);
    const initial = openFocused.current ? fitView(sky.points, frame.width, frame.height, freeBand())
      : { lon: center.lon, lat: Math.min(22 * RAD, center.lat), fov: FOV_MAX };
    skyView.flyTo({ ...initial, lat: Math.max(0, initial.lat) }, 0,
      { onArrival: openFocused.current ? () => finishFocus(safeIndex) : undefined });
  }, [centers, finishFocus, frame, safeIndex, skies]);

  // 하늘을 끌다 다른 별자리 가까이 가면 그 별자리를 "지금 별자리"로 (이동 애니메이션 중에는 바꾸지 않음)
  useEffect(() => skyView.subscribe(() => {
    if (skyView.isFlying() || !centers.length) return;
    const v = skyView.get();
    const c = unit(v.lon / RAD, v.lat / RAD);
    let best = -1, bestAngle = Infinity;
    centers.forEach((p, i) => { const a = angleBetween(c, p); if (a < bestAngle) { bestAngle = a; best = i; } });
    if (best >= 0 && bestAngle < v.fov * 0.22) setIndex(i => (i === best ? i : best));
  }), [centers]);
  // 손으로 하늘을 끌어 봤으면 끌기 안내는 끝
  useEffect(() => skyView.subscribe(() => { if (skyView.wasPanned()) finishHint('drag'); }), []);
  useEffect(() => {
    if (namedStar === null) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setNamedStar(null); };
    const timeout = window.setTimeout(() => setNamedStar(null), 7000);
    window.addEventListener('keydown', dismiss);
    return () => { window.clearTimeout(timeout); window.removeEventListener('keydown', dismiss); };
  }, [namedStar]);

  useEffect(() => {
    if (selected && sheet.current && !sheet.current.open) sheet.current.showModal();
    if (!selected || !sheet.current) return;
    const raf = requestAnimationFrame(() => {
      const frame = skyView.frame();
      const gi = groups.findIndex(group => group.stars.some(star => star.starId === selected.starId));
      const si = groups[gi]?.stars.findIndex(star => star.starId === selected.starId) ?? -1;
      if (!frame || gi < 0 || si < 0 || skyView.isFlying()) return;
      const target = starView(skies[gi].points, si, frame.width, frame.height);
      const now = skyView.get();
      if (Math.abs(now.fov - target.fov) < 0.5 * RAD && angleBetween(unit(now.lon / RAD, now.lat / RAD), unit(target.lon / RAD, target.lat / RAD)) < 0.3 * RAD) return;
      setIndex(gi);
      flyToStar(gi, si);
    });
    return () => cancelAnimationFrame(raf);
    // 창을 열 때 한 번만 (별 목록이 새로 와도 다시 움직이지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.starId]);

  /** 별자리를 눌렀을 때: 지금 별자리로 정하고 그곳으로 이동하며 확대 */
  function jump(i: number, starId: number | null = null) {
    setIndex(i);
    setFocus(null);
    setNamedStar(null);
    flyToGroup(i, starId);
    onSelect(null);
  }
  /** 고른 별로 이동하며 크게 (별 상세 창이 그 아래에 뜰 자리) */
  function flyToStar(gi: number, si: number, onArrival?: () => void) {
    const sky = skies[gi], star = groups[gi]?.stars[si];
    if (!sky?.points[si] || !star) return false;
    const { width, height } = frameSize();
    skyView.flyTo(starView(sky.points, si, width, height), FLIGHT_MS, { onArrival: () => { finishFocus(gi, star.starId); onArrival?.(); } });
    return true;
  }
  /** 목록에서 고름: 목록을 닫고 이동부터. 별을 골랐으면 도착해서 이름표를 보여 준 뒤 상세를 연다 */
  function revealFromList(i: number, star: Star | null) {
    closeList();
    if (star) finishHint('star');
    setReveal({ index: i, star, arrived: false }); // jump보다 먼저: 모션 줄이기에선 jump 안에서 바로 도착함
    const si = star ? groups[i].stars.findIndex(s => s.starId === star.starId) : -1;
    if (si < 0) { jump(i); return; }
    // 별을 골랐으면 별자리 전체가 아니라 그 별로 바로 다가감
    setIndex(i);
    setFocus(null);
    setNamedStar(null);
    onSelect(null);
    flyToStar(i, si);
  }
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; });
  useEffect(() => {
    if (!reveal) return;
    // 가는 도중이나 기다리는 동안 직접 하늘을 만지면 그만둠 (상세를 갑자기 띄우지 않음)
    const cancel = () => setReveal(null);
    const options = { capture: true, passive: true };
    window.addEventListener('pointerdown', cancel, options);
    window.addEventListener('wheel', cancel, options);
    window.addEventListener('keydown', cancel, options);
    const timer = reveal.arrived
      ? window.setTimeout(() => { if (reveal.star) selectRef.current(reveal.star); setReveal(null); }, reveal.star ? SHEET_DELAY_MS : 2500)
      : 0;
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', cancel, options);
      window.removeEventListener('wheel', cancel, options);
      window.removeEventListener('keydown', cancel, options);
    };
  }, [reveal]);

  function lookAtHorizon() {
    setFocus(null);
    setNamedStar(null);
    skyView.flyTo({ ...skyView.get(), lat: 15 * RAD, fov: FOV_MAX }, FLIGHT_MS);
    onSelect(null);
  }

  function tap(star: Star, x: number, y: number) {
    burstCount.current += 1;
    setBurst({ key: burstCount.current, x, y });
    const openMemory = namedStar === star.starId;
    setNamedStar(openMemory ? null : star.starId);
    if (openMemory) onSelect(star);
  }

  // 별 버튼만 화면 기준으로 거른다. 선은 끝점이 화면 밖이어도 보이는 부분을 남긴다.
  const { projected, positions, companionPositions } = useMemo(() => {
    if (!frame) return { projected: [], positions: [], companionPositions: [] };
    const project = projector(view, frame.width, frame.height);
    const projected = skies.map(sky => sky.points.map(project));
    const pad = 40;
    const positions = projected.map(points => points.map(point =>
      point && point.x > -pad && point.x < frame.width + pad &&
      point.y > -pad && point.y < frame.height + pad ? point : null,
    ));
    let characterIndex = focusedIndex;
    let reveal = 1;
    if (panned && !flying) {
      // Use the center of the current viewport at any zoom, including the whole-sky view.
      let closest = 1;
      characterIndex = null;
      centers.forEach((center, index) => {
        const point = project(center);
        if (!point) return;
        const distance = Math.hypot((point.x / frame.width - 0.5) / 0.3, (point.y / frame.height - 0.5) / 0.25);
        if (distance < closest) { closest = distance; characterIndex = index; }
      });
      const weight = Math.min(1, (1 - closest) / 0.55);
      reveal = weight * weight * (3 - 2 * weight);
    }
    const companionPositions = companions.map((companion, index) => {
      if (!companion || index !== characterIndex) return null;
      const center = project(companion.center);
      const [left, right, top, bottom] = companion.axes.map(project);
      if (!center || !left || !right || !top || !bottom) return null;
      const dx = right.x - left.x, dy = right.y - left.y;
      const ex = bottom.x - top.x, ey = bottom.y - top.y;
      const halfWidth = (Math.abs(dx) + Math.abs(ex)) / 2;
      const halfHeight = (Math.abs(dy) + Math.abs(ey)) / 2;
      if (center.x < -halfWidth || center.x > frame.width + halfWidth || center.y < -halfHeight || center.y > frame.height + halfHeight) return null;
      const transform = [dx, dy, ex, ey].map(component => component / CHARACTER_ART_SIZE);
      const coverage = Math.max(2 * halfWidth / frame.width, 2 * halfHeight / frame.height);
      const opacity = 0.42 * reveal * Math.max(0.38, 1 - Math.max(0, coverage - 0.8) * 0.62);
      return { character: companion.character, center, transform, opacity };
    });
    return { projected, positions, companionPositions };
  }, [centers, companions, flying, focusedIndex, panned, skies, view, frame]);

  // 화면에 별 하나만 남아도 확대 배율을 기준으로 이름표와 기록 동작을 유지한다.
  const span = useMemo(() => {
    const pts = (projected[safeIndex] ?? []).filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length < 2) return 0;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }, [projected, safeIndex]);
  const detailed = span >= DETAIL_SPAN && (focusedIndex === safeIndex || view.fov < FOV_MAX - 3 * RAD);
  // 시야가 가까워질수록 별이 선명해지고, 선은 그보다 늦게 드러난다.
  const overview = 1 - fadeBetween(FOV_MAX - 18 * RAD, FOV_MAX, view.fov);
  const starDetail = fadeBetween(38, 116, span) * overview;
  const lineDetail = fadeBetween(64, 144, span) * overview;

  // 지금 별자리 별 이름표 자리 (겹치면 숨김)
  // 별 상세 창이 열려 있으면 이름표는 숨김 (창 제목이 같은 이름이고, 별 바로 아래 창에 이름표가 가려짐)
  const labelStar = selected ? null : namedStar;
  const labelSpot = useMemo(() => {
    if (labelStar === null || skyView.isFlying() || !frame) return null;
    const groupIndex = groups.findIndex(group => group.stars.some(star => star.starId === labelStar));
    const starIndex = groups[groupIndex]?.stars.findIndex(star => star.starId === labelStar);
    const star = starIndex === undefined ? undefined : groups[groupIndex].stars[starIndex];
    const point = starIndex === undefined ? null : positions[groupIndex]?.[starIndex];
    if (!star || !point || !detailed || groupIndex !== safeIndex) return null;
    const map = document.querySelector('.sky-minimap')?.getBoundingClientRect();
    const exclusion = map ? { x: map.left - frame.left - 4, y: map.top - frame.top - 4, w: map.width + 8, h: map.height + 8 } : undefined;
    // 상세 창이 열려 있으면 이름표도 창 위쪽에만
    const openSheet = selected ? document.querySelector('dialog.sheet[open]')?.getBoundingClientRect().top : undefined;
    const band = freeBand();
    return placeLabel({ ...point, text: starDisplayTitle(star.title) }, positions[groupIndex].filter(item => item !== null),
      frame.width, frame.height, openSheet === undefined || !band ? band : { top: band.top, bottom: openSheet - frame.top - 8 }, exclusion);
  }, [detailed, groups, labelStar, positions, frame, safeIndex, selected]);

  // 별 상세 창이 열려 있는 동안: 고른 별 자리만 밝게 남기고 나머지 하늘을 어둡게 (창 뒤 ::backdrop 구멍 위치)
  const selectedGroup = selected ? groups.findIndex(group => group.stars.some(star => star.starId === selected.starId)) : -1;
  const selectedPoint = selected && selectedGroup >= 0
    ? positions[selectedGroup]?.[groups[selectedGroup].stars.findIndex(star => star.starId === selected.starId)] : null;
  // 창은 고른 별 바로 아래(별 중심 + 40px). 아래 메뉴 위로 창 최소 높이(220px)가 남도록 위로만 당김
  const sheetTop = selectedPoint && frame ? Math.round(Math.min(frame.top + selectedPoint.y + 40,
    (document.querySelector('.sky-actions')?.getBoundingClientRect().top ?? window.innerHeight) - 16 - 220)) : null;
  const spotlight = selectedPoint && frame && sheetTop !== null
    ? { '--spot-x': `${frame.left + selectedPoint.x}px`, '--spot-y': `${frame.top + selectedPoint.y}px`, '--sheet-top': `${sheetTop}px` } as CSSProperties
    : undefined;

  const hint = !current || selected || questOpen || hintsPaused ? null : hints.current;
  useEffect(() => {
    if (!hint) return;
    let timer = 0;
    const expire = () => {
      if (hintCard.current?.contains(document.activeElement)) {
        timer = window.setTimeout(expire, 1000);
        return;
      }
      finishHint(hint);
    };
    const updateTimer = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(expire, HINT_DURATION_MS[hint]);
    };
    updateTimer();
    document.addEventListener('visibilitychange', updateTimer);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateTimer);
    };
  }, [hint]);
  const questBlocked = selected && selected.status !== 'bright' && !isTutorialStar(selected.starId) && hasReachedDailyStarLimit(stars);
  const horizon = frame && projector(view, frame.width, frame.height)(unit(view.lon / RAD, 0));
  const showQuestBubble = !!(frame && horizon && horizon.y < frame.height * 0.88) && !questOpen;
  const firstQuest = hints.pending('quest');
  return <section className={`night${hint === 'star' ? ' hint-star' : ''}`} aria-label="내 밤하늘">
    <MeteorRewards key={mode} mode={mode} skyTotal={totalPoints} hintPaused={hintsPaused} />

    {frame && <div className="sky-anchors" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
      <div className="sky-companion-layer">
        {companionPositions.map(placement => {
          if (!placement) return null;
          const { character, center, transform, opacity } = placement;
          return <div key={character.id} className="sky-constellation-character" style={{
            left: center.x, top: center.y, width: CHARACTER_ART_SIZE, height: CHARACTER_ART_SIZE, '--companion-opacity': opacity,
            transform: `translate(-50%, -50%) matrix(${transform.join(',')},0,0)`, '--companion-light': character.color,
          } as CSSProperties}>
            <Image src={`/catalog/${character.id}.webp`} alt={character.nickname} fill unoptimized />
          </div>;
        })}
      </div>
      <svg className="sky-edge-layer" width={frame.width} height={frame.height} aria-hidden="true">
        <defs>
          <radialGradient id={starLight} cx="43%" cy="35%" r="67%">
            <stop offset="0" stopColor="#fbf8ff" />
            <stop offset=".5" stopColor="#e5dcff" />
            <stop offset="1" stopColor="#bdb1e4" />
          </radialGradient>
        </defs>
        {groups.map((g, gi) => skies[gi].edges.map(([a, b], edgeIndex) => {
          const p = projected[gi]?.[a], q = projected[gi]?.[b];
          if (!p || !q) return null;
          const lit = g.stars[a]?.status === 'bright' && g.stars[b]?.status === 'bright';
          const near = gi === safeIndex && detailed;
          const celebrating = g.id === completedId && lit;
          const inView = Math.max(
            viewportLight(p.x, p.y, frame.width, frame.height),
            viewportLight(q.x, q.y, frame.width, frame.height),
            viewportLight((p.x + q.x) / 2, (p.y + q.y) / 2, frame.width, frame.height),
          );
          const opacity = inView * (gi === safeIndex ? .18 + .82 * lineDetail : .16 + .26 * lineDetail);
          return <g key={`${g.id}-${a}-${b}`} className="sky-constellation-edge" style={{ '--edge-light': opacity } as CSSProperties}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              className={`edge${lit ? ' lit' : ''}${gi === safeIndex ? ' current' : ''}${celebrating ? ' completion-edge' : ''}`}
              pathLength={celebrating ? 1 : undefined}
              style={celebrating ? { animationDelay: `${Math.min(edgeIndex, 7) * 80}ms` } : undefined} />
            {/* 멀리서 볼 때는 선 주변(손가락 굵기)을 눌러도 그 별자리로 가까이 감 */}
            {!near && opacity > .08 && <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="edge-hit" onClick={() => jump(gi)} />}
          </g>;
        }))}
      </svg>
      {groups.map((g, gi) => g.stars.map((s, i) => {
        const p = positions[gi]?.[i];
        if (!p) return null;
        const isCurrent = gi === safeIndex;
        // 가까운 별 두 개의 터치 영역이 서로의 중심을 가리지 않게 한다.
        const spacing = isCurrent && detailed
          ? Math.min(...positions[gi].flatMap((point, index) =>
            point && index !== i ? [Math.hypot(point.x - p.x, point.y - p.y)] : []))
          : Infinity;
        const hitSize = Math.min(56, Math.max(16, spacing * 2 - 4));
        const emphasis = isCurrent && detailed ? ' current' : isCurrent ? ' current far' : ' other';
        return <button key={s.starId} type="button"
          className={`nstar ${s.status}${emphasis}${selected?.starId === s.starId ? ' active' : ''}`}
          style={{ '--star-x': `${p.x}px`, '--star-y': `${p.y}px`, animationDelay: `${(i * 0.7) % 3}s`,
            '--star-hit-size': `${hitSize}px`, '--star-core-size': `${Math.min(29, Math.max(12, spacing - 2))}px`,
            '--star-light': (isCurrent ? .55 + .45 * starDetail : .42) * viewportLight(p.x, p.y, frame.width, frame.height),
            '--star-scale': isCurrent ? .72 + .28 * starDetail : .75,
          } as CSSProperties}
          aria-label={`${s.title}, ${labels[s.status]}${namedStar === s.starId ? ', 이 별의 기억 열기' : ''}`}
          onClick={() => {
            finishHint('star');
            // 멀리서 보고 있으면(축소했거나 다른 별자리) 먼저 그 별자리로 이동·확대, 크게 보고 있는 별자리면 기억 창
            if ((!isCurrent || !detailed) && namedStar !== s.starId) { jump(gi, s.starId); return; }
            tap(s, p.x, p.y);
          }}>
          <span className="glow" aria-hidden="true" />
          <svg className="core" viewBox="0 0 24 24" aria-hidden="true">
            <path fill={s.status === 'untried' ? `url(#${starLight})` : undefined}
              d="M10.8 3.8Q12 1.4 13.2 3.8l2.2 4.5 5 .7q2.6.4.7 2.3l-3.6 3.6.9 5.1q.4 2.4-1.8 1.2L12 18.8l-4.6 2.4Q5.2 22.4 5.6 20l.9-5.1-3.6-3.6Q1 9.4 3.6 9l5-.7z" />
          </svg>
          {labelStar === s.starId && labelSpot && <span className="nstar-label" aria-hidden="true" style={labelSpot}>{starDisplayTitle(s.title)}</span>}
        </button>;
      }))}
      {burst && <span key={burst.key} className="burst" style={{ left: burst.x, top: burst.y }} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties} />)}
      </span>}
    </div>}

    {current ? <>
      <div className="night-title">
        <h1 className={complete && detailed ? 'complete' : undefined}>{detailed || reveal ? current.name : '내 밤하늘'}</h1>
        {/* 목록에서 고른 뒤에는 지금 무슨 일이 일어나는지 한 줄로 (화면 읽기 프로그램에도 읽힘) */}
        <p aria-live="polite">{reveal
          ? !reveal.arrived ? `${current.name}로 이동하고 있어요`
            : reveal.star ? `‘${reveal.star.title}’, 바로 이 별이에요` : '별을 눌러 오늘 해 볼 일을 골라 보세요'
          : complete ? '별자리를 모두 이었어요' : current.theme}</p>
      </div>
      {labelSpot && !reveal && !selected && <p className="night-hint">별을 한 번 더 누르면 그날의 기억이 열려요</p>}
    </> : <div className="night-title"><h1>아직 하늘이 비어 있어요</h1><p>밤하늘을 다시 불러와 주세요.</p></div>}

    {/* 모든 별 목록: 안내 문구 아래 작은 버튼 → 아래에서 올라오는 창 (캔버스를 못 쓰는 사람도 모든 별을 고를 수 있게) */}
      <div className="night-actions">
        {nextLink && <div className="night-next">{nextLink}</div>}
        {/* 다른 별자리를 보고 있을 때만: 가장 최근에 기록한 별자리로 돌아가기 */}
        {recent >= 0 && recent !== safeIndex && <button type="button" className="recent-pill" onClick={() => jump(recent)}>
          <SkyControlIcon name="refresh" /> 최근 별자리
        </button>}
        <button type="button" className="night-list-trigger" aria-haspopup="dialog" onClick={event => {
          event.currentTarget.focus({ preventScroll: true });
          setListKey(k => k + 1);
          list.current?.showModal();
        }}><SkyControlIcon name="starList" /> 모든 별 보기</button>
        <dialog className="night-list" ref={list} aria-label="모든 별 목록"
          onClick={event => { if (event.target === event.currentTarget) closeList(); }}>
          <div className="night-list-body">
            <div className="sheet-grip" aria-hidden="true" />
            {/* 열 때마다 새로 그려 지금 별자리·진행 중인 별자리만 펼친 상태로 시작. 고르면 이동 → 이 별 → 할 일 (고민기록 #53) */}
            <StarList key={listKey} groups={groups} current={safeIndex} completed={completed}
              onGroup={gi => revealFromList(gi, null)}
              onStar={(gi, s) => revealFromList(gi, s)}
              onClose={closeList} onReload={onReload} busy={busy} footer={footer} />
          </div>
        </dialog>
      </div>
    {hint && <div ref={hintCard} className="sky-hint" role="status">
      <p>{hint === 'drag'
        ? <><b>하늘을 끌어서 둘러보세요</b>두 손가락으로 벌리면 크게 볼 수 있어요</>
        : <><b>반짝이는 별을 눌러 보세요</b>별 하나가 오늘 해 볼 작은 일이에요</>}</p>
      {/* 멀리서 보면 별이 위쪽 버튼 뒤에 숨을 수 있어서 별자리로 데려다주는 단추 */}
      {hint === 'star' && !detailed
        ? <button type="button" className="text-button" onClick={() => { jump(safeIndex); finishHint('star'); }}>가까이 보기</button>
        : <button type="button" className="text-button" onClick={() => finishHint(hint)}>알겠어요</button>}
    </div>}
    <div className="night-space">
      {current && (<SkyMinimap groups={groups} centers={centers} skies={skies} view={view} frame={frame}
        active={safeIndex} revealed={skyView.isPanVisible()} onJump={jump} onHorizon={lookAtHorizon} />)}
    </div>

    <button ref={questTrigger} type="button" className="sky-quest-character"
      aria-label="오늘의 별" aria-haspopup="dialog" aria-expanded={questOpen} onClick={() => {
        onOpenQuest();
        finishHint('quest');
      }}>
      <span className="sky-quest-character-art"><DressedSkyPerson mode={mode} /></span>
      {showQuestBubble && <span className="sky-quest-bubble" data-intro={firstQuest || undefined} aria-hidden="true">
        오늘의 별
      </span>}
    </button>

    {completedGroup && <ConstellationCelebration constellationId={completedGroup.id} name={completedGroup.name} />}

    {selected && <dialog ref={sheet} className="sheet" aria-label={selected.title} style={spotlight}
      onClose={event => { if (!event.currentTarget.open) onSelect(null); }}
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="star-sheet-content">
        <button type="button" className="text-button star-sheet-close" aria-label="별 상세 닫기" onClick={() => sheet.current?.close()}><SkyControlIcon name="close" /></button>
        {/* 하늘의 어느 별인지 창에서도 이어 주기 (고른 별은 뒤 하늘에 금색 고리·이름표로 표시) */}
        {selectedGroup >= 0 && <p className="sheet-where"><SkyControlIcon name="constellation" /> {groups[selectedGroup].name}{selectedPoint ? ' · 하늘에 금색 고리로 표시한 별' : ''}</p>}
        <p className={`sheet-status ${selected.status}`}>{labels[selected.status]}</p>
        <h2>{starDisplayTitle(selected.title)}</h2>
        {selected.description && <p className="sheet-desc">{starDisplayDescription(selected.description)}</p>}
        {selected.memories.length
          ? <ul className="memories">{selected.memories.map(m => <li key={m.attemptId}><time dateTime={m.date}>{memoryDate(m.date)}</time><p>{m.reflection || '말없이 남긴 작은 시도'}</p></li>)}</ul>
          : null}
        {questBlocked ? <p className="error star-limit-error">{DAILY_STAR_LIMIT_MESSAGE}</p> :
        <div className="sheet-actions">
          <Link className="primary sky-icon-action" href={`/stars/${selected.starId}`}>
            <SkyControlIcon name={selected.status === 'untried' ? 'star' : 'memory'} /> {selected.status === 'untried' ? '퀘스트 시작' : '이 별 다시 기록하기'}
          </Link>
        </div>}
      </div>
    </dialog>}
  </section>;
}
