// 포인트: 유성 터치(+1)·데일리 체크인(+100) 적립과 합계 조회 (docs/API명세.md "9. 포인트", 고민기록 #32)
// 별 포인트는 시도 저장(_lib/attempts.ts)이 뷰로 계산하고, 여기서는 적립 기록 point_events만 쓴다
// 잔액의 기준은 뷰 v_user_balance (별 + 유성 + 체크인 − 구매액). 중복 지급은 UNIQUE (user_id, source, ref_key)가 막는다
import { db as pool } from "@/lib/db";
import {
  CHECKIN_POINTS,
  isMeteorCatchable,
  METEOR_DAILY_LIMIT,
  METEOR_GRACE_SECONDS,
  METEOR_INTERVAL_SECONDS,
  METEOR_POINTS,
  meteorIdAt,
  meteorStartsAt,
} from "@/lib/points";
import { type ApiResult, type Db, fail, ok, toId } from "./http";

/** 한국 시간 기준 오늘 (SQL). DB 서버 시간대가 GMT라 CURRENT_DATE를 쓰지 않는다 */
const TODAY_KST = "((now() AT TIME ZONE 'Asia/Seoul')::date)";

/** 유성을 받지 못한 이유. null = 이번에 받음 */
export type MeteorMissReason = "ALREADY_CAUGHT" | "DAILY_LIMIT" | "EXPIRED";

/**
 * POST /api/meteors — 떨어지는 유성을 터치했을 때 +1
 * 같은 유성 번호는 사용자당 한 번만 (다시 보내도 200 + pointsEarned 0, 재시도해도 안전)
 * 받지 못한 경우(이미 받음·하루 한도·지난 유성)도 오류가 아니라 200 + reason으로 응답한다 → 화면은 +1만 띄우지 않으면 됨
 */
export async function catchMeteor(userId: number, body: unknown, db: Db = pool, now: number = Date.now()): Promise<ApiResult> {
  const meteorId = toId((body as { meteorId?: unknown } | null)?.meteorId);
  if (meteorId === null) return fail(400, "INVALID", "meteorId가 필요해요.");
  const catchable = isMeteorCatchable(meteorId, now);

  try {
    // 같은 문장의 CTE는 INSERT 전 상태를 보므로 prev = 이번 요청 전 기록 (_lib/attempts.ts와 같은 방식)
    // 하루 한도는 동시에 여러 유성을 보내면 받을 수 있는 유성 수(유예 60초 + 다음 1개 = 최대 6개)만큼 넘을 수 있다. 같은 유성 중복은 UNIQUE라 생기지 않음
    const { rows } = await db.query<{ total_before: number; today_before: number; already: boolean; earned: number | null }>(
      `WITH prev AS (
         SELECT COALESCE((SELECT total_points FROM v_user_balance WHERE user_id = $1), 0) AS total_before,
                (SELECT count(*) FROM point_events
                 WHERE user_id = $1 AND source = 'meteor' AND earned_date = ${TODAY_KST})::int AS today_before,
                EXISTS (SELECT 1 FROM point_events WHERE user_id = $1 AND source = 'meteor' AND ref_key = $2) AS already
       ), ins AS (
         INSERT INTO point_events (user_id, source, ref_key, points)
         SELECT $1, 'meteor', $2, $3 FROM prev
         WHERE $5::boolean AND NOT prev.already AND prev.today_before < $4
         ON CONFLICT (user_id, source, ref_key) DO NOTHING
         RETURNING points
       )
       SELECT prev.total_before, prev.today_before, prev.already, (SELECT points FROM ins) AS earned FROM prev`,
      [userId, String(meteorId), METEOR_POINTS, METEOR_DAILY_LIMIT, catchable],
    );
    const row = rows[0];
    const pointsEarned = row.earned === null ? 0 : Number(row.earned);
    const todayBefore = Number(row.today_before);
    const reason: MeteorMissReason | null = pointsEarned > 0 ? null
      : row.already ? "ALREADY_CAUGHT"
      : !catchable ? "EXPIRED"
      : todayBefore >= METEOR_DAILY_LIMIT ? "DAILY_LIMIT"
      : "ALREADY_CAUGHT"; // 같은 유성을 동시에 두 번 보내 다른 요청이 먼저 저장함
    return ok(
      {
        meteorId,
        pointsEarned,
        reason,
        totalPoints: Number(row.total_before) + pointsEarned,
        meteor: { caughtToday: todayBefore + (pointsEarned > 0 ? 1 : 0), dailyLimit: METEOR_DAILY_LIMIT },
      },
      pointsEarned > 0 ? 201 : 200,
    );
  } catch (error) {
    console.error("[meteors] 저장 실패", (error as { code?: string }).code ?? error);
    return fail(500, "SAVE_FAILED", "지금은 유성을 담지 못했어요.");
  }
}

/**
 * 데일리 체크인 포인트 (+100, 한국 날짜 기준 하루 한 번). POST /api/checkin이 체크인을 저장한 뒤 부른다
 * 오늘 이미 받았으면 pointsEarned 0. 실패하면 예외 (체크인 저장과 별개라 체크인 응답은 그대로 나간다)
 */
export async function awardCheckinPoints(userId: number, db: Db = pool): Promise<{ pointsEarned: number; totalPoints: number }> {
  const { rows } = await db.query<{ total_before: number; earned: number | null }>(
    `WITH prev AS (
       SELECT COALESCE((SELECT total_points FROM v_user_balance WHERE user_id = $1), 0) AS total_before
     ), ins AS (
       INSERT INTO point_events (user_id, source, ref_key, points, earned_date)
       VALUES ($1, 'checkin', to_char(${TODAY_KST}, 'YYYY-MM-DD'), $2, ${TODAY_KST})
       ON CONFLICT (user_id, source, ref_key) DO NOTHING
       RETURNING points
     )
     SELECT prev.total_before, (SELECT points FROM ins) AS earned FROM prev`,
    [userId, CHECKIN_POINTS],
  );
  const pointsEarned = rows[0].earned === null ? 0 : Number(rows[0].earned);
  return { pointsEarned, totalPoints: Number(rows[0].total_before) + pointsEarned };
}

/**
 * GET /api/points — 포인트 합계와 출처별 내역 (별 + 유성 + 체크인 = totalPoints)
 * 화면이 유성을 그릴 때 쓸 서버 시각·유성 간격도 함께 준다
 */
export async function getPoints(userId: number, db: Db = pool, now: number = Date.now()): Promise<ApiResult> {
  try {
    const { rows } = await db.query<{
      total_points: number; bright_stars: number; star_points: number; meteor_points: number; checkin_points: number;
      meteor_today: number; checkin_today: boolean;
    }>(
      `SELECT COALESCE(p.total_points, 0)   AS total_points,
              COALESCE(p.bright_stars, 0)   AS bright_stars,
              COALESCE(p.star_points, 0)    AS star_points,
              COALESCE(p.meteor_points, 0)  AS meteor_points,
              COALESCE(p.checkin_points, 0) AS checkin_points,
              (SELECT count(*) FROM point_events
               WHERE user_id = $1 AND source = 'meteor' AND earned_date = ${TODAY_KST})::int AS meteor_today,
              EXISTS (SELECT 1 FROM point_events
                      WHERE user_id = $1 AND source = 'checkin' AND earned_date = ${TODAY_KST}) AS checkin_today
       FROM (SELECT 1) one
       LEFT JOIN v_user_balance p ON p.user_id = $1`,
      [userId],
    );
    const r = rows[0];
    const currentMeteorId = meteorIdAt(now);
    return ok({
      totalPoints: Number(r.total_points),
      stars: { points: Number(r.star_points), brightStars: Number(r.bright_stars) },
      meteor: {
        points: Number(r.meteor_points),
        caughtToday: Number(r.meteor_today),
        dailyLimit: METEOR_DAILY_LIMIT,
        pointsEach: METEOR_POINTS,
        intervalSeconds: METEOR_INTERVAL_SECONDS,
        graceSeconds: METEOR_GRACE_SECONDS,
        currentMeteorId,
        nextMeteorAt: new Date(meteorStartsAt(currentMeteorId + 1)).toISOString(),
      },
      checkin: { points: Number(r.checkin_points), doneToday: r.checkin_today, pointsEach: CHECKIN_POINTS },
      serverTime: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("[points] 조회 실패", (error as { code?: string }).code ?? error);
    return fail(500, "LOAD_FAILED", "지금은 포인트를 불러오지 못했어요.");
  }
}
