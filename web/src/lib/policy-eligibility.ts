// 정책 자격 조건 ↔ 정책 신청 정보 (기획: docs/기획/프로필.md 3장)
// 온통청년 원문(policies.raw)의 자격 코드를 사용자가 선택으로 알려 준 값과 비교한다. AI를 쓰지 않는 규칙
//
// 결과 두 가지
//   mismatch: 코드가 분명하고 사용자 답과 확실히 맞지 않음 → 추천에서 뺀다 ("모든 정책 보기"에서는 표시만)
//   toCheck : 사용자가 답하지 않았거나, 코드가 "기타"이거나, 조건이 자유 문장(중위소득 등)이라 판단할 수 없음 → "확인할 조건"으로 보여 준다
// "자격이 됩니다"라고 말하지 않는다. 원문 데이터가 틀린 경우가 있어(예: 미혼도 되는 정책이 기혼만으로 표시) 단정하지 않음
import { INCOME_FLOOR, type PolicyInfo } from "@/lib/profile";

/** policies.raw에서 꺼낸 자격 칸 (온통청년 코드, 여러 개는 쉼표) */
export type PolicyConditions = {
  job_cd: string | null; // 취업 요건 0013xxx
  school_cd: string | null; // 학력 0049xxx
  mrg_cd: string | null; // 결혼 0055xxx
  sbiz_cd: string | null; // 특화 대상 0014xxx
  earn_cd: string | null; // 소득 조건 0043001 무관 / 0043002 연소득 / 0043003 기타(문장)
  earn_max: string | null; // 연소득 상한 (만원)
  earn_etc: string | null; // 소득 조건 문장
  add_cond: string | null; // 추가 자격 조건 문장
};

/** SQL에서 policies p의 자격 칸을 꺼내는 식 */
export const CONDITION_COLUMNS = `p.raw->>'jobCd' AS job_cd, p.raw->>'schoolCd' AS school_cd, p.raw->>'mrgSttsCd' AS mrg_cd,
  p.raw->>'sbizCd' AS sbiz_cd, p.raw->>'earnCndSeCd' AS earn_cd, p.raw->>'earnMaxAmt' AS earn_max,
  p.raw->>'earnEtcCn' AS earn_etc, p.raw->>'addAplyQlfcCndCn' AS add_cond`;

// 온통청년 코드 → 사용자 답 (null = 대응하는 답 없음: 판단하지 않고 확인할 조건으로)
const JOB_CODE: Record<string, [NonNullable<PolicyInfo["job"]> | null, string]> = {
  "0013001": ["employed", "재직자"], "0013002": ["self_employed", "자영업자"], "0013003": ["unemployed", "미취업자"],
  "0013004": ["freelancer", "프리랜서"], "0013005": ["daily", "일용근로자"], "0013006": ["founder", "(예비)창업자"],
  "0013007": ["short_term", "단기근로자"], "0013008": ["farmer", "영농종사자"], "0013009": [null, "기타"],
};
const SCHOOL_CODE: Record<string, [NonNullable<PolicyInfo["school"]> | null, string]> = {
  "0049001": ["below_high", "고졸 미만"], "0049002": ["high_student", "고교 재학"], "0049003": ["high_student", "고졸 예정"],
  "0049004": ["high_grad", "고교 졸업"], "0049005": ["college_student", "대학 재학"], "0049006": ["college_student", "대졸 예정"],
  "0049007": ["college_grad", "대학 졸업"], "0049008": ["grad_school", "석·박사"], "0049009": [null, "기타"],
};
const SBIZ_CODE: Record<string, [NonNullable<PolicyInfo["special"]>[number] | null, string]> = {
  "0014001": [null, "중소기업"], "0014002": [null, "여성"], "0014003": ["basic_living", "기초생활수급자"],
  "0014004": ["single_parent", "한부모가정"], "0014005": ["disabled", "장애인"], "0014006": [null, "농업인"],
  "0014007": [null, "군인"], "0014008": [null, "지역인재"], "0014009": [null, "기타"],
};
const NO_LIMIT = new Set(["0013010", "0049010", "0014010", "0055003", "0043001"]);

const codes = (v: string | null) => (v ?? "").split(",").map((c) => c.trim()).filter(Boolean);
const short = (t: string, max = 60) => (t.length > max ? `${t.slice(0, max)}…` : t);
const freeText = (v: string | null) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t && !/^(무관|제한\s*없음|없음|-)$/.test(t) ? t : null;
};

/**
 * 코드 목록 하나를 사용자 답 하나와 비교
 * - 제한 없음 / 코드 없음 → 조건 아님
 * - 목록에 "기타"나 대응 없는 코드가 있으면 → 확실하지 않으니 확인할 조건
 * - 사용자가 답하지 않음 → 확인할 조건
 */
function compare<V extends string>(list: string[], map: Record<string, [V | null, string]>, answer: V | null, name: string) {
  const real = list.filter((c) => !NO_LIMIT.has(c));
  if (real.length === 0 || real.length < list.length) return { mismatch: null, toCheck: null }; // 제한 없음이 섞여 있으면 조건 아님
  const labels = real.map((c) => map[c]?.[1] ?? c).join("·");
  const mapped = real.map((c) => map[c]?.[0] ?? null);
  if (answer === null || mapped.some((m) => m === null)) {
    if (answer !== null && mapped.includes(answer)) return { mismatch: null, toCheck: null };
    return { mismatch: null, toCheck: `${name}: ${labels}` };
  }
  return mapped.includes(answer) ? { mismatch: null, toCheck: null } : { mismatch: `${name}: ${labels}`, toCheck: null };
}

export type Eligibility = { mismatch: string[]; toCheck: string[] };

export function checkEligibility(c: PolicyConditions, info: PolicyInfo): Eligibility {
  const mismatch: string[] = [];
  const toCheck: string[] = [];
  const add = (r: { mismatch: string | null; toCheck: string | null }) => {
    if (r.mismatch) mismatch.push(r.mismatch);
    if (r.toCheck) toCheck.push(r.toCheck);
  };

  add(compare(codes(c.job_cd), JOB_CODE, info.job === "other" ? null : info.job, "취업 상태"));
  add(compare(codes(c.school_cd), SCHOOL_CODE, info.school === "other" ? null : info.school, "학력"));

  // 결혼: 기혼만 / 미혼만
  const mrg = codes(c.mrg_cd);
  if (mrg.length === 1 && (mrg[0] === "0055001" || mrg[0] === "0055002")) {
    const need = mrg[0] === "0055001" ? "married" : "single";
    const label = `결혼: ${need === "married" ? "기혼" : "미혼"}`;
    if (info.married === null) toCheck.push(label);
    else if (info.married !== need) mismatch.push(label);
  }

  // 특화 대상: 대응하는 상황(수급·한부모·장애)만 판단. 빈 배열 = "해당 없음"이라고 답함
  const sbiz = codes(c.sbiz_cd);
  if (sbiz.length > 0 && !sbiz.some((s) => NO_LIMIT.has(s))) {
    const mapped = sbiz.map((s) => SBIZ_CODE[s]?.[0] ?? null);
    const labels = sbiz.map((s) => SBIZ_CODE[s]?.[1] ?? s).join("·");
    if (info.special === null || mapped.some((m) => m === null)) {
      if (!(info.special && mapped.some((m) => m && info.special!.includes(m)))) toCheck.push(`대상: ${labels}`);
    } else if (!mapped.some((m) => info.special!.includes(m!))) mismatch.push(`대상: ${labels}`);
  }

  // 소득: 연소득 상한만 비교. 중위소득 같은 문장 조건은 가구 기준이라 확인할 조건으로
  if (c.earn_cd === "0043002") {
    const max = Number(c.earn_max);
    if (Number.isFinite(max) && max > 0) {
      const label = `연소득 ${max.toLocaleString("ko-KR")}만 원 이하`;
      if (info.income === null) toCheck.push(label);
      else if (INCOME_FLOOR[info.income] >= max) mismatch.push(label);
    }
  } else if (c.earn_cd === "0043003") {
    const t = freeText(c.earn_etc);
    if (t) toCheck.push(`소득: ${short(t)}`);
  }

  const extra = freeText(c.add_cond);
  if (extra) toCheck.push(`추가 조건: ${short(extra)}`);
  return { mismatch, toCheck };
}
