import type { PolicyInfo, StartAnswers } from './profile';
export type Mode = 'example' | 'api';
export type Profile = { startAnswers: StartAnswers | null; policyInfo: PolicyInfo; birthYear: number | null };
export type ProfileUpdate = { startAnswers?: StartAnswers; policyInfo?: PolicyInfo | null; birthYear?: number | null };
const profileKey = 'naranhi-example-profile';
export type Help = { title: string; lines: string[] } | null;
export type Status = 'untried' | 'dim' | 'bright';
// constellationId 등은 실제 API(/api/sky)에만 있음. 예시 모드는 별 번호로 별자리를 나눔 (night-sky.tsx)
export type Star = { starId: number; title: string; status: Status; memories: { attemptId: number; date: string; reflection: string | null }[]; description?: string | null; constellationId?: number; constellationName?: string; position?: number; verifyType?: string };
// GPS(도착 확인) 별인지: 실제 API는 /api/sky의 verifyType으로 판단 (별 ID는 시드마다 바뀜)
// 예시 모드 저장 데이터에는 verifyType이 없어 예시 목록의 GPS 별(16 편의점, 17 가상 청년센터)로 판단
const exampleGpsIds = new Set([16, 17]);
export function isGpsStar(star: Pick<Star, 'starId' | 'verifyType'>): boolean {
  return star.verifyType ? star.verifyType === 'gps' : exampleGpsIds.has(star.starId);
}
export type Checkin = { checkinId: number | null; weather: string; help: Help; usedFallback: boolean };
export type Recommendation = { starId: number; title: string; reason: string };
export const weatherNames: Record<string, string> = { sunny: '맑음', partly_cloudy: '구름 조금', cloudy: '흐림', rainy: '비', foggy: '안개' };
const key = 'naranhi-example-v1';
const titles = ['창문 열고 하늘 보기', '물 한 잔 마시기', '이불 정리하기', '좋아하는 노래 한 곡 듣기', '지도에서 내 주변 청년센터 찾아보기', '창가에서 햇빛 1분 쬐기', '5분 스트레칭하기', '방 환기하기', '따뜻한 물로 씻기', '오늘 먹은 것 기록하기', '쓰레기 버리고 오기', '현관 앞 5분 서 있기', '우편함 확인하기', '집 앞 계단 오르내리기', '청년센터 홈페이지에서 프로그램 둘러보기', '편의점 다녀오기', '가상 청년센터 앞까지 가 보기'];
type Store = { stars: Star[]; checkins: Record<number, { text: string; todayChoice: string; weather: string }> };
function read(): Store { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); return { stars: titles.map((title, i) => ({ starId: i + 1, title, status: 'untried', memories: [] })), checkins: {} }; }
function write(s: Store) { localStorage.setItem(key, JSON.stringify(s)); }
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
  async sky(): Promise<{ stars: Star[] }> { return mode === 'api' ? request('sky') : { stars: read().stars }; },
  async checkin(text: string, todayChoice: string): Promise<Checkin> { if (mode === 'api') return request('checkin', 'POST', { text, todayChoice }); const s = read(); const id = Date.now(); s.checkins[id] = { text, todayChoice, weather: 'partly_cloudy' }; write(s); return { checkinId: id, weather: 'partly_cloudy', help: null, usedFallback: true }; },
  async weather(checkinId: number, weather: string) { if (mode === 'api') return request('checkin/weather', 'PATCH', { checkinId, weather }); const s = read(); s.checkins[checkinId].weather = weather; write(s); return { weather }; },
  async recommendations(checkinId: number): Promise<{ items: Recommendation[]; usedFallback: boolean }> { if (mode === 'api') return request('recommendations', 'POST', { checkinId }); const s = read(); const choice = s.checkins[checkinId]?.todayChoice; const ids = choice === 'rest' ? [] : choice === 'home' ? [1, 2, 4] : [12, 13, 16]; return { items: ids.map(id => ({ starId: id, title: titles[id - 1], reason: '오늘 고른 활동 범위에서, 가볍게 시작할 수 있는 별이에요.' })), usedFallback: true }; },
  // 프로필 (시작 질문·정책 신청 정보). 예시 모드는 이 브라우저에만 저장
  async profile(): Promise<Profile> { if (mode === 'api') return request('profile'); const raw = localStorage.getItem(profileKey); return raw ? JSON.parse(raw) : { startAnswers: null, policyInfo: { job: null, school: null, married: null, income: null, special: null }, birthYear: null }; },
  async saveProfile(update: ProfileUpdate): Promise<Profile> { if (mode === 'api') return request('profile', 'PUT', update); const next = { ...(await this.profile()), ...update }; if (next.policyInfo === null) next.policyInfo = { job: null, school: null, married: null, income: null, special: null }; localStorage.setItem(profileKey, JSON.stringify(next)); return next as Profile; },
  async attempt(body: { starId: number; status: 'dim' | 'bright'; reflection: string; verifyMethod: string; stopReason?: string }): Promise<{ attemptId: number; starId: number; status: string; cheer: string; help: Help }> { if (mode === 'api') return request('attempts', 'POST', body); const s = read(); const star = s.stars.find(x => x.starId === body.starId); if (!star) throw new Error('별을 찾을 수 없어요.'); const id = Date.now(); star.status = star.status === 'bright' ? 'bright' : body.status; star.memories.push({ attemptId: id, date: new Date().toISOString(), reflection: body.reflection }); write(s); return { attemptId: id, starId: body.starId, status: body.status, cheer: '오늘 손을 뻗은 순간도 당신의 하늘에 남아요.', help: null }; }
}; }
