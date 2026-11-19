// 프로필: 시작 질문 + 정책 신청 정보 (기획: docs/기획/프로필.md, 명세: docs/API명세.md)
// 모두 선택. 보낸 칸만 바꾸고, null은 "답하지 않음"(지우기)
import { db as pool } from "@/lib/db";
import {
  STAGE_BY_RANGE, isEmpty, parseBirthYear, parsePolicyInfo, parseStartAnswers, readPolicyInfo, readStartAnswers,
} from "@/lib/profile";
import { type ApiResult, type Db, fail, ok, todayKst } from "../_lib/http";

const errorCode = (error: unknown) => (error as { code?: string }).code ?? (error instanceof Error ? error.message : "unknown");

type Row = { start_answers: unknown; policy_info: unknown; birth_year: number | null; current_stage: number };

function toBody(r: Row) {
  return {
    startAnswers: r.start_answers === null ? null : readStartAnswers(r.start_answers), // null = 아직 시작 질문을 거치지 않음
    policyInfo: readPolicyInfo(r.policy_info),
    birthYear: r.birth_year,
    currentStage: r.current_stage,
  };
}

/** 200 { startAnswers, policyInfo, birthYear, currentStage } */
export async function getProfile(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const r = (await db.query<Row>("SELECT start_answers, policy_info, birth_year, current_stage FROM users WHERE id = $1", [userId])).rows[0];
    if (!r) return fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
    return ok(toBody(r));
  } catch (error) {
    console.error("[profile] 조회 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 정보를 불러오지 못했어요.");
  }
}

/**
 * 보낸 칸만 바꾼다. body { startAnswers?, policyInfo?, birthYear? }
 * - startAnswers: 시작 질문 6개 전체(빠진 키 = 답하지 않음). 활동 범위를 답하면 시작 단계(current_stage)도 정함
 *   전부 답하지 않아도 저장한다 ({} → 시작 질문을 거친 사용자로 셈)
 * - policyInfo: 정책 신청 정보 전체. 전부 비우면 NULL로 지움. null을 보내도 지움
 * - birthYear: 출생연도 또는 null
 */
export async function saveProfile(userId: number, body: unknown, db: Db = pool): Promise<ApiResult> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "INVALID", "저장할 내용이 없어요.");
  const b = body as Record<string, unknown>;
  const sets: string[] = [];
  const values: unknown[] = [userId];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if ("startAnswers" in b) {
    const r = parseStartAnswers(b.startAnswers ?? {});
    if ("invalid" in r) return fail(400, "INVALID", "선택지에 없는 답이 있어요.", { field: r.invalid });
    set("start_answers", JSON.stringify(r.value));
    if (r.value.range) set("current_stage", STAGE_BY_RANGE[r.value.range]);
  }
  if ("policyInfo" in b) {
    if (b.policyInfo === null) set("policy_info", null);
    else {
      const r = parsePolicyInfo(b.policyInfo);
      if ("invalid" in r) return fail(400, "INVALID", "선택지에 없는 답이 있어요.", { field: r.invalid });
      set("policy_info", isEmpty(r.value) ? null : JSON.stringify(r.value));
    }
  }
  if ("birthYear" in b) {
    const y = parseBirthYear(b.birthYear, Number(todayKst().slice(0, 4)));
    if (y === undefined) return fail(400, "INVALID", "출생연도를 확인해 주세요.", { field: "birthYear" });
    set("birth_year", y);
  }
  if (sets.length === 0) return fail(400, "INVALID", "저장할 내용이 없어요.");

  try {
    const r = (
      await db.query<Row>(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $1 RETURNING start_answers, policy_info, birth_year, current_stage`,
        values,
      )
    ).rows[0];
    if (!r) return fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
    return ok(toBody(r));
  } catch (error) {
    console.error("[profile] 저장 실패", errorCode(error));
    return fail(500, "SAVE_FAILED", "저장하지 못했어요. 고른 답은 화면에 그대로 있어요.");
  }
}
