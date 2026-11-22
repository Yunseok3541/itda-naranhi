// Public, reviewed content only. Never import DB / Gemini modules into this catalog.
import source from '../../../quests.json';

export type CatalogQuest = {
  id: number;
  stage: number;
  focus: string;
  title: string;
  description: string;
  easier_title: string;
  tags: string[];
  is_outside: boolean;
  category?: string;
  verify_type?: string;
};

export const catalogQuests: readonly CatalogQuest[] = source.quests;
export const catalogConstellations = source.constellations;
export const FIRST_FRIEND_CONSTELLATION = 11;
export const TUTORIAL_STAR_IDS = catalogConstellations.find(group => group.id === FIRST_FRIEND_CONSTELLATION)!.quests;
/** 양자리 두 번째 별 "지금 마음에 가까운 날씨 고르기": 시작 안내와 별 기록 화면 모두 날씨를 고를 수 있음 (기록 한 줄에 "마음 날씨 · 맑음") */
export const WEATHER_STAR_ID = TUTORIAL_STAR_IDS[1];
export function catalogQuest(id: number) {
  return catalogQuests.find(q => q.id === id);
}
