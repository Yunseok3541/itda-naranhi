// 퀘스트 후 설문 저장 (명세: docs/API명세.md "퀘스트 후 설문", 고민기록 #32)
// - 선택 사항: 두 칸 다 없으면 건너뛰기 → 아무것도 바꾸지 않고 200
// - 보낸 요청 = 설문 전체. 빠진 칸은 "답하지 않음"(NULL). 다시 보내면 덮어씀
// - bright(완료)·dim(손 뻗어 보기) 모두 가능. 포인트와 무관 (점수가 늘거나 줄지 않음)
import { db as pool } from "@/lib/db";
import { type ApiResult, type Db, fail, KST_DATE, ok, toId } from "./http";

/** 1~5 정수 / 답하지 않음(null) / 틀린 값(undefined) */
function readAnswer(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined;
}

/**
 * userId는 반드시 세션(lookupDemoSession)에서 구한 값을 넣는다.
 * 200 { attemptId, saved: true, satisfaction, achievement, surveyedAt } / 건너뛰기 200 { attemptId, saved: false }
 */
export async function saveSurvey(userId: number, rawId: string, body: unknown, db: Db = pool): Promise<ApiResult> {
  const id = toId(rawId);
  if (id === null) return fail(400, "INVALID", "attemptId가 올바르지 않아요.");
  if (body !== null && body !== undefined && (typeof body !== "object" || Array.isArray(body))) {
    return fail(400, "INVALID", "설문 형식이 올바르지 않아요.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const satisfaction = readAnswer(b.satisfaction);
  if (satisfaction === undefined) return fail(400, "INVALID", "만족도는 1~5 중에서 골라 주세요.", { field: "satisfaction" });
  const achievement = readAnswer(b.achievement);
  if (achievement === undefined) return fail(400, "INVALID", "성취감은 1~5 중에서 골라 주세요.", { field: "achievement" });

  // 건너뛰기: DB를 보지 않음 (남의 시도인지도 알려 주지 않음)
  if (satisfaction === null && achievement === null) return ok({ attemptId: id, saved: false });

  try {
    const { rows } = await db.query<{ satisfaction: number | null; achievement: number | null; surveyedAt: string }>(
      `UPDATE star_attempts SET satisfaction = $3, achievement = $4, surveyed_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING satisfaction, achievement, ${KST_DATE("surveyed_at")} AS "surveyedAt"`,
      [id, userId, satisfaction, achievement],
    );
    // 다른 사용자의 시도와 없는 시도를 구분하지 않음
    if (!rows[0]) return fail(404, "NOT_FOUND", "시도를 찾을 수 없어요.");
    return ok({ attemptId: id, saved: true, ...rows[0] });
  } catch (error) {
    console.error("[survey] 저장 실패", (error as { code?: string }).code ?? error);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 고른 답은 화면에 그대로 있어요.");
  }
}
