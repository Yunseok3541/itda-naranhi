// 프로필: 시작 질문 + 정책 신청 정보 (기획: docs/기획/프로필.md)
// - 모든 답은 선택. 값이 없으면(null) "답하지 않음"으로 보고 추천·자격 판단에 쓰지 않는다
// - 유형 이름(고립형·은둔형 등)은 만들지도 저장하지도 않는다. 답 그대로 두고 추천할 때만 읽는다
// - 정책 신청 정보는 자격 규칙에만 쓰고 AI에 보내지 않는다
// 화면(클라이언트)과 서버가 같은 목록을 쓰도록 DB 의존이 없는 순수 모듈로 둔다

type Options<K extends string> = readonly (readonly [K, string])[];
const keys = <K extends string>(o: Options<K>) => o.map(([k]) => k);

// ---------- 시작 질문 (users.start_answers) ----------

/** ① 내가 편안하게 활동할 수 있는 범위 (은둔 축). 시작 단계를 정한다 */
export const RANGE = [["home", "집 안"], ["near", "집 근처"], ["out", "바깥 활동"], ["people", "사람 있는 곳"]] as const;
export const TODAY_RANGE = [["rest", "쉬어 가기"], RANGE[0], RANGE[1], RANGE[2]] as const;
/** ② 부담되는 상황 (여러 개) */
export const BURDEN = [["people", "사람 만나기"], ["unfamiliar", "낯선 곳"], ["phone", "전화·대화"], ["morning", "아침에 일어나기"]] as const;
/** ③ 혼자 / 함께 */
export const WITH = [["alone", "혼자 하고 싶어요"], ["together", "함께하는 활동도 알아보고 싶어요"]] as const;
/** ④ 힘들 때 연락할 수 있는 사람 (고립 축) */
export const SUPPORT = [["yes", "있어요"], ["unsure", "잘 모르겠어요"], ["no", "없어요"]] as const;
/** ⑤ 지금 누구와 지내는지 (생활 형태: 독립거주 / 가족동거) */
export const LIVING = [["alone", "혼자"], ["family", "가족과"], ["other", "그 밖에"]] as const;
/** ⑥ 요즘 가장 도움이 필요한 것 (여러 개). 소득을 직접 묻지 않고 필요한 지원 방향으로 묻는다 */
export const NEEDS = [["money_job", "생활비·일자리"], ["health", "몸·마음 건강"], ["family", "가족과의 관계"], ["people", "사람 만나기"], ["unsure", "잘 모르겠어요"]] as const;

export type StartAnswers = {
  range: (typeof RANGE)[number][0] | null;
  burden: (typeof BURDEN)[number][0][] | null;
  with: (typeof WITH)[number][0] | null;
  support: (typeof SUPPORT)[number][0] | null;
  living: (typeof LIVING)[number][0] | null;
  needs: (typeof NEEDS)[number][0][] | null;
};

/** 활동 범위 → 시작 단계 (초안. 추천은 이 단계 + 바로 위 단계까지) */
export const STAGE_BY_RANGE: Record<NonNullable<StartAnswers["range"]>, number> = { home: 1, near: 2, out: 3, people: 4 };

// ---------- 정책 신청 정보 (users.policy_info, 나이는 users.birth_year) ----------
// 온통청년 정책의 자격 코드와 짝을 맞춘 값만 묻는다 (코드 대응은 lib/policy-eligibility.ts)

export const JOB = [
  ["unemployed", "일하고 있지 않아요"], ["employed", "회사에 다녀요"], ["short_term", "단기·아르바이트"], ["daily", "일용직"],
  ["freelancer", "프리랜서"], ["self_employed", "자영업"], ["founder", "창업 (준비 포함)"], ["farmer", "농업"], ["other", "그 밖에"],
] as const;
export const SCHOOL = [
  ["below_high", "고등학교 졸업 전 (재학 아님)"], ["high_student", "고등학교 재학"], ["high_grad", "고등학교 졸업"],
  ["college_student", "대학 재학·휴학"], ["college_grad", "대학 졸업"], ["grad_school", "대학원"], ["other", "그 밖에"],
] as const;
export const MARRIED = [["single", "미혼"], ["married", "기혼"]] as const;
/** 본인 연소득 (만원). 정책 원문의 "연소득 N만원 이하"와 비교. 중위소득 조건은 가구 기준이라 묻지 않고 "확인할 조건"으로만 보여 준다 */
export const INCOME = [
  ["under_2000", "2천만 원 이하 (소득 없음 포함)"], ["2000_3000", "2천만~3천만 원"], ["3000_5000", "3천만~5천만 원"],
  ["5000_7000", "5천만~7천만 원"], ["over_7000", "7천만 원 초과"],
] as const;
/** 구간의 아래 경계 (이 값 초과). 정책 상한이 이 값 이하이면 확실히 넘는다 */
export const INCOME_FLOOR: Record<(typeof INCOME)[number][0], number> = { under_2000: 0, "2000_3000": 2000, "3000_5000": 3000, "5000_7000": 5000, over_7000: 7000 };
/** 해당되는 상황 (여러 개). 빈 배열 = "해당 없음"이라고 답함, null = 답하지 않음 */
export const SPECIAL = [
  ["basic_living", "기초생활수급·차상위"], ["single_parent", "한부모"], ["disabled", "장애"],
  ["leaving_care", "자립준비청년 (보호 종료)"], ["family_carer", "가족을 돌보고 있어요"],
] as const;

export type PolicyInfo = {
  job: (typeof JOB)[number][0] | null;
  school: (typeof SCHOOL)[number][0] | null;
  married: (typeof MARRIED)[number][0] | null;
  income: (typeof INCOME)[number][0] | null;
  special: (typeof SPECIAL)[number][0][] | null;
};

export const EMPTY_START: StartAnswers = { range: null, burden: null, with: null, support: null, living: null, needs: null };
export const EMPTY_POLICY_INFO: PolicyInfo = { job: null, school: null, married: null, income: null, special: null };

// ---------- 검사 ----------

const one = <K extends string>(v: unknown, o: Options<K>): K | null | undefined =>
  v === null || v === undefined || v === "" ? null : keys(o).includes(v as K) ? (v as K) : undefined;
const many = <K extends string>(v: unknown, o: Options<K>): K[] | null | undefined => {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || !v.every((x) => keys(o).includes(x))) return undefined;
  return keys(o).filter((k) => v.includes(k)); // 목록 순서로 정리, 중복 제거
};

/** 저장된 값(믿을 수 없는 JSON)을 읽는다. 모르는 값은 답하지 않은 것으로 */
export function readStartAnswers(v: unknown): StartAnswers {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    range: one(o.range, RANGE) ?? null,
    burden: many(o.burden, BURDEN) ?? null,
    with: one(o.with, WITH) ?? null,
    support: one(o.support, SUPPORT) ?? null,
    living: one(o.living, LIVING) ?? null,
    needs: many(o.needs, NEEDS) ?? null,
  };
}

export function readPolicyInfo(v: unknown): PolicyInfo {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    job: one(o.job, JOB) ?? null,
    school: one(o.school, SCHOOL) ?? null,
    married: one(o.married, MARRIED) ?? null,
    income: one(o.income, INCOME) ?? null,
    special: many(o.special, SPECIAL) ?? null,
  };
}

/** 요청 본문 검사. 틀린 값이 있으면 그 칸 이름을 돌려준다 (조용히 버리지 않음) */
export function parseStartAnswers(v: unknown): { value: StartAnswers } | { invalid: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { invalid: "startAnswers" };
  const o = v as Record<string, unknown>;
  const value = {
    range: one(o.range, RANGE), burden: many(o.burden, BURDEN), with: one(o.with, WITH),
    support: one(o.support, SUPPORT), living: one(o.living, LIVING), needs: many(o.needs, NEEDS),
  };
  const bad = Object.entries(value).find(([, x]) => x === undefined);
  return bad ? { invalid: `startAnswers.${bad[0]}` } : { value: value as StartAnswers };
}

export function parsePolicyInfo(v: unknown): { value: PolicyInfo } | { invalid: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { invalid: "policyInfo" };
  const o = v as Record<string, unknown>;
  const value = {
    job: one(o.job, JOB), school: one(o.school, SCHOOL), married: one(o.married, MARRIED),
    income: one(o.income, INCOME), special: many(o.special, SPECIAL),
  };
  const bad = Object.entries(value).find(([, x]) => x === undefined);
  return bad ? { invalid: `policyInfo.${bad[0]}` } : { value: value as PolicyInfo };
}

/** 출생연도: 정책 대상 나이(대략 15~45세)만. null은 답하지 않음 */
export function parseBirthYear(v: unknown, thisYear: number): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" && /^\d{4}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= thisYear - 45 && n <= thisYear - 15 ? n : undefined;
}

/** 모두 비었는지 (전부 답하지 않음 → DB에는 NULL로 저장) */
export const isEmpty = (o: Record<string, unknown>) => Object.values(o).every((x) => x === null);
