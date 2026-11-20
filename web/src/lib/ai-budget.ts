// 사용자(데모 세션)별 AI 호출 한도 (고민기록 #45) — 신청 도우미처럼 말할 때마다 AI를 부르는 기능용
// 왜: 대화 10번 상한은 화면이 보내는 대화 기록으로 세므로, 기록을 빼고 보내면 끝없이 부를 수 있음
//     → 무료 한도(Gemini flash-lite 분당 15번)가 바닥나면 시연 중 체크인·추천까지 모든 AI가 기본 문장이 됨
// 서버 메모리에서 센다 (DB 변경 없음). 서버 인스턴스가 여러 개면 인스턴스마다 따로 세는 한계가 있지만,
// 한 사람이 몰아서 부르는 것은 막는다. 한도를 넘으면 AI 없이 규칙 답만 (aiStatus: "limited")

/** 바꿀 수 있게 객체로 (테스트가 작은 값으로 바꿔 확인) */
export const HELPER_LIMITS = { perMinute: 8, perDay: 80 };

type Count = { day: string; dayCount: number; minuteStart: number; minuteCount: number };
const counts = new Map<number, Count>();
const MAX_USERS = 5_000;

const kstDay = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * AI를 한 번 부를 수 있으면 세고 true, 한도를 넘었으면 false.
 * userId가 없으면(검증 스크립트처럼 서버 밖에서 직접 부를 때) 세지 않고 true
 */
export function takeAiBudget(userId: number | null | undefined, now = Date.now()): boolean {
  if (userId == null) return true;
  const day = kstDay(now);
  if (counts.size > MAX_USERS) {
    for (const [id, c] of counts) if (c.day !== day) counts.delete(id);
  }
  let c = counts.get(userId);
  if (!c || c.day !== day) {
    c = { day, dayCount: 0, minuteStart: now, minuteCount: 0 };
    counts.set(userId, c);
  }
  if (now - c.minuteStart >= 60_000) {
    c.minuteStart = now;
    c.minuteCount = 0;
  }
  if (c.dayCount >= HELPER_LIMITS.perDay || c.minuteCount >= HELPER_LIMITS.perMinute) return false;
  c.dayCount++;
  c.minuteCount++;
  return true;
}

/** 테스트용: 센 것을 모두 지움 */
export function resetAiBudget() {
  counts.clear();
}
