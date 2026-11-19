// 별 시도 저장 (docs/API명세.md "3. 별 시도 저장")
// ⚠ 담당 정리: 시도 저장 API는 윤석 담당. 이 파일은 고은비가 먼저 만든 구현이며, 이어받을 쪽은 PR에서 정한다.
//   회고 응원·위기 안내는 고은비 담당 모듈 @/lib/reflection 의 processReflection 결과({ cheer, help })를 쓴다.
// 입력 검증 → 별 확인 → 회고 처리(저장 전) → 저장 → 응답. 저장이 실패해도 help는 전달하고, 실패를 성공으로 보내지 않는다
import { db as pool } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { inspectReflection, STOP_REASONS, type AttemptStatus, type StopReason } from "@/lib/reflection";
import { ruleHelp } from "@/lib/safety";
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
  const r = await inspectReflection({ status, reflection, starTitle, stopReason }, generate);

  try {
    const { rows } = await db.query<{ id: number; date: string }>(
      `INSERT INTO star_attempts (user_id, star_id, status, verify_method, place_id, place_name, reflection, stop_reason, cheer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, ${KST_DATE("created_at")} AS date`,
      [userId, starId, status, verifyMethod, placeId, placeName, reflection, stopReason, r.cheer],
    );
    return ok(
      {
        attemptId: rows[0].id,
        starId,
        status,
        date: rows[0].date,
        reflection,
        cheer: r.cheer,
        help: r.help,
        risk: r.risk,
        usedFallback: r.usedFallback,
        modelVersion: r.modelVersion,
      },
      201,
    );
  } catch (error) {
    console.error("[attempts] 저장 실패", (error as { code?: string }).code ?? error);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", { help: r.help });
  }
}
