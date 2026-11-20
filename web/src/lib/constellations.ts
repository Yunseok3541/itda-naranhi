import type { Star } from './mobile-data';

export const activityConstellations = {
  1: { name: '카시오페이아자리', theme: '하루를 여는 작은 습관' },
  2: { name: '돌고래자리', theme: '나를 돌보는 시간' },
  3: { name: '거문고자리', theme: '현관 너머 한 걸음' },
} satisfies Record<number, { name: string; theme: string }>;

export function getActivityConstellation(id: number) {
  return Object.hasOwn(activityConstellations, id)
    ? activityConstellations[id as keyof typeof activityConstellations]
    : undefined;
}

/** Example records use the original activity IDs without constellation metadata. */
export function getStarConstellationId({ starId, constellationId }: { starId: number; constellationId?: number }) {
  return constellationId ?? (starId <= 5 ? 1 : starId <= 10 ? 2 : 3);
}

export function getCompletedConstellationIds(stars: readonly Star[]) {
  const completed = new Map<number, boolean>();
  for (const star of stars) {
    const id = getStarConstellationId(star);
    completed.set(id, completed.get(id) !== false && star.status === 'bright');
  }
  return new Set([...completed].filter(([, done]) => done).map(([id]) => id));
}
