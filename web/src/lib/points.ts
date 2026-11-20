// 별 말고 다른 곳에서 받는 포인트 규칙 (고민기록 #32). 별 포인트(난이도 × 10)는 DB 뷰 v_star_points에 있다
// 서버 전용 모듈을 가져오지 않으므로 화면에서도 import해 쓸 수 있다 (숫자는 GET /api/points 응답으로도 내려줌)

/** 유성 하나를 터치하면 받는 포인트 */
export const METEOR_POINTS = 1;
/** 데일리 체크인을 하루 처음 마치면 받는 포인트 (한국 날짜 기준 하루 한 번) */
export const CHECKIN_POINTS = 100;

/**
 * 유성은 서버 시각 기준으로 이 간격마다 1개씩 떨어진다. 유성 번호 = floor(유닉스 초 / 간격)
 * 화면은 번호가 바뀔 때마다 유성 하나를 그리고, 터치하면 그 번호를 POST /api/meteors로 보낸다
 */
export const METEOR_INTERVAL_SECONDS = 16;
/** 떨어지고 나서 이 시간 안에 보낸 유성만 인정 (네트워크 지연·애니메이션 길이 여유). 기기 시계가 조금 빨라도 다음 1개까지는 받는다 */
export const METEOR_GRACE_SECONDS = 60;
/**
 * 하루(한국 날짜)에 유성으로 받을 수 있는 최대 횟수.
 * 화면을 켜 두기만 해도 시간당 225개까지 쌓일 수 있어서, 하루 체크인(100)·별 하나(10~40)보다 커지지 않게 막는다
 */
export const METEOR_DAILY_LIMIT = 20;

/** 이 시각에 떨어지는 유성 번호 */
export function meteorIdAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / METEOR_INTERVAL_SECONDS);
}

/** 유성 번호가 떨어지기 시작하는 시각 (ms) */
export function meteorStartsAt(meteorId: number): number {
  return meteorId * METEOR_INTERVAL_SECONDS * 1000;
}

/** 지금 받을 수 있는 유성 번호인지 (너무 지난 번호·아직 오지 않은 번호는 false) */
export function isMeteorCatchable(meteorId: number, nowMs: number): boolean {
  const current = meteorIdAt(nowMs);
  const oldest = meteorIdAt(nowMs - METEOR_GRACE_SECONDS * 1000);
  return meteorId >= oldest && meteorId <= current + 1;
}
