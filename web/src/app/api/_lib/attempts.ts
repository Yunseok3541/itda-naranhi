// 별 시도 저장 (docs/API명세.md "3. 별 시도 저장")
// ⚠ 담당 정리: 시도 저장 API는 윤석 담당. 이 파일은 고은비가 먼저 만든 구현이며, 이어받을 쪽은 PR에서 정한다.
//   회고 응원·위기 안내는 고은비 담당 모듈 @/lib/reflection 의 processReflection 결과({ cheer, help })를 쓴다.
// 입력 검증 → 별 확인 → 회고 처리(저장 전) → 저장 → 응답. 저장이 실패해도 help는 전달하고, 실패를 성공으로 보내지 않는다
import { db as pool } from "@/lib/db";
import type { PoolClient } from "pg";
import { generateJson } from "@/lib/gemini";
import { inspectReflection, STOP_REASONS, type AttemptStatus, type StopReason } from "@/lib/reflection";
import { ruleHelp } from "@/lib/safety";
import { DAILY_STAR_LIMIT, DAILY_STAR_LIMIT_MESSAGE } from "@/lib/star-limit";
import { type ApiResult, type Db, fail, KST_DATE, ok, toId } from "./http";

const STATUSES = ["bright", "dim"] as const;
const VERIFY_METHODS = ["self", "photo", "gps"] as const;

function optionalString(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.trim().length > max) return false;
  return v.trim() || null;
}

/** 규칙만으로 본 안내 (검증 실패·세션 없음처럼 AI를 부르지 않는 응답에도 help를 담기 위함) */
export function ruleHelpFromBody(body: unknown) {
  return ruleHelp((body as { reflection?: unknown } | null)?.reflection);
}

export async function createAttempt(
  userId: number,
  body: unknown,
  db: Db = pool,
  generate: typeof generateJson = generateJson, // 테스트에서 AI 응답을 바꿔 끼우기 위함
): Promise<ApiResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const help400 = ruleHelpFromBody(body);
  const invalid = (msg: string) => fail(400, "INVALID", msg, { help: help400 });

  const starId = toId(b.starId);
  if (starId === null) return invalid("starId가 필요해요.");
  if (!STATUSES.includes(b.status as AttemptStatus)) return invalid("status는 bright 또는 dim이어야 해요.");
  const status = b.status as AttemptStatus;

  const reflection = optionalString(b.reflection, 300);
  if (reflection === false) return invalid("회고는 300자 이하로 적어 주세요.");

  const verifyMethod = b.verifyMethod ?? "self";
  if (!VERIFY_METHODS.includes(verifyMethod as (typeof VERIFY_METHODS)[number])) {
    return invalid("verifyMethod는 self, photo, gps 중 하나예요.");
  }

  const stopReason = (b.stopReason ?? null) as StopReason | null;
  if (stopReason !== null) {
    if (!STOP_REASONS.includes(stopReason)) return invalid("stopReason이 올바르지 않아요.");
    if (status !== "dim") return invalid("stopReason은 손 뻗어 보기(dim)일 때만 보낼 수 있어요.");
  }

  const placeId = optionalString(b.placeId, 30);
  const placeName = optionalString(b.placeName, 100);
  if (placeId === false || placeName === false) return invalid("장소 정보가 너무 길어요.");
  if ((placeId || placeName) && verifyMethod !== "gps") return invalid("장소 정보는 gps 확인일 때만 보낼 수 있어요.");

  const parentAttemptId = b.parentAttemptId == null ? null : toId(b.parentAttemptId);
  const subQuestId = b.subQuestId == null ? null : toId(b.subQuestId);
  if ((b.parentAttemptId != null && parentAttemptId === null) || (b.subQuestId != null && subQuestId === null)) {
    return invalid("이어갈 기록과 작은 활동 번호를 확인해 주세요.");
  }
  if (subQuestId !== null && parentAttemptId === null) return invalid("작은 활동은 선택한 다음 행동에서 이어가 주세요.");
  let customTitle: string | null = null;
  if (parentAttemptId !== null) {
    try {
      // Validate both ownership and the exact action/target selected by the user.
      const parent = (await db.query<{ star_id: number; next_action: string; next_star_id: number | null;
        next_sub_quest_id: number | null; sub_quest_id: number | null }>(
        `SELECT star_id, next_action, next_star_id, next_sub_quest_id, sub_quest_id
         FROM star_attempts WHERE id = $1 AND user_id = $2`, [parentAttemptId, userId],
      )).rows[0];
      if (!parent) return fail(404, "NOT_FOUND", "이어갈 기록을 찾을 수 없어요.", { help: help400 });
      const targetStar = parent.next_action === 'swap' ? parent.next_star_id : parent.star_id;
      const targetSub = parent.next_action === 'smaller' ? parent.next_sub_quest_id
        : parent.next_action === 'retry' ? parent.sub_quest_id : null;
      if (!['smaller', 'retry', 'swap'].includes(parent.next_action) || targetStar !== starId || targetSub !== subQuestId) {
        return invalid("지난번에 고른 다음 행동과 달라요. 다음 행동을 다시 골라 주세요.");
      }
      if (subQuestId !== null) {
        const sub = (await db.query<{ title: string }>(
          "SELECT title FROM sub_quests WHERE id = $1 AND star_id = $2", [subQuestId, starId],
        )).rows[0];
        if (!sub) return invalid("이 별의 작은 활동을 찾을 수 없어요.");
        customTitle = sub.title;
      }
    } catch { return fail(500, "LOAD_FAILED", "이어갈 기록을 확인하지 못했어요.", { help: help400 }); }
  }

  // 별 확인. DB가 안 되면 제목 없이 진행하고 저장 단계에서 실패로 응답한다 (help는 유지)
  let starTitle: string | null = null;
  try {
    const star = (await db.query<{ title: string }>("SELECT title FROM stars WHERE id = $1", [starId])).rows[0];
    if (!star) return fail(404, "NOT_FOUND", "별을 찾을 수 없어요.", { help: help400 });
    starTitle = star.title;
  } catch (error) {
    console.error("[attempts] 별 조회 실패", (error as { code?: string }).code ?? error);
  }

  // 저장 전에 회고 처리 → 저장이 실패해도 help를 응답할 수 있음
  const r = await inspectReflection({ status, reflection, starTitle: customTitle ?? starTitle, stopReason }, generate);

  let connection: PoolClient | undefined;
  try {
    // Serialize saves for this user so the next write sees the previous one in its snapshot.
    // An injected client already belongs to the caller's transaction.
    if (db === pool) {
      connection = await pool.connect();
      await connection.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await connection.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    }
    // 포인트(고민기록 #31): 이 별을 처음 밝혔을 때만 v_star_points 점수를 준다. dim·다시 완료는 0점
    // 같은 문장의 CTE는 INSERT 전 상태를 보므로 prev = 이번 시도 전 기록. 잔액의 기준은 뷰 v_user_balance
    const { rows } = await (connection ?? db).query<{ id: number | null; date: string | null; had_bright: boolean; total_before: number; star_points: number }>(
      `WITH prev AS (
         SELECT EXISTS (SELECT 1 FROM star_attempts WHERE user_id = $1 AND star_id = $2 AND status = 'bright') AS had_bright,
                COALESCE((SELECT total_points FROM v_user_balance WHERE user_id = $1), 0) AS total_before,
                COALESCE((SELECT points FROM v_star_points WHERE star_id = $2), 0) AS star_points
       ), ins AS (
         INSERT INTO star_attempts (user_id, star_id, status, verify_method, place_id, place_name, reflection, stop_reason, cheer,
           parent_attempt_id, sub_quest_id, custom_title, risk, created_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, statement_timestamp()
         FROM prev
         WHERE prev.had_bright OR (
           SELECT count(*) FROM (
             SELECT star_id FROM star_attempts
             WHERE user_id = $1 AND status = 'bright'
             GROUP BY star_id
             HAVING min(created_at) >= (
               date_trunc('day', statement_timestamp() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
             )
           ) AS collected_today
         ) < $14
         RETURNING id, created_at
       )
       SELECT ins.id, ${KST_DATE("ins.created_at")} AS date, prev.had_bright, prev.total_before, prev.star_points
       FROM prev LEFT JOIN ins ON true`,
      [userId, starId, status, verifyMethod, placeId, placeName, reflection, stopReason, r.cheer,
        parentAttemptId, subQuestId, customTitle, r.risk, DAILY_STAR_LIMIT],
    );
    const row = rows[0];
    await connection?.query("COMMIT");
    if (row.id === null) return fail(409, "DAILY_LIMIT", DAILY_STAR_LIMIT_MESSAGE, { help: r.help });
    const pointsEarned = status === "bright" && !row.had_bright ? Number(row.star_points) : 0;
    return ok(
      {
        attemptId: row.id,
        starId,
        status,
        date: row.date,
        reflection,
        parentAttemptId,
        subQuestId,
        customTitle,
        cheer: r.cheer,
        help: r.help,
        pointsEarned,
        totalPoints: Number(row.total_before) + pointsEarned,
        risk: r.risk,
        usedFallback: r.usedFallback,
        modelVersion: r.modelVersion,
      },
      201,
    );
  } catch (error) {
    if (connection) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        connection.release(true);
        connection = undefined;
      }
    }
    console.error("[attempts] 저장 실패", (error as { code?: string }).code ?? error);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", { help: r.help });
  } finally {
    connection?.release();
  }
}
