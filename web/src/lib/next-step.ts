import { catalogConstellations, catalogQuest } from './quest-catalog';

/** 지금 제안하는 것은 swap(다른 별)·stop(쉬어 가기)뿐. smaller·retry는 예전에 저장된 계획을 읽기 위해 남겨 둠 (2026-11-22 고민기록) */
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
  /** 그 별의 별자리 이름 (제안 카드에 표시) */
  constellationName?: string;
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

/** Same source of candidates in API and example mode. No diagnosis or automatic promotion.
 *  - 방금 만난 별(손을 뻗었든 땄든)은 다시 권하지 않음 → "더 작게 해 보기"·"다른 날 그대로"는 제안하지 않음
 *  - 같은 별자리의 다른 별을 먼저, 그다음 다른 별자리. 같은 별자리 안에서는 아직 안 만난 별 먼저, 비슷한 결(주제·태그) 먼저
 *  - 단계를 올리지 않고(지금 별보다 어려운 별 제외), 오늘 고른 활동 범위 안에서만, 최대 3개 + 쉬어 가기 */
export function nextOptions(source: NextSource, quests: AvailableQuest[], scope: ActivityScope): NextOption[] {
  const current = quests.find(q => q.id === source.starId);
  if (!current || scope === 'rest') return [{ ...STOP_OPTION }];
  const meta = catalogQuest(current.id);
  const options: NextOption[] = [];
  const sameSky = (q: AvailableQuest) => q.constellationId === current.constellationId ? 1 : 0;
  const alternatives = quests.filter(q => {
    if (q.id === current.id || q.status === 'bright' || q.stage > current.stage || !inActivityScope(q, scope)) return false;
    const other = catalogQuest(q.id);
    if (!other || other.title !== q.title) return false;
    if (source.stopReason === 'cost' && !NO_PURCHASE_IDS.has(q.id)) return false;
    if (source.stopReason === 'crowded' && other.tags.includes('social')) return false;
    return true;
  }).sort((a, b) => {
    const untried = (q: AvailableQuest) => q.status === 'untried' ? 1 : 0;
    const score = (q: AvailableQuest) => {
      const other = catalogQuest(q.id)!;
      return (other.focus === meta?.focus ? 3 : 0)
        + other.tags.filter(t => meta?.tags.includes(t)).length
        + (source.stopReason === 'tired' || source.stopReason === 'no_time' ? current.stage - q.stage : 0);
    };
    return sameSky(b) - sameSky(a) || untried(b) - untried(a) || score(b) - score(a) || a.id - b.id;
  });
  for (const q of alternatives.slice(0, 3)) options.push({
    key: `swap:${q.id}`, action: 'swap', starId: q.id, subQuestId: null, title: q.title,
    constellationName: catalogConstellations.find(c => c.id === q.constellationId)?.name,
    reason: source.stopReason === 'cost' ? '물건을 사지 않고 해 볼 수 있는 다른 별이에요.'
      : source.stopReason === 'crowded' ? '사람이 많은 곳 대신 다른 방식으로 해 볼 수 있는 별이에요.'
        : sameSky(q) ? '같은 별자리에서 이어서 만날 수 있는 별이에요.' : '비슷한 결의 다른 별자리 별이에요.',
  });
  options.push({ ...STOP_OPTION });
  return options;
}

/** 우선 제안의 기본값 (AI가 없거나 틀렸을 때): 맨 앞 별(같은 별자리 먼저), 별이 없으면 쉬어 가기 */
export function defaultNextKey(options: NextOption[]) {
  return (options.find(o => o.action !== 'stop') ?? options[0]).key;
}

export function planMatches(plan: NextPlan, starId: number, subQuestId: number | null) {
  return plan.action !== 'stop' && plan.starId === starId && plan.subQuestId === subQuestId;
}
