// 성향 점수 + 필요한 회복 방향 (명세: docs/API명세.md "성향 점수", 계산: @/lib/preference, @/lib/profile)
// AI를 부르지 않는다. 결과는 저장하지 않고 요청마다 계산 (설문·시작 질문이 바뀌면 바로 반영)
import { db as pool } from "@/lib/db";
import { computePreference, type SurveyRow } from "@/lib/preference";
import { focusPriority, readStartAnswers } from "@/lib/profile";
import { type ApiResult, type Db, fail, ok } from "../_lib/http";

/**
 * userId는 반드시 세션에서 구한 값.
 * 200 { tags: [{ tag, label, score, count }], top, basis, focusPriority, suggestedStage, surveyedAttempts }
 */
export async function getPreferences(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const user = (await db.query<{ start_answers: unknown }>("SELECT start_answers FROM users WHERE id = $1", [userId])).rows[0];
    if (!user) return fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
    const rows = (
      await db.query<SurveyRow>(
        `SELECT a.satisfaction, a.achievement, s.tags
         FROM star_attempts a JOIN stars s ON s.id = a.star_id
         WHERE a.user_id = $1 AND a.surveyed_at IS NOT NULL`,
        [userId],
      )
    ).rows;
    const start = readStartAnswers(user.start_answers);
    return ok({ ...computePreference(rows, start), ...focusPriority(start) });
  } catch (error) {
    console.error("[preferences] 조회 실패", (error as { code?: string }).code ?? error);
    return fail(500, "LOAD_FAILED", "지금은 정보를 불러오지 못했어요.");
  }
}
