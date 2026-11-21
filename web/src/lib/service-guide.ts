// 처음 시작 안내(서비스 가이드)와 메인 메뉴 안내를 봤는지 기억 (docs/온보딩.md)
// - 시작 질문을 처음 마친 사람에게만 보여 줌. 이미 쓰던 사람에게는 갑자기 뜨지 않음
// - 이 브라우저에만 저장. 저장이 막혀도 화면은 그대로 동작하고 이번 방문 동안만 기억
import { useSyncExternalStore } from 'react';

const GUIDE_KEY = 'naranhi-guide-v1';
const TOUR_KEY = 'naranhi-menu-tour-v1';
const GIFT_KEY = 'naranhi-first-friend-v1';
/** 시작 안내에서 별 3개를 따서 완성하는 첫 별자리: 토끼자리(5) · 친구 달콩. 별은 실제 기록으로 남아 도감·프로필은 완성 규칙 그대로 */
export const FIRST_FRIEND_CONSTELLATION = 5;
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

/** 시작 안내를 마친 직후 메인이 비출 별자리 (첫 친구를 만났으면 토끼자리). 한 번 쓰면 비움 */
let skyFocus: number | null = null;
/** 메인이 처음 비출 별자리를 미리 봄 (그리는 중에 비우지 않음, StrictMode에서 두 번 불려도 같은 값) */
export function peekSkyFocus() { return skyFocus; }
/** 메인이 그 별자리를 비춘 뒤 비움 */
export function clearSkyFocus() { skyFocus = null; }

/** 시작 안내를 끝냈거나 건너뜀 → 다음에 메인에 들어가면 메뉴 안내를 한 번 보여 줌 (첫 친구를 만났으면 토끼자리를 비춘 채) */
export function finishGuide() {
  skyFocus = hasFirstFriend() ? FIRST_FRIEND_CONSTELLATION : null;
  memory.guide = true;
  write(GUIDE_KEY, 'done');
  memory.tour = 'pending';
  write(TOUR_KEY, 'pending');
  listeners.forEach(listener => listener());
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

/** 시작 안내에서 토끼자리를 완성해 첫 친구(달콩)를 만났는지 (안내의 친구 장, 안내 뒤 메인의 지금 별자리에 씀) */
export function hasFirstFriend() {
  if (memory.gift === null) memory.gift = read(GIFT_KEY) === String(FIRST_FRIEND_CONSTELLATION);
  return memory.gift;
}

/** 시작 안내에서 토끼자리를 완성함. 처음이면 true */
export function giveFirstFriend() {
  if (hasFirstFriend()) return false;
  memory.gift = true;
  write(GIFT_KEY, String(FIRST_FRIEND_CONSTELLATION));
  listeners.forEach(listener => listener());
  return true;
}

/** 시작 안내에서 첫 친구를 만났는지 (구독). 서버 렌더에서는 false */
export function useFirstFriend() {
  return useSyncExternalStore(subscribe, hasFirstFriend, () => false);
}

/** 메인 메뉴 안내를 지금 보여 줘야 하는지. 서버 렌더에서는 보여 주지 않음 */
export function useMenuTourPending() {
  return useSyncExternalStore(subscribe, () => tourState() === 'pending', () => false);
}
