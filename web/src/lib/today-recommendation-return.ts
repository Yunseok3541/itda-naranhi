import type { Checkin, Mode, Recommendation } from './mobile-data';

type RecommendationReturn = {
  day: string;
  mode: Mode;
  items: Recommendation[];
  fallback: boolean;
  needsHelp: boolean;
  text?: string;
  choice?: string;
  check?: Checkin;
};

const returnKey = 'naranhi-today-recommendations';
export const recommendationDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
let returnVisit: RecommendationReturn | null = null;

export function readReturnVisit(mode: Mode) {
  const day = recommendationDay();
  if (returnVisit?.mode === mode && returnVisit.day === day) return returnVisit;
  try {
    const cached = JSON.parse(sessionStorage.getItem(returnKey) ?? 'null') as RecommendationReturn | null;
    if (cached?.mode === mode && cached.day === day && Array.isArray(cached.items)) return cached;
  } catch { /* Storage can be unavailable. */ }
  return null;
}

export function saveReturnVisit(visit: RecommendationReturn) {
  returnVisit = visit;
  const { day, mode, items, fallback, needsHelp } = visit;
  try {
    sessionStorage.setItem(returnKey, JSON.stringify({ day, mode, items, fallback, needsHelp }));
  } catch { /* In-memory navigation remains available. */ }
}
