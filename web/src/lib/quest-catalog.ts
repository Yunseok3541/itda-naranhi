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
export function catalogQuest(id: number) {
  return catalogQuests.find(q => q.id === id);
}
