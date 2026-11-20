import type { Star } from './mobile-data';
import { catalogConstellations } from './quest-catalog';

export function getActivityConstellation(id: number) {
  return catalogConstellations.find(constellation => constellation.id === id);
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
