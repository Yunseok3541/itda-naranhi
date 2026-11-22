// 처음 시작 안내(서비스 가이드)와 메인 메뉴 안내를 봤는지 기억 (docs/온보딩.md)
// - 시작 질문을 처음 마친 사람에게만 보여 줌. 이미 쓰던 사람에게는 갑자기 뜨지 않음
// - 이 브라우저에만 저장. 저장이 막혀도 화면은 그대로 동작하고 이번 방문 동안만 기억
import { useSyncExternalStore } from 'react';
import { FIRST_FRIEND_CONSTELLATION } from './quest-catalog';

const GUIDE_KEY = 'naranhi-guide-v1';
const TOUR_KEY = 'naranhi-menu-tour-v1';
const GIFT_KEY = 'naranhi-first-friend-v1';
type TourState = 'pending' | 'done' | null;

const memory: { guide: boolean | null; tour: TourState | undefined; gift: boolean | null } = { guide: null, tour: undefined, gift: null };
const listeners = new Set<() => void>();

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 이번 방문 동안만 기억 */ }
}
function tourState(): TourState {
  if (memory.tour === undefined) {
    const saved = read(TOUR_KEY);
    memory.tour = saved === 'pending' || saved === 'done' ? saved : null;
  }
  return memory.tour;
}

/** 시작 안내를 이미 봤거나 건너뛰었는지 */
export function guideSeen() {
  if (memory.guide === null) memory.guide = read(GUIDE_KEY) === 'done';
  return memory.guide;
}

/** 시작 안내를 마친 직후 메인이 비출 별자리 (첫 친구를 만났으면 양자리). 한 번 쓰면 비움 */
let skyFocus: number | null = null;
/** 메인이 처음 비출 별자리를 미리 봄 (그리는 중에 비우지 않음, StrictMode에서 두 번 불려도 같은 값) */
export function peekSkyFocus() { return skyFocus; }
/** 메인이 그 별자리를 비춘 뒤 비움 */
export function clearSkyFocus() { skyFocus = null; }

/** 시작 안내를 끝냈거나 건너뜀 → 다음에 메인에 들어가면 밤하늘이 반짝이며 생기는 연출 뒤 메뉴 안내를 한 번 보여 줌 (첫 친구를 만났으면 양자리를 비춘 채) */
export function finishGuide() {
  skyFocus = hasFirstFriend() ? FIRST_FRIEND_CONSTELLATION : null;
  memory.guide = true;
  write(GUIDE_KEY, 'done');
  memory.tour = 'pending';
  write(TOUR_KEY, 'pending');
  queueSkyReveal();
  listeners.forEach(listener => listener());
}

/* ── 밤하늘이 반짝이며 생기는 연출 (시작 안내 직후 메인에 처음 들어갈 때 한 번, 이번 방문 동안만) ──
   배경 별이 하나씩 켜지고(sky-panorama.tsx) 퀘스트 별·별자리 선·버튼이 차례로 나타난 뒤(night-sky.css .sky-reveal) 잠깐 쉬고 메뉴 안내.
   - 움직임 줄이기 설정이면 연출 없이 바로 메뉴 안내
   - 가벼운 연출(lite): 저사양으로 보이거나 연출 초반에 버벅이면 시점 이동 없이, 배경은 이미 켜진 별을 모아 두고 새로 켜지는 별만 그림
   - 버튼이 나타나기 전(hidden)에는 눌리지 않게 (mobile-flow.tsx가 inert) */
/** 연출 시작부터 메뉴 안내까지 (마지막 요소가 나타나고 0.4초 쉼) */
export const SKY_REVEAL_MS = 3600;
/** 이때까지는 버튼·별이 아직 숨어 있음 (마지막으로 캐릭터가 나타나기 시작하는 때, night-sky.css) */
const SKY_REVEAL_HIDDEN_MS = 2500;
let reveal: 'queued' | 'hidden' | 'showing' | null = null;
let revealStart = 0;
let revealLite = false;
const revealTimers: number[] = [];
function emitReveal() { listeners.forEach(listener => listener()); }
/** 저사양 기기로 보이는지 (메모리 2GB 이하·데이터 절약 모드, 지원하는 브라우저만). 나머지는 연출 초반 프레임으로 판단 */
function lowPowerDevice() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData;
}
function queueSkyReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  reveal = 'queued';
  revealLite = lowPowerDevice();
}
/** 메인이 처음 그려졌을 때 부름 → 연출 시작 (예약이 없으면 아무 일 없음) */
export function startSkyReveal() {
  if (reveal !== 'queued') return;
  reveal = 'hidden';
  revealStart = performance.now();
  emitReveal();
  revealTimers.splice(0).forEach(timer => window.clearTimeout(timer));
  revealTimers.push(
    window.setTimeout(() => { reveal = 'showing'; emitReveal(); }, SKY_REVEAL_HIDDEN_MS),
    window.setTimeout(() => { reveal = null; emitReveal(); }, SKY_REVEAL_MS),
  );
}
/** 연출이 예약만 되고 아직 시작 전인지 (메인이 첫 시점을 정할 때: 살짝 아래에서 올려다보며 시작) */
export function skyRevealQueued() { return reveal === 'queued'; }
/** 가벼운 연출인지 (시점 이동 없음, 배경을 나눠 그림) */
export function skyRevealLite() { return revealLite; }
/** 연출 초반에 버벅이면 가벼운 연출로 바꿈 (배경이 프레임을 재서 부름). 처음 바꿀 때만 true */
export function lightenSkyReveal() {
  if (revealLite || reveal === null) return false;
  revealLite = true;
  emitReveal();
  return true;
}
/** 연출이 시작되고 지난 시간(ms). 예약만 됐으면 0(별을 숨겨 둠), 연출이 없으면 null */
export function skyRevealElapsed() {
  return reveal === 'hidden' || reveal === 'showing' ? performance.now() - revealStart : reveal === 'queued' ? 0 : null;
}
/** 연출 상태가 바뀔 때 (배경이 별을 다시 그리도록) */
export function subscribeSkyReveal(listener: () => void) { return subscribe(listener); }
/** 연출 중(예약 포함)이면 true: 메뉴 안내를 미루고 메인에 .sky-reveal */
export function useSkyRevealing() {
  return useSyncExternalStore(subscribe, () => reveal !== null, () => false);
}
/** 연출 중이고 가벼운 연출이면 true (main의 data-reveal-lite: 개발자 도구·측정에서 확인용) */
export function useSkyRevealLite() {
  return useSyncExternalStore(subscribe, () => reveal !== null && revealLite, () => false);
}
/** 버튼·별이 아직 숨어 있는 동안 true: 눌리거나 초점이 가지 않게 inert */
export function useSkyRevealHidden() {
  return useSyncExternalStore(subscribe, () => reveal === 'queued' || reveal === 'hidden', () => false);
}

/** 메뉴 안내만 다시 띄움 (/sky?tour=1, 확인·시연용) */
export function restartMenuTour() {
  memory.tour = 'pending';
  write(TOUR_KEY, 'pending');
  listeners.forEach(listener => listener());
}

/** 메뉴 안내를 닫음 (다시 나오지 않음) */
export function finishMenuTour() {
  memory.tour = 'done';
  write(TOUR_KEY, 'done');
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 시작 안내에서 양자리를 완성해 첫 친구(별마중)를 만났는지 (안내의 친구 장, 안내 뒤 메인의 지금 별자리에 씀) */
export function hasFirstFriend() {
  if (memory.gift === null) memory.gift = read(GIFT_KEY) === String(FIRST_FRIEND_CONSTELLATION);
  return memory.gift;
}

/** 시작 안내에서 양자리를 완성함. 처음이면 true */
export function giveFirstFriend() {
  if (hasFirstFriend()) return false;
  memory.gift = true;
  write(GIFT_KEY, String(FIRST_FRIEND_CONSTELLATION));
  listeners.forEach(listener => listener());
  return true;
}

/** 메인 메뉴 안내를 지금 보여 줘야 하는지. 서버 렌더에서는 보여 주지 않음 */
export function useMenuTourPending() {
  return useSyncExternalStore(subscribe, () => tourState() === 'pending', () => false);
}
