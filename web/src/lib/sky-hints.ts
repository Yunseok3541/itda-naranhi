// 메인(밤하늘) 처음 한 번 안내 (docs/기능발견성-조사.md "처음 한 번만 비춰 알려주기")
// - 둘러보기 카드는 한 번에 하나씩, 오늘의 별 이름은 캐릭터 옆에 표시
// - 이 브라우저에만 저장 (저장이 막혀도 화면은 그대로 동작, 이번 방문 동안만 기억)
import { useSyncExternalStore } from 'react';

/** 보여 주는 순서. 별똥별은 별똥별이 처음 지나갈 때 그 옆에서만 보여 줌 */
export const SKY_HINTS = ['drag', 'star', 'meteor', 'quest'] as const;
export type SkyHint = typeof SKY_HINTS[number];

const KEY = 'naranhi-sky-hints-v1';
const listeners = new Set<() => void>();
let done: Set<SkyHint> | null = null;
let snapshot = '';

function load() {
  if (done) return done;
  done = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) saved.forEach(id => { if ((SKY_HINTS as readonly string[]).includes(id)) done!.add(id); });
  } catch { /* 저장소를 못 읽으면 처음부터 */ }
  snapshot = [...done].sort().join(',');
  return done;
}

export function finishHint(id: SkyHint) {
  const set = load();
  if (set.has(id)) return;
  set.add(id);
  snapshot = [...set].sort().join(',');
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* 이번 방문 동안만 기억 */ }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 아직 안 끝난 안내 중 순서상 첫 번째 (별똥별 안내는 따로 hintPending('meteor')로 확인). 서버 렌더에서는 보여 주지 않음 */
export function useSkyHints() {
  const key = useSyncExternalStore(subscribe, () => { load(); return snapshot; }, () => null);
  const ready = key !== null;
  const finished = (id: SkyHint) => !ready || load().has(id);
  return {
    /** 지금 카드로 보여 줄 안내 (drag → star 순서) */
    current: ready ? (['drag', 'star'] as const).find(id => !finished(id)) ?? null : null,
    pending: (id: SkyHint) => !finished(id),
  };
}
