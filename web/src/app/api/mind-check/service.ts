// 마음 짚기 (UCLA 3문항 + LSNS-6 + WHO-5). 문항·점수·비교 문장은 @/lib/mind-check (화면과 같은 계산)
// 점수는 변화를 보는 데만 쓰고 시작 단계·위험 판정에 쓰지 않는다 (고민기록 #56)
import { db as pool } from "@/lib/db";
import { buildMindResult, parseMindAnswers, scoreMind, type MindScores } from "@/lib/mind-check";
import { type ApiResult, type Db, fail, ok } from "../_lib/http";

const errorCode = (error: unknown) => (error as { code?: string } | null)?.code ?? "unknown";
const missingSchema = (error: unknown) => {
  const dbError = error as { code?: string; column?: string } | null;
  return dbError?.code === "42703" || dbError?.code === "42P01"
    || (dbError?.code === "23502" && (dbError.column === "spin_score" || dbError.column === "ucla_score"));
};
const NOT_READY = "실제 모드의 마음 짚기를 준비하고 있어요. 예시 모드에서 먼저 둘러볼 수 있어요.";

type Row = { created_at: Date; ucla_score: number | null; lsns_score: number | null; who5_score: number | null };
const toScores = (r: Row): MindScores => ({ ucla: r.ucla_score, lsns: r.lsns_score, who5: r.who5_score });

/** 최근 마음 짚기 두 번을 조회한다. 기존 UCLA·Mini-SPIN 설문에는 spin_score가 있다. */
async function latestTwo(db: Db, userId: number) {
  const { rows } = await db.query<Row>(
    `SELECT created_at, ucla_score, lsns_score, who5_score FROM survey_results
      WHERE user_id = $1 AND spin_score IS NULL
        AND (ucla_score IS NOT NULL OR lsns_score IS NOT NULL OR who5_score IS NOT NULL)
      ORDER BY created_at DESC, id DESC LIMIT 2`,
    [userId],
  );
  return rows;
}

function resultOf(rows: Row[]) {
  if (!rows[0]) return null;
  return buildMindResult({ checkedAt: rows[0].created_at.toISOString(), scores: toScores(rows[0]) }, rows[1] ? { scores: toScores(rows[1]) } : null);
}

/** 200 { latest: MindResult | null } — 아직 짚은 적 없으면 null */
export async function getMindCheck(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    return ok({ latest: resultOf(await latestTwo(db, userId)) });
  } catch (error) {
    console.error("[mind-check] 조회 실패", errorCode(error));
    if (missingSchema(error)) return fail(503, "LOAD_FAILED", NOT_READY);
    return fail(500, "LOAD_FAILED", "지금은 마음 짚기 기록을 불러오지 못했어요.");
  }
}

/**
 * body { answers: { ucla: (1~3|null)[3], lsns: (0~5|null)[6], who5: (0~5|null)[5] } }
 * 한 묶음 이상 다 답해야 저장. 201 { latest: MindResult } (지난번과 비교한 문장 포함)
 */
export async function saveMindCheck(userId: number, body: unknown, db: Db = pool): Promise<ApiResult> {
  const parsed = parseMindAnswers((body as { answers?: unknown } | null)?.answers);
  if ("invalid" in parsed) {
    return fail(400, "INVALID", parsed.invalid === "answers" ? "한 묶음 이상 모두 답해 주세요." : "답을 다시 확인해 주세요.", { field: parsed.invalid });
  }
  const s = scoreMind(parsed.value);
  try {
    await db.query(
      "INSERT INTO survey_results (user_id, answers, ucla_score, lsns_score, who5_score) VALUES ($1, $2, $3, $4, $5)",
      [userId, JSON.stringify(parsed.value), s.ucla, s.lsns, s.who5],
    );
    return ok({ latest: resultOf(await latestTwo(db, userId)) }, 201);
  } catch (error) {
    console.error("[mind-check] 저장 실패", errorCode(error));
    if (missingSchema(error)) return fail(503, "SAVE_FAILED", NOT_READY);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 답은 그대로 있어요. 다시 시도해 주세요.");
  }
}
