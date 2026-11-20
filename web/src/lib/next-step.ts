import { catalogQuest } from './quest-catalog';

export type NextAction = 'smaller' | 'retry' | 'swap' | 'stop';
export type ActivityScope = 'rest' | 'home' | 'near' | 'out';
export type NextOption = {
  key: string;
  action: NextAction;
  starId: number | null;
  subQuestId: number | null;
  title: string;
  reason: string;
  preparationHref?: string;
};
export type NextPlan = NextOption & { attemptId: number };
export type NextRecommendation = {
  attemptId: number;
  options: NextOption[];
  recommendedKey: string;
  usedFallback: boolean;
  help: { title: string; lines: string[] } | null;
};
export type NextSource = {
  attemptId: number;
  starId: number;
  status: 'dim' | 'bright';
  stopReason: string | null;
  reflection: string | null;
  subQuestId?: number | null;
};
export type AvailableQuest = {
  id: number;
  title: string;
  stage: number;
  constellationId: number;
  outside: boolean;
  status: string;
  subQuests: { id: number; title: string }[];
};

// Only explicitly reviewed no-purchase activities qualify as cost alternatives.
// Absence of a price in a description is not evidence that an activity is free.
const NO_PURCHASE_IDS = new Set([1, 3, 4, 5, 7, 8, 9, 21, 22, 24, 25, 28, 29, 35, 38, 39, 40]);
export const STOP_OPTION: NextOption = {
  key: 'stop', action: 'stop', starId: null, subQuestId: null,
  title: '오늘은 여기서 마치기', reason: '다음 활동을 정하지 않고 쉬어 가도 괜찮아요.',
};

export function inActivityScope(q: AvailableQuest, scope: ActivityScope) {
  if (scope === 'rest') return false;
  if (scope === 'home') return !q.outside;
  if (scope === 'near') return q.stage <= 2;
  return true;
}

/** Same source of candidates in API and example mode. No diagnosis or automatic promotion. */
export function nextOptions(source: NextSource, quests: AvailableQuest[], scope: ActivityScope): NextOption[] {
  const current = quests.find(q => q.id === source.starId);
  if (!current || scope === 'rest') return [{ ...STOP_OPTION }];
  const meta = catalogQuest(current.id);
  const options: NextOption[] = [];
  if (source.status === 'dim' && source.stopReason !== 'cost' && inActivityScope(current, scope)) {
    // Do not recommend the very same sub-quest immediately after trying it.
    for (const sub of current.subQuests.filter(s => s.id !== source.subQuestId).slice(0, 1)) {
      options.push({ key: `smaller:${sub.id}`, action: 'smaller', starId: current.id, subQuestId: sub.id,
        title: sub.title, reason: '같은 별을 미리 준비된 더 작은 활동으로 만나 볼 수 있어요.',
        ...(meta?.category === 'center' && /문의 문장/.test(sub.title) ? { preparationHref: '/centers' } : {}),
      });
    }
    // Keep the exact smaller activity when choosing to retry on a different day.
    const previousSub = current.subQuests.find(s => s.id === source.subQuestId);
    options.push({ key: 'retry', action: 'retry', starId: current.id, subQuestId: previousSub?.id ?? null,
      title: previousSub?.title ?? current.title,
      reason: '오늘 상황이 맞지 않았다면, 같은 활동을 다른 날 선택해도 괜찮아요.',
    });
  }
  const alternatives = quests.filter(q => {
    if (q.id === current.id || q.status === 'bright' || q.stage > current.stage || !inActivityScope(q, scope)) return false;
    const other = catalogQuest(q.id);
    if (!other || other.title !== q.title) return false;
    if (source.stopReason === 'cost' && !NO_PURCHASE_IDS.has(q.id)) return false;
    if (source.stopReason === 'crowded' && other.tags.includes('social')) return false;
    return true;
  }).sort((a, b) => {
    const score = (q: AvailableQuest) => {
      const other = catalogQuest(q.id)!;
      return (q.constellationId === current.constellationId ? 4 : 0)
        + (other.focus === meta?.focus ? 3 : 0)
        + other.tags.filter(t => meta?.tags.includes(t)).length
        + (source.stopReason === 'tired' || source.stopReason === 'no_time' ? current.stage - q.stage : 0);
    };
    return score(b) - score(a) || a.id - b.id;
  });
  for (const q of alternatives.slice(0, 3)) options.push({
    key: `swap:${q.id}`, action: 'swap', starId: q.id, subQuestId: null, title: q.title,
    reason: source.stopReason === 'cost' ? '물건을 사지 않고 해 볼 수 있는 목록의 다른 별이에요.'
      : source.stopReason === 'crowded' ? '함께하는 활동 대신 다른 방식으로 해 볼 수 있는 별이에요.'
        : '현재 활동과 관련된 기존 목록에서 고른 다른 별이에요.',
  });
  options.push({ ...STOP_OPTION });
  return options;
}

export function defaultNextKey(source: NextSource, options: NextOption[]) {
  const preferred = source.status === 'bright' || source.stopReason === 'cost' || source.stopReason === 'not_for_me'
    ? 'swap' : source.stopReason === 'weather' ? 'retry' : 'smaller';
  return (options.find(o => o.action === preferred) ?? options.find(o => o.action !== 'stop') ?? options[0]).key;
}

export function planMatches(plan: NextPlan, starId: number, subQuestId: number | null) {
  return plan.action !== 'stop' && plan.starId === starId && plan.subQuestId === subQuestId;
}
