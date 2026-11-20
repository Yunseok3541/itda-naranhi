import type { PolicyInfo, StartAnswers } from './profile';
import { NO_FACTS, readFacts, type MilestoneFacts } from './milestones';
import { catalogConstellations, catalogQuest, catalogQuests } from './quest-catalog';
import { defaultNextKey, inActivityScope, nextOptions, planMatches, type ActivityScope, type AvailableQuest,
  type NextPlan, type NextRecommendation, type NextSource } from './next-step';
import { ruleHelp } from './safety';
export type Mode = 'example' | 'api';
export type Profile = { startAnswers: StartAnswers | null; policyInfo: PolicyInfo; birthYear: number | null };
export type ProfileUpdate = { startAnswers?: StartAnswers; policyInfo?: PolicyInfo | null; birthYear?: number | null };
const profileKey = 'naranhi-example-profile';
export type Help = { title: string; lines: string[] } | null;
export type Status = 'untried' | 'dim' | 'bright';
// constellationId 등은 실제 API(/api/sky)에만 있음. 예시 모드는 별 번호로 별자리를 나눔 (night-sky.tsx)
export type Star = { starId: number; title: string; status: Status; memories: { attemptId: number; date: string; reflection: string | null; status?: 'dim' | 'bright'; stopReason?: string | null; subQuestId?: number | null; parentAttemptId?: number | null; customTitle?: string | null }[]; description?: string | null; constellationId?: number; constellationName?: string; position?: number; verifyType?: string };
// GPS(도착 확인) 별인지: 실제 API는 /api/sky의 verifyType으로 판단 (별 ID는 시드마다 바뀜)
// 예시 모드 저장 데이터에는 verifyType이 없어 예시 목록의 GPS 별(16 편의점, 17 가상 청년센터)로 판단
const exampleGpsIds = new Set([16, 17]);
export function isGpsStar(star: Pick<Star, 'starId' | 'verifyType'>): boolean {
  return star.verifyType ? star.verifyType === 'gps' : exampleGpsIds.has(star.starId);
}
export type Checkin = { checkinId: number | null; weather: string; help: Help; usedFallback: boolean };
export type Recommendation = { starId: number; title: string; reason: string };
export const weatherNames: Record<string, string> = { sunny: '맑음', partly_cloudy: '구름 조금', cloudy: '흐림', rainy: '비', foggy: '안개' };
// New IDs mean old example records cannot be relabelled safely. Leave v1 untouched.
const key = 'naranhi-example-v2';
type Store = { stars: Star[]; checkins: Record<number, { text: string; todayChoice: string; weather: string }>; nextPlan?: NextPlan | null };
function read(): Store {
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  return { stars: catalogConstellations.flatMap(c => c.quests.map((id, position) => {
    const q = catalogQuest(id)!;
    return { starId: id, title: q.title, description: q.description, constellationId: c.id,
      constellationName: c.name, position: position + 1, verifyType: q.verify_type ?? 'self',
      status: 'untried' as const, memories: [] };
  })), checkins: {} };
}
function write(s: Store) { localStorage.setItem(key, JSON.stringify(s)); }
function exampleContext(s: Store, attemptId: number) {
  const star = s.stars.find(st => st.memories.some(m => m.attemptId === attemptId));
  const memory = star?.memories.find(m => m.attemptId === attemptId);
  if (!star || !memory) throw new Error('시도 기록을 찾을 수 없어요.');
  const source: NextSource = { attemptId, starId: star.starId, status: memory.status ?? 'dim',
    stopReason: memory.stopReason ?? null, reflection: memory.reflection, subQuestId: memory.subQuestId ?? null };
  const quests: AvailableQuest[] = s.stars.map(st => {
    const q = catalogQuest(st.starId)!;
    return { id: st.starId, title: st.title, stage: q.stage, outside: q.is_outside,
      constellationId: st.constellationId!, status: st.status,
      subQuests: q.easier_title ? [{ id: q.id, title: q.easier_title }] : [] };
  });
  const latest = Object.values(s.checkins).at(-1)?.todayChoice;
  const scope: ActivityScope = latest && ['rest', 'home', 'near', 'out'].includes(latest) ? latest as ActivityScope : 'out';
  const help = ruleHelp(memory.reflection);
  const options = nextOptions(source, quests, scope).filter(o => !help || o.action === 'stop');
  return { source, options, help };
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly help: Help = null) {
    super(message);
    this.name = 'ApiError';
  }

  get needsSession() {
    return this.code === 'DEMO_SESSION_REQUIRED' || this.code === 'NO_SESSION' || this.status === 401;
  }
}

export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.error || `요청에 실패했어요 (${response.status}). 다시 시도해 주세요.`, response.status, data?.code, data?.help ?? null);
  if (!data) throw new Error('서버 응답을 읽지 못했어요.');
  return data as T;
}
export function client(mode: Mode) { return {
  async start() { if (mode === 'api') { const r = await request<{ ready: boolean }>('demo/session', 'POST', {}); if (!r.ready) throw new Error('데모 세션을 시작하지 못했어요.'); } else write(read()); localStorage.setItem('naranhi-mode', mode); },
  async sky(): Promise<{ stars: Star[]; totalPoints?: number }> {
    if (mode === 'api') return request('sky');
    const stars = read().stars;
    return { stars, totalPoints: stars.reduce((sum, st) => sum + (st.status === 'bright' ? catalogQuest(st.starId)!.stage * 10 : 0), 0) };
  },
  async checkin(text: string, todayChoice: string): Promise<Checkin> { if (mode === 'api') return request('checkin', 'POST', { text, todayChoice }); const s = read(); const id = Date.now(); s.checkins[id] = { text, todayChoice, weather: 'partly_cloudy' }; write(s); return { checkinId: id, weather: 'partly_cloudy', help: null, usedFallback: true }; },
  async weather(checkinId: number, weather: string) { if (mode === 'api') return request('checkin/weather', 'PATCH', { checkinId, weather }); const s = read(); s.checkins[checkinId].weather = weather; write(s); return { weather }; },
  async recommendations(checkinId: number): Promise<{ items: Recommendation[]; usedFallback: boolean }> {
    if (mode === 'api') return request('recommendations', 'POST', { checkinId });
    const s = read(); const scope = (s.checkins[checkinId]?.todayChoice ?? 'home') as ActivityScope;
    const items = catalogQuests.filter(q => inActivityScope({ ...q, outside: q.is_outside, constellationId: 0, status: '', subQuests: [] }, scope)
      && (scope === 'out' || q.stage <= (scope === 'near' ? 2 : 1)) && s.stars.find(st => st.starId === q.id)?.status !== 'bright')
      .slice(0, 3).map(q => ({ starId: q.id, title: q.title, reason: '오늘 고른 활동 범위에서 해 볼 수 있는 별이에요.' }));
    return { items, usedFallback: true };
  },
  async nextSteps(attemptId: number): Promise<NextRecommendation> {
    if (mode === 'api') return request('next-steps', 'POST', { attemptId });
    const { source, options, help } = exampleContext(read(), attemptId);
    return { attemptId, options, recommendedKey: defaultNextKey(source, options), usedFallback: true, help };
  },
  async chooseNext(attemptId: number, optionKey: string): Promise<{ plan: NextPlan | null }> {
    if (mode === 'api') return request('next-steps', 'PATCH', { attemptId, key: optionKey });
    const s = read();
    if (s.stars.some(st => st.memories.some(m => m.parentAttemptId === attemptId))) throw new Error('이미 이어서 기록한 행동이에요.');
    const option = exampleContext(s, attemptId).options.find(o => o.key === optionKey);
    if (!option) throw new Error('지금 선택할 수 있는 행동이 아니에요.');
    s.nextPlan = option.action === 'stop' ? null : { ...option, attemptId }; write(s);
    return { plan: s.nextPlan };
  },
  async pendingNext(): Promise<{ plan: NextPlan | null }> {
    return mode === 'api' ? request('next-steps') : { plan: read().nextPlan ?? null };
  },
  // 프로필 (시작 질문·정책 신청 정보). 예시 모드는 이 브라우저에만 저장
  async profile(): Promise<Profile> { if (mode === 'api') return request('profile'); const raw = localStorage.getItem(profileKey); return raw ? JSON.parse(raw) : { startAnswers: null, policyInfo: { job: null, school: null, married: null, income: null, special: null }, birthYear: null }; },
  async saveProfile(update: ProfileUpdate): Promise<Profile> { if (mode === 'api') return request('profile', 'PUT', update); const next = { ...(await this.profile()), ...update }; if (next.policyInfo === null) next.policyInfo = { job: null, school: null, married: null, income: null, special: null }; localStorage.setItem(profileKey, JSON.stringify(next)); return next as Profile; },
  // 프로필 배지 판정용 사실들 (규칙: lib/milestones.ts). 예시 모드는 이 브라우저의 예시 기록으로 어림
  async milestones(): Promise<MilestoneFacts> {
    if (mode === 'api') return readFacts((await request<{ facts: unknown }>('milestones')).facts);
    const s = read();
    const tried = s.stars.filter(x => x.status !== 'untried' || x.memories.length > 0);
    const has = (fn: (st: Star) => boolean) => tried.some(fn);
    const choices = Object.values(s.checkins).map(c => c.todayChoice);
    let inquiry = false;
    try { inquiry = Object.keys(localStorage).some(k => k.startsWith('naranhi-example-inquiry-')); } catch { /* 저장소를 못 쓰면 없음 */ }
    return {
      ...NO_FACTS,
      firstAttempt: tried.length > 0,
      checkin: choices.length > 0,
      reflection: has(st => st.memories.some(m => !!m.reflection?.trim())),
      dim: has(st => st.status === 'dim' || st.memories.some(m => m.status === 'dim')),
      retried: has(st => { const i = st.memories.findIndex(m => m.status === 'dim'); return i >= 0 && st.memories.slice(i + 1).some(m => m.status === 'bright'); }),
      rested: choices.includes('rest'),
      nearTried: has(st => catalogQuest(st.starId)!.is_outside && catalogQuest(st.starId)!.stage >= 2),
      outsideTried: has(st => catalogQuest(st.starId)!.is_outside),
      centerBright: s.stars.some(st => st.starId === 17 && st.status === 'bright'),
      inquiryDrafted: inquiry,
    };
  },
  async attempt(body: { starId: number; status: 'dim' | 'bright'; reflection: string; verifyMethod: string; stopReason?: string; parentAttemptId?: number; subQuestId?: number | null }): Promise<{ attemptId: number; starId: number; status: string; cheer: string; help: Help; pointsEarned?: number; totalPoints?: number }> {
    if (mode === 'api') return request('attempts', 'POST', body);
    const s = read(); const star = s.stars.find(x => x.starId === body.starId);
    if (!star) throw new Error('별을 찾을 수 없어요.');
    if (body.parentAttemptId && (!s.nextPlan || s.nextPlan.attemptId !== body.parentAttemptId || !planMatches(s.nextPlan, body.starId, body.subQuestId ?? null))) throw new Error('이어갈 행동을 다시 확인해 주세요.');
    const customTitle = body.subQuestId ? catalogQuest(star.starId)?.easier_title : null;
    const id = Math.max(Date.now(), ...s.stars.flatMap(st => st.memories.map(m => m.attemptId + 1)));
    const pointsEarned = star.status !== 'bright' && body.status === 'bright' ? catalogQuest(star.starId)!.stage * 10 : 0;
    star.status = star.status === 'bright' ? 'bright' : body.status;
    star.memories.push({ attemptId: id, date: new Date().toISOString(), reflection: body.reflection, status: body.status,
      stopReason: body.stopReason, parentAttemptId: body.parentAttemptId, subQuestId: body.subQuestId, customTitle });
    if (body.parentAttemptId) s.nextPlan = null;
    write(s);
    const totalPoints = s.stars.reduce((sum, st) => sum + (st.status === 'bright' ? catalogQuest(st.starId)!.stage * 10 : 0), 0);
    return { attemptId: id, starId: body.starId, status: body.status, cheer: '오늘 손을 뻗은 순간도 당신의 하늘에 남아요.', help: ruleHelp(body.reflection), pointsEarned, totalPoints };
  }
}; }
