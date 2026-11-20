// 정책 피드백 루프 (고민기록 #38, 기획: docs/기획/정책추천.md 10장)
//   사용자 피드백 → ① 판정(AI) → ② 검증(규칙 먼저, 해석이 필요한 칸만 AI) → ③ 승인(다른 모델) → 반영(되돌리기 기록)
//   검증에서 틀리면 판정으로 한 번 돌려보내고, 두 번째도 틀리면 반려하고 끝
// 사용자에게는 피드백 즉시 그 정책을 다시 추천하지 않는다 (루프를 기다리지 않음). 루프는 "모든 사용자"의 데이터를 고칠 때만 돈다
// AI가 하는 일은 판단뿐이고, 실제 수정은 정해 둔 칸·형식만 코드가 한다 (자유 입력에 들어온 지시는 실행되지 않음)
// 무료 한도 때문에 실제 AI 루프는 스크립트로 직접 돌릴 때만 (scripts/run-feedback-loop.mts). 동작 검증은 가짜 에이전트로 (scripts/verify-feedback-loop.mts)
import type { Db } from "@/app/api/_lib/http";
import { BURDENS } from "@/lib/policy-classify";

export const FEEDBACK_REASONS = ["region", "eligibility", "not_needed", "too_hard", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];
export const FEEDBACK_LABEL: Record<FeedbackReason, string> = {
  region: "지역이 달라요",
  eligibility: "나이·조건이 안 맞아요",
  not_needed: "지금은 필요 없어요",
  too_hard: "너무 부담돼요",
  other: "다른 이유",
};
/** 데이터 오류일 수 있어 루프로 보내는 이유 (나머지는 그 사용자 추천만 조정) */
const LOOP_REASONS = new Set<FeedbackReason>(["region", "eligibility", "other"]);

export const CORRECTABLE_FIELDS = ["region_code", "actionable", "burden", "stage", "age_min", "age_max"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
/** 해석이 필요해 규칙만으로 검증할 수 없는 칸 → 검증 단계에서 AI를 한 번 더 */
const SEMANTIC_FIELDS = new Set<CorrectableField>(["actionable", "burden", "stage"]);

export type PolicyContext = {
  id: number;
  title: string;
  raw: Record<string, string>;
  current: Record<CorrectableField, string | null>;
};
export type Judgement = { valid: boolean; field?: string; proposedValue?: string; evidence?: string; note: string };
export type Review = { approve: boolean; note: string };
export type Agents = {
  judge(input: { policy: PolicyContext; feedback: { reason: FeedbackReason; text: string | null }; previousNote: string | null }): Promise<{ result: Judgement | null; model: string | null }>;
  verify(input: { policy: PolicyContext; field: CorrectableField; proposedValue: string; evidence: string }): Promise<{ ok: boolean; note: string; model: string | null }>;
  review(input: { policy: PolicyContext; field: CorrectableField; currentValue: string | null; proposedValue: string; evidence: string }): Promise<{ result: Review | null; model: string | null }>;
};

// 시도 이름 → 법정동 코드 앞 두 자리 (지역 수정 검증용)
const SIDO: [RegExp, string][] = [
  [/서울/, "11"], [/부산/, "26"], [/대구/, "27"], [/인천/, "28"], [/광주/, "29"], [/대전/, "30"], [/울산/, "31"], [/세종/, "36"],
  [/경기/, "41"], [/강원/, "51"], [/충청북도|충북/, "43"], [/충청남도|충남/, "44"], [/전북|전라북도/, "52"], [/전남|전라남도/, "46"],
  [/경상북도|경북/, "47"], [/경상남도|경남/, "48"], [/제주/, "50"],
];
const squash = (t: string) => t.replace(/\s+/g, "");
const sourceText = (p: PolicyContext) => squash([p.title, ...Object.values(p.raw).filter((v) => typeof v === "string")].join(" "));

/** 원문 근거 일부 (판정·검증 에이전트 입력) */
export function policyFacts(p: PolicyContext) {
  const v = (k: string) => (p.raw[k] ?? "").trim();
  const sidos = [...new Set((v("zipCd")).split(",").map((z) => z.trim().slice(0, 2)).filter(Boolean))];
  return {
    이름: p.title,
    설명: v("plcyExplnCn"),
    지원_내용: v("plcySprtCn").slice(0, 400),
    신청_방법: v("plcyAplyMthdCn").slice(0, 400),
    추가_자격_조건: v("addAplyQlfcCndCn"),
    주관_기관: v("sprvsnInstCdNm"),
    등록_기관: v("rgtrInstCdNm"),
    대상_시도코드_수: sidos.length,
    나이: v("sprtTrgtAgeLmtYn") === "Y" ? `${v("sprtTrgtMinAge")}~${v("sprtTrgtMaxAge")}` : "제한 없음",
    지금_값: p.current,
  };
}

/**
 * ② 검증의 규칙 부분 (AI 없음). 통과해야 다음으로 간다
 * - 고칠 수 있는 칸·값 형식인지, 지금 값과 다른지
 * - 근거 구절이 원문에 실제로 있는지 (띄어쓰기 무시)
 * - 지역: 바꿀 시도가 주관·등록 기관 이름이나 대상 지역 코드와 맞는지
 * - 나이: 바꿀 숫자가 근거 구절에 있는지
 */
export function checkByRules(p: PolicyContext, j: Judgement): { ok: boolean; note: string; field?: CorrectableField } {
  if (!j.field || !(CORRECTABLE_FIELDS as readonly string[]).includes(j.field)) return { ok: false, note: `고칠 수 없는 칸: ${j.field ?? "없음"}` };
  const field = j.field as CorrectableField;
  const value = (j.proposedValue ?? "").trim();
  const formatOk =
    field === "region_code" ? /^\d{5}$/.test(value)
    : field === "actionable" ? value === "true" || value === "false"
    : field === "burden" ? (BURDENS as readonly string[]).includes(value)
    : field === "stage" ? /^[1-6]$/.test(value)
    : /^\d{1,2}$/.test(value);
  if (!formatOk) return { ok: false, note: `값 형식이 맞지 않음: ${field}=${value}`, field };
  if (value === (p.current[field] ?? "")) return { ok: false, note: "지금 값과 같음", field };
  // 나이: 원문의 나이 칸(숫자)과 직접 비교. 원문 나이는 "39" 같은 숫자뿐이라 근거 구절(4자 이상) 검사로는 맞는 수정도 막힘 (고민기록 #43)
  if (field === "age_min" || field === "age_max") {
    const rawAge = p.raw[field === "age_min" ? "sprtTrgtMinAge" : "sprtTrgtMaxAge"];
    if (p.raw.sprtTrgtAgeLmtYn === "Y" && rawAge && rawAge !== "0" && String(Number(rawAge)) === value) return { ok: true, note: "규칙 검증 통과 (원문 나이 칸과 일치)", field };
  }
  // AI가 입력 JSON 조각(등록_기관":"서울특별시)을 그대로 옮기는 경우가 있어 앞의 칸 이름·따옴표만 걷어냄. 나머지는 여전히 원문에 있어야 통과 (고민기록 #43)
  const evidence = squash((j.evidence ?? "").replace(/^[\p{L}\p{N}_]+["']?\s*:\s*/u, "").replace(/["']/g, ""));
  if (evidence.length < 4) return { ok: false, note: "근거 구절이 없음", field };
  if (!sourceText(p).includes(evidence)) return { ok: false, note: "근거 구절이 원문에 없음", field };
  if (field === "region_code") {
    const agency = `${p.raw.sprvsnInstCdNm ?? ""} ${p.raw.rgtrInstCdNm ?? ""} ${p.raw.rgtrUpInstCdNm ?? ""}`;
    const sidoOfAgency = SIDO.find(([re]) => re.test(agency))?.[1];
    const zips = (p.raw.zipCd ?? "").split(",").map((z) => z.trim()).filter(Boolean);
    const allZipsInSido = zips.length > 0 && zips.every((z) => z.startsWith(value.slice(0, 2)));
    if (sidoOfAgency !== value.slice(0, 2) && !allZipsInSido) return { ok: false, note: "바꿀 지역이 기관·대상 지역 코드와 맞지 않음", field };
  }
  if ((field === "age_min" || field === "age_max") && !(j.evidence ?? "").includes(value)) return { ok: false, note: "바꿀 나이가 근거 구절에 없음", field };
  return { ok: true, note: "규칙 검증 통과", field };
}

/** 정책을 루프용으로 읽기 */
export async function loadPolicyContext(db: Db, policyId: number): Promise<PolicyContext | null> {
  const r = (
    await db.query<{ id: number; title: string; raw: Record<string, string>; region_code: string | null; actionable: boolean | null; burden: string | null; stage: number | null; age_min: number | null; age_max: number | null }>(
      "SELECT id, title, raw, region_code, actionable, burden, stage, age_min, age_max FROM policies WHERE id = $1",
      [policyId],
    )
  ).rows[0];
  if (!r) return null;
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: r.id, title: r.title, raw: r.raw,
    current: { region_code: s(r.region_code), actionable: s(r.actionable), burden: s(r.burden), stage: s(r.stage), age_min: s(r.age_min), age_max: s(r.age_max) },
  };
}

/** 반영: 칸마다 정해 둔 SQL만 (칸 이름을 문자열로 이어 붙이지 않음) */
const APPLY_SQL: Record<CorrectableField, string> = {
  region_code: "UPDATE policies SET region_code = $2 WHERE id = $1",
  actionable: "UPDATE policies SET actionable = ($2 = 'true') WHERE id = $1",
  burden: "UPDATE policies SET burden = $2 WHERE id = $1",
  stage: "UPDATE policies SET stage = $2::smallint WHERE id = $1",
  age_min: "UPDATE policies SET age_min = $2::smallint WHERE id = $1",
  age_max: "UPDATE policies SET age_max = $2::smallint WHERE id = $1",
};
const REVERT_SQL: Record<CorrectableField, string> = {
  region_code: "UPDATE policies SET region_code = $2 WHERE id = $1",
  actionable: "UPDATE policies SET actionable = CASE WHEN $2::text IS NULL THEN NULL ELSE $2 = 'true' END WHERE id = $1",
  burden: "UPDATE policies SET burden = $2 WHERE id = $1",
  stage: "UPDATE policies SET stage = $2::smallint WHERE id = $1",
  age_min: "UPDATE policies SET age_min = $2::smallint WHERE id = $1",
  age_max: "UPDATE policies SET age_max = $2::smallint WHERE id = $1",
};

type RunResult = { feedbackId: number; outcome: "personal" | "no_basis" | "applied" | "rejected"; requestId: number | null; note: string };

/** 피드백 하나를 루프에 통과시킨다 */
export async function runFeedback(db: Db, agents: Agents, feedbackId: number): Promise<RunResult> {
  const fb = (
    await db.query<{ id: number; policy_id: number; reason: FeedbackReason; text: string | null; loop_status: string }>(
      "SELECT id, policy_id, reason, text, loop_status FROM policy_feedback WHERE id = $1",
      [feedbackId],
    )
  ).rows[0];
  if (!fb || fb.loop_status !== "pending") return { feedbackId, outcome: "personal", requestId: null, note: "처리할 피드백 아님" };
  const policy = await loadPolicyContext(db, fb.policy_id);
  if (!policy) return { feedbackId, outcome: "no_basis", requestId: null, note: "정책 없음" };

  let requestId: number | null = null;
  let previousNote: string | null = null;
  const models: Record<string, string | null> = {};
  for (let attempt = 1; attempt <= 2; attempt++) {
    // ① 판정
    const judged = await agents.judge({ policy, feedback: { reason: fb.reason, text: fb.text }, previousNote });
    models.judge = judged.model;
    const j = judged.result;
    if (!j || !j.valid) {
      const note = j?.note ?? "판정 실패";
      if (requestId === null) {
        await db.query("UPDATE policy_feedback SET loop_status = 'no_basis' WHERE id = $1", [fb.id]);
        return { feedbackId, outcome: "no_basis", requestId: null, note };
      }
      await db.query("UPDATE policy_correction_requests SET status = 'rejected', judge_note = $2, models = $3, updated_at = now() WHERE id = $1", [requestId, note, models]);
      return { feedbackId, outcome: "rejected", requestId, note };
    }
    const fieldForRow = (CORRECTABLE_FIELDS as readonly string[]).includes(j.field ?? "") ? (j.field as CorrectableField) : null;
    if (requestId === null) {
      // 고칠 수 없는 칸을 제안해도 기록은 남김 (반려 사유를 볼 수 있게). 칸 제약 때문에 field는 확인된 값만
      if (!fieldForRow) {
        await db.query("UPDATE policy_feedback SET loop_status = 'no_basis' WHERE id = $1", [fb.id]);
        return { feedbackId, outcome: "no_basis", requestId: null, note: `고칠 수 없는 칸 제안: ${j.field ?? "없음"}` };
      }
      requestId = (
        await db.query<{ id: number }>(
          `INSERT INTO policy_correction_requests (feedback_id, policy_id, field, current_value, proposed_value, evidence, judge_note, models)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [fb.id, policy.id, fieldForRow, policy.current[fieldForRow], j.proposedValue ?? "", j.evidence ?? "", j.note, models],
        )
      ).rows[0].id;
      await db.query("UPDATE policy_feedback SET loop_status = 'requested' WHERE id = $1", [fb.id]);
    } else {
      await db.query(
        `UPDATE policy_correction_requests SET field = COALESCE($2, field), proposed_value = $3, evidence = $4, judge_note = $5,
                attempts = attempts + 1, status = 'proposed', models = $6, updated_at = now() WHERE id = $1`,
        [requestId, fieldForRow, j.proposedValue ?? "", j.evidence ?? "", j.note, models],
      );
    }
    // ② 검증: 규칙 → (해석이 필요한 칸만) AI
    let check = checkByRules(policy, j);
    models.verify = "rules";
    if (check.ok && check.field && SEMANTIC_FIELDS.has(check.field)) {
      const v = await agents.verify({ policy, field: check.field, proposedValue: j.proposedValue!, evidence: j.evidence! });
      models.verify = `rules+${v.model ?? "ai"}`;
      check = { ok: v.ok, note: `규칙 통과 · ${v.note}`, field: check.field };
    }
    if (!check.ok) {
      previousNote = check.note;
      const status = attempt === 1 ? "returned" : "rejected";
      await db.query("UPDATE policy_correction_requests SET status = $2, verify_note = $3, models = $4, updated_at = now() WHERE id = $1", [requestId, status, check.note, models]);
      if (attempt === 1) continue; // 판정으로 한 번 돌려보냄
      return { feedbackId, outcome: "rejected", requestId, note: check.note };
    }
    await db.query("UPDATE policy_correction_requests SET status = 'verified', verify_note = $2, models = $3, updated_at = now() WHERE id = $1", [requestId, check.note, models]);

    // ③ 승인 (판정과 다른 모델)
    const field = check.field!;
    const reviewed = await agents.review({ policy, field, currentValue: policy.current[field], proposedValue: j.proposedValue!, evidence: j.evidence! });
    models.review = reviewed.model;
    if (!reviewed.result?.approve) {
      const note = reviewed.result?.note ?? "승인 실패";
      await db.query("UPDATE policy_correction_requests SET status = 'rejected', review_note = $2, models = $3, updated_at = now() WHERE id = $1", [requestId, note, models]);
      return { feedbackId, outcome: "rejected", requestId, note };
    }
    // 반영 + 되돌리기 기록
    await db.query(APPLY_SQL[field], [policy.id, j.proposedValue]);
    await db.query(
      "INSERT INTO policy_correction_log (request_id, policy_id, field, before_value, after_value) VALUES ($1, $2, $3, $4, $5)",
      [requestId, policy.id, field, policy.current[field], j.proposedValue],
    );
    await db.query("UPDATE policy_correction_requests SET status = 'applied', review_note = $2, models = $3, updated_at = now() WHERE id = $1", [requestId, reviewed.result.note, models]);
    return { feedbackId, outcome: "applied", requestId, note: reviewed.result.note };
  }
  return { feedbackId, outcome: "rejected", requestId, note: "판정 반복 한도" };
}

/** 대기 중인 피드백을 차례로 처리 (limit개까지) */
export async function processPendingFeedback(db: Db, agents: Agents, opts: { limit?: number; log?: (m: string) => void } = {}) {
  const ids = (await db.query<{ id: number }>("SELECT id FROM policy_feedback WHERE loop_status = 'pending' ORDER BY id LIMIT $1", [opts.limit ?? 20])).rows;
  const results: RunResult[] = [];
  for (const { id } of ids) {
    const r = await runFeedback(db, agents, id);
    opts.log?.(`피드백 ${id}: ${r.outcome} — ${r.note}`);
    results.push(r);
  }
  return results;
}

/** 반영 되돌리기 (사람이 확인 후) */
export async function revertCorrection(db: Db, logId: number): Promise<boolean> {
  const l = (await db.query<{ policy_id: number; field: CorrectableField; before_value: string | null; reverted_at: string | null }>(
    "SELECT policy_id, field, before_value, reverted_at FROM policy_correction_log WHERE id = $1", [logId])).rows[0];
  if (!l || l.reverted_at || !(CORRECTABLE_FIELDS as readonly string[]).includes(l.field)) return false;
  await db.query(REVERT_SQL[l.field], [l.policy_id, l.before_value]);
  await db.query("UPDATE policy_correction_log SET reverted_at = now() WHERE id = $1", [logId]);
  return true;
}

export const isLoopReason = (r: FeedbackReason) => LOOP_REASONS.has(r);
