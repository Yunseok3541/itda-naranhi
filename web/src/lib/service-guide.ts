// 처음 시작 안내(서비스 가이드)와 메인 메뉴 안내를 봤는지 기억 (docs/온보딩.md)
// - 시작 질문을 처음 마친 사람에게만 보여 줌. 이미 쓰던 사람에게는 갑자기 뜨지 않음
// - 이 브라우저에만 저장. 저장이 막혀도 화면은 그대로 동작하고 이번 방문 동안만 기억
import { useSyncExternalStore } from 'react';

const GUIDE_KEY = 'naranhi-guide-v1';
const TOUR_KEY = 'naranhi-menu-tour-v1';
type TourState = 'pending' | 'done' | null;

const memory: { guide: boolean | null; tour: TourState | undefined } = { guide: null, tour: undefined };
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

/** 시작 안내를 끝냈거나 건너뜀 → 다음에 메인에 들어가면 메뉴 안내를 한 번 보여 줌 */
export function finishGuide() {
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

/** 메인 메뉴 안내를 지금 보여 줘야 하는지. 서버 렌더에서는 보여 주지 않음 */
export function useMenuTourPending() {
  return useSyncExternalStore(subscribe, () => tourState() === 'pending', () => false);
}
