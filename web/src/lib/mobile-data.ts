export type Mode = 'example' | 'api';
export type Help = { title: string; lines: string[] } | null;
export type Status = 'untried' | 'dim' | 'bright';
export type Star = { starId: number; title: string; status: Status; memories: { attemptId: number; date: string; reflection: string }[] };
export type Checkin = { checkinId: number | null; weather: string; help: Help; usedFallback: boolean };
export type Recommendation = { starId: number; title: string; reason: string };
export const weatherNames: Record<string, string> = { sunny: '맑음', partly_cloudy: '구름 조금', cloudy: '흐림', rainy: '비', foggy: '안개' };
const key = 'naranhi-example-v1';
const titles = ['창문 열고 하늘 보기', '물 한 잔 마시기', '이불 정리하기', '좋아하는 노래 한 곡 듣기', '지도에서 내 주변 청년센터 찾아보기', '창가에서 햇빛 1분 쬐기', '5분 스트레칭하기', '방 환기하기', '따뜻한 물로 씻기', '오늘 먹은 것 기록하기', '쓰레기 버리고 오기', '현관 앞 5분 서 있기', '우편함 확인하기', '집 앞 계단 오르내리기', '청년센터 홈페이지에서 프로그램 둘러보기', '편의점 다녀오기', '가상 청년센터 앞까지 가 보기'];
type Store = { stars: Star[]; checkins: Record<number, { text: string; todayChoice: string; weather: string }> };
function read(): Store { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); return { stars: titles.map((title, i) => ({ starId: i + 1, title, status: 'untried', memories: [] })), checkins: {} }; }
function write(s: Store) { localStorage.setItem(key, JSON.stringify(s)); }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `요청에 실패했어요 (${response.status}). 다시 시도해 주세요.`);
  if (!data) throw new Error('서버 응답을 읽지 못했어요.');
  return data as T;
}
export function client(mode: Mode) { return {
  async start() { if (mode === 'api') { const r = await request<{ ready: boolean }>('demo/session', 'POST', {}); if (!r.ready) throw new Error('데모 세션을 시작하지 못했어요.'); } else write(read()); localStorage.setItem('naranhi-mode', mode); },
  async sky(): Promise<{ stars: Star[] }> { return mode === 'api' ? request('sky') : { stars: read().stars }; },
  async checkin(text: string, todayChoice: string): Promise<Checkin> { if (mode === 'api') return request('checkin', 'POST', { text, todayChoice }); const s = read(); const id = Date.now(); s.checkins[id] = { text, todayChoice, weather: 'partly_cloudy' }; write(s); return { checkinId: id, weather: 'partly_cloudy', help: null, usedFallback: true }; },
  async weather(checkinId: number, weather: string) { if (mode === 'api') return request('checkin/weather', 'PATCH', { checkinId, weather }); const s = read(); s.checkins[checkinId].weather = weather; write(s); return { weather }; },
  async recommendations(checkinId: number): Promise<{ items: Recommendation[]; usedFallback: boolean }> { if (mode === 'api') return request('recommendations', 'POST', { checkinId }); const s = read(); const choice = s.checkins[checkinId]?.todayChoice; const ids = choice === 'rest' ? [] : choice === 'home' ? [1, 2, 4] : [12, 13, 16]; return { items: ids.map(id => ({ starId: id, title: titles[id - 1], reason: '오늘 고른 활동 범위에서, 가볍게 시작할 수 있는 별이에요.' })), usedFallback: true }; },
  async attempt(body: { starId: number; status: 'dim' | 'bright'; reflection: string; verifyMethod: string; stopReason?: string }): Promise<{ attemptId: number; starId: number; status: string; cheer: string; help: Help }> { if (mode === 'api') return request('attempts', 'POST', body); const s = read(); const star = s.stars.find(x => x.starId === body.starId); if (!star) throw new Error('별을 찾을 수 없어요.'); const id = Date.now(); star.status = star.status === 'bright' ? 'bright' : body.status; star.memories.push({ attemptId: id, date: new Date().toISOString(), reflection: body.reflection }); write(s); return { attemptId: id, starId: body.starId, status: body.status, cheer: '오늘 손을 뻗은 순간도 당신의 하늘에 남아요.', help: null }; }
}; }
