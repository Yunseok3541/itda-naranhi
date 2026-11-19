// 개인 맞춤 정책 추천 (AI ⑤ 추천 단계, 기획: docs/기획/정책추천.md, 명세: docs/API명세.md)
// ① 규칙: 지역·나이·마감·자격 조건(정책 신청 정보, docs/기획/프로필.md) 거르기 → ② 참여 난이도: 내 단계 + 1까지 (후보가 적으면 넓힘)
// → ③ 점수: 관련도·부담 상황·혼자/함께·최근 멈춘 이유 → 상위 8개 → ④ AI가 그 안에서 3개 + 이유 (하루 한 번 저장)
// AI에는 식별 정보 없이 선택값(부담 상황·필요한 것)과 후보 정책 요약만 보낸다. 정책 신청 정보(취업·소득 등)는 보내지 않는다
import { db as pool } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { isSafeAiText } from "@/lib/safety";
import { BURDEN_LABEL, type Burden } from "@/lib/policy-classify";
import { DEMO_REGION, DEMO_REGION_NAME } from "@/lib/policy-sync";
import { CONDITION_COLUMNS, checkEligibility, type PolicyConditions } from "@/lib/policy-eligibility";
import { NEEDS, readPolicyInfo, readStartAnswers, type PolicyInfo, type StartAnswers } from "@/lib/profile";
import { type ApiResult, type Db, fail, ok, todayKst, toId } from "../_lib/http";

const MAX_ITEMS = 3;
const MAX_CANDIDATES = 8;

type PolicyRow = PolicyConditions & {
  id: number;
  title: string;
  summary: string;
  burden: Burden;
  stage: number;
  difficulty_note: string | null;
  relevance: number;
  tags: string[] | null;
  url: string | null;
  apply_end: string | null; // YYYY-MM-DD
  apply_always: boolean;
  region_code: string | null;
};

type UserRow = {
  current_stage: number;
  region_code: string | null;
  birth_year: number | null;
  start_answers: unknown;
  policy_info: unknown;
};

export type Profile = {
  level: number; // 참여 난이도 기준 = 별 단계
  region: string;
  age: number | null;
  burdens: string[]; // 시작 질문 ② (people, unfamiliar, phone, morning)
  together: boolean | null; // 시작 질문 ③ (alone이면 false)
  costStops: number; // 손 뻗어 보기 이유 "돈이 들어서요" 횟수
  needs: NonNullable<StartAnswers["needs"]>; // 시작 질문 ⑥ 요즘 도움이 필요한 것
  support: StartAnswers["support"]; // 시작 질문 ④ 힘들 때 연락할 사람
  living: StartAnswers["living"]; // 시작 질문 ⑤ 생활 형태
  info: PolicyInfo; // 정책 신청 정보 (자격 규칙에만, AI에 보내지 않음)
};

const BURDEN_WORDS: Record<string, string> = { people: "사람 만나기", unfamiliar: "낯선 곳 가기", phone: "전화하거나 대화하기", morning: "아침에 일어나기" };

const POLICY_COLUMNS = `p.id, p.title, p.summary, p.burden, p.stage, p.difficulty_note, p.relevance, p.tags, p.url,
  to_char(p.apply_end, 'YYYY-MM-DD') AS apply_end, p.apply_always, p.region_code, ${CONDITION_COLUMNS}`;

/** 사용자에게 열려 있는 정책 (분류됨, 신청 가능, 지역·나이 맞음). 순서는 난이도 → 관련도 */
const OPEN_SQL = `
  SELECT ${POLICY_COLUMNS}
  FROM policies p
  WHERE p.classified_at IS NOT NULL AND p.actionable IS TRUE
    AND (p.apply_always OR p.apply_end >= $1::date)
    AND (p.region_code IS NULL OR p.region_code = $2
         OR (right(p.region_code, 3) = '000' AND left(p.region_code, 2) = left($2, 2)))
    AND ($3::int IS NULL OR ((p.age_min IS NULL OR p.age_min <= $3) AND (p.age_max IS NULL OR p.age_max >= $3)))
  ORDER BY p.stage, p.relevance DESC, p.id`;

const errorCode = (error: unknown) => (error as { code?: string }).code ?? (error instanceof Error ? error.message : "unknown");

export async function loadProfile(userId: number, db: Db, today: string): Promise<Profile> {
  const u = (
    await db.query<UserRow>("SELECT current_stage, region_code, birth_year, start_answers, policy_info FROM users WHERE id = $1", [userId])
  ).rows[0];
  const costStops = Number(
    (await db.query<{ n: string }>("SELECT count(*) AS n FROM star_attempts WHERE user_id = $1 AND stop_reason = 'cost'", [userId])).rows[0]?.n ?? 0,
  );
  const answers = readStartAnswers(u?.start_answers);
  return {
    level: Math.min(Math.max(u?.current_stage ?? 1, 1), 6),
    region: u?.region_code ?? DEMO_REGION,
    age: u?.birth_year ? Number(today.slice(0, 4)) - u.birth_year : null,
    burdens: answers.burden ?? [],
    together: answers.with === "alone" ? false : answers.with === "together" ? true : null,
    costStops,
    needs: answers.needs ?? [],
    support: answers.support,
    living: answers.living,
    info: readPolicyInfo(u?.policy_info),
  };
}

/** 참여 난이도로 거르기: 내 단계 + 1까지. 3개보다 적으면 한 단계씩 넓힌다 (정책 열람 자체는 막지 않음) */
export function filterByDifficulty(rows: PolicyRow[], level: number): { rows: PolicyRow[]; maxDifficulty: number } {
  let max = Math.min(level + 1, 6);
  while (max < 6 && rows.filter((r) => r.stage <= max).length < MAX_ITEMS) max++;
  return { rows: rows.filter((r) => r.stage <= max), maxDifficulty: max };
}

/** 개인 점수 (높을수록 앞) */
export function scorePolicy(p: PolicyRow, profile: Profile, today: string): number {
  let s = p.relevance * 3;
  if (p.stage > profile.level) s -= 2; // 바로 위 단계는 조금 뒤로
  if (profile.burdens.includes("phone") && p.burden === "phone") s -= 3;
  if (profile.burdens.includes("people") && p.burden === "group") s -= 3;
  if (profile.burdens.includes("unfamiliar") && p.burden === "visit") s -= 1;
  if (profile.together === false && p.burden === "group") s -= 2;
  if (profile.together === true && p.tags?.includes("사람과 함께")) s += 1;
  if (profile.costStops > 0 && p.tags?.some((t) => t === "생활비" || t === "금융")) s += 2;
  // 시작 질문 ④~⑥: 필요한 지원 방향 (유형 이름을 만들지 않고 답을 그대로 점수에 씀)
  const has = (...t: string[]) => p.tags?.some((x) => t.includes(x)) ?? false;
  if (profile.needs.includes("money_job") && has("생활비", "일자리", "주거", "금융")) s += 2;
  if (profile.needs.includes("health") && has("마음건강", "건강")) s += 2;
  if (profile.needs.includes("family") && /가족/.test(`${p.title} ${p.summary}`)) s += 2;
  if (profile.needs.includes("people") && has("사람과 함께")) s += 1;
  if (profile.support === "no" && has("마음건강")) s += 1; // 기댈 사람이 없다고 답함 → 상담·마음건강을 조금 앞으로
  if (profile.living === "alone" && has("주거", "생활비")) s += 1; // 혼자 지냄 → 생활·주거
  if (p.apply_end) {
    const days = (Date.parse(p.apply_end) - Date.parse(today)) / 86_400_000;
    if (days <= 14) s += 1; // 곧 마감
  }
  return s;
}

const formatDate = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const scopeLabel = (p: PolicyRow) => (p.region_code === null ? "전국" : p.region_code.endsWith("000") ? "서울" : DEMO_REGION_NAME);

/** AI 없이 만드는 추천 이유 (AI 실패·이유 검사 실패 시) */
export function templateReason(p: PolicyRow, profile: Profile): string {
  const parts: string[] = [];
  if (p.burden === "online") parts.push("집에서 온라인으로 신청할 수 있어요");
  else if (p.stage <= profile.level + 1) parts.push(`${BURDEN_LABEL[p.burden]}. 지금 단계에서 해 볼 만해요`);
  else parts.push(BURDEN_LABEL[p.burden]);
  if (profile.costStops > 0 && p.tags?.some((t) => t === "생활비" || t === "금융")) parts.push("비용 부담을 덜어 줄 수 있어요");
  return parts.join(" · ");
}

/** 자격 조건: 확실히 안 맞는 것(mismatch)은 추천에서 빼고, 판단할 수 없는 것(toCheck)은 화면에 보여 준다 */
const fits = (p: PolicyRow, profile: Profile) => checkEligibility(p, profile.info).mismatch.length === 0;

function toItem(p: PolicyRow, reason: string, profile: Profile) {
  const e = checkEligibility(p, profile.info);
  return {
    policyId: p.id,
    title: p.title,
    summary: p.summary,
    reason,
    burden: p.burden,
    burdenLabel: BURDEN_LABEL[p.burden],
    difficulty: p.stage,
    difficultyNote: p.difficulty_note,
    tags: p.tags ?? [],
    scope: scopeLabel(p),
    applyEnd: p.apply_end,
    applyAlways: p.apply_always,
    deadline: p.apply_always ? "상시 모집" : p.apply_end ? `${formatDate(p.apply_end)} 마감` : null,
    url: p.url,
    // 전화·방문이 필요한 정책은 문의 문장 준비하기(AI ⑥)로 이어 준다
    needsInquiry: p.burden === "phone" || p.burden === "visit",
    // 원문에서 확인할 자격 조건 (답하지 않은 칸, "기타", 중위소득 같은 문장 조건)
    conditionsToCheck: e.toCheck,
    // 내가 알려 준 정보와 맞지 않을 수 있는 조건 ("모든 정책 보기"에서만 생김. 원문 데이터가 틀릴 수 있어 숨기지 않음)
    mayNotFit: e.mismatch,
  };
}

async function basis(db: Db) {
  const r = (
    await db.query<{ at: string | null }>(
      `SELECT to_char(max(finished_at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS at FROM policy_syncs WHERE finished_at IS NOT NULL`,
    )
  ).rows[0];
  return { region: DEMO_REGION_NAME, updatedAt: r?.at ?? null };
}

type AiOutput = { items: { policyId: number; reason: string }[] };
const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { policyId: { type: "integer" }, reason: { type: "string" } }, required: ["policyId", "reason"] },
    },
  },
  required: ["items"],
};
const isOutput = (v: unknown): v is AiOutput => !!v && Array.isArray((v as AiOutput).items);

const SYSTEM = `너는 사회적으로 고립된 청년을 돕는 앱에서 정책을 골라 주는 도우미다.
후보 정책 중에서 이 사용자가 부담 없이 확인해 볼 만한 정책을 최대 ${MAX_ITEMS}개 고르고, 고른 이유를 한 문장(50자 이내)으로 쓴다.
- 후보에 있는 policyId만 쓴다. 참여 난이도가 낮고 사용자의 부담 상황을 피하는 정책을 우선한다.
- 이유는 정책 요약과 사용자 상황에 있는 내용만 쓴다. 자격이 된다고 단정하지 않는다. 권유·압박·과장 표현 금지.
지정된 JSON만 출력한다.`;

/**
 * 오늘의 정책 추천. userId는 반드시 세션에서 구한 값
 * 200 { items, usedFallback, reused, maxDifficulty, basis, modelVersion? }
 */
export async function recommendPolicies(userId: number, db: Db = pool, generate: typeof generateJson = generateJson): Promise<ApiResult> {
  const today = todayKst();
  let profile: Profile;
  let open: PolicyRow[];
  try {
    profile = await loadProfile(userId, db, today);
    open = (await db.query<PolicyRow>(OPEN_SQL, [today, profile.region, profile.age])).rows;

    // 하루 한 번 저장한 추천이 있으면 그대로 (마감된 정책은 빠짐)
    const saved = (
      await db.query<{ items: { policyId: number; reason: string }[]; used_fallback: boolean }>(
        "SELECT items, used_fallback FROM policy_recommendations WHERE user_id = $1 AND rec_date = $2::date",
        [userId, today],
      )
    ).rows[0];
    if (saved) {
      const byId = new Map(open.map((p) => [p.id, p]));
      // 오늘 정책 신청 정보를 바꿨다면 이제 맞지 않는 정책은 뺀다 (AI를 다시 부르지는 않음)
      const items = saved.items
        .filter((i) => byId.has(i.policyId) && fits(byId.get(i.policyId)!, profile))
        .map((i) => toItem(byId.get(i.policyId)!, i.reason, profile));
      return ok({ items, usedFallback: saved.used_fallback, reused: true, basis: await basis(db) });
    }
  } catch (error) {
    console.error("[policies] 조회 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 정책을 불러오지 못했어요.");
  }

  const { rows: allowed, maxDifficulty } = filterByDifficulty(open.filter((p) => fits(p, profile)), profile.level);
  const candidates = allowed
    .map((p) => ({ p, s: scorePolicy(p, profile, today) }))
    .sort((a, b) => b.s - a.s || a.p.stage - b.p.stage || a.p.id - b.p.id)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.p);
  if (candidates.length === 0) return ok({ items: [], usedFallback: true, reused: false, maxDifficulty, basis: await basis(db) });

  const prompt = JSON.stringify({
    사용자: {
      참여_난이도_기준: profile.level,
      부담스러운_상황: profile.burdens.map((b) => BURDEN_WORDS[b] ?? b),
      함께하는_활동: profile.together === null ? "모름" : profile.together ? "함께하는 활동도 알아보고 싶음" : "혼자 하고 싶음",
      최근_돈_때문에_멈춘_적: profile.costStops > 0,
      요즘_도움이_필요한_것: profile.needs.map((n) => NEEDS.find(([k]) => k === n)![1]),
    },
    후보: candidates.map((p) => ({ policyId: p.id, 이름: p.title, 요약: p.summary, 방식: BURDEN_LABEL[p.burden], 참여_난이도: p.stage, 분야: p.tags ?? [] })),
  });
  const ai = await generate<AiOutput>({ system: SYSTEM, prompt, schema, validate: isOutput, fallback: { items: [] } });

  // 후보 밖·중복 ID는 버리고, 이유가 검사에 걸리면 문장 틀로 바꾼다
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const picked: { policyId: number; reason: string }[] = [];
  for (const i of ai.data.items) {
    const id = toId(i?.policyId);
    if (id === null || !byId.has(id) || picked.some((x) => x.policyId === id)) continue;
    picked.push({ policyId: id, reason: isSafeAiText(i.reason, 70) ? i.reason.trim() : templateReason(byId.get(id)!, profile) });
    if (picked.length === MAX_ITEMS) break;
  }
  const usedFallback = picked.length === 0;
  const final = usedFallback ? candidates.slice(0, MAX_ITEMS).map((p) => ({ policyId: p.id, reason: templateReason(p, profile) })) : picked;

  // 저장 실패해도 추천은 응답한다 (다음 요청에서 다시 만듦)
  try {
    const savedNow = await db.query(
      `INSERT INTO policy_recommendations (user_id, rec_date, policy_ids, items, used_fallback) VALUES ($1, $2::date, $3, $4, $5)
       ON CONFLICT (user_id, rec_date) DO NOTHING`,
      [userId, today, final.map((f) => f.policyId), JSON.stringify(final), usedFallback],
    );
    if (savedNow.rowCount) {
      await db.query(
        "INSERT INTO policy_events (user_id, policy_id, event) SELECT $1, unnest($2::int[]), 'shown'",
        [userId, final.map((f) => f.policyId)],
      );
    }
  } catch (error) {
    console.error("[policies] 추천 저장 실패, 응답은 계속", errorCode(error));
  }

  return ok({
    items: final.map((f) => toItem(byId.get(f.policyId)!, f.reason, profile)),
    usedFallback,
    reused: false,
    maxDifficulty,
    basis: await basis(db).catch(() => ({ region: DEMO_REGION_NAME, updatedAt: null })),
    modelVersion: ai.modelVersion,
  });
}

/** 모든 정책 보기 (AI 없음, 난이도 거르지 않음 — 정책은 단계와 관계없이 언제든 열람) */
export async function listPolicies(userId: number, db: Db = pool): Promise<ApiResult> {
  const today = todayKst();
  try {
    const profile = await loadProfile(userId, db, today);
    const rows = (await db.query<PolicyRow>(OPEN_SQL, [today, profile.region, profile.age])).rows;
    return ok({ items: rows.map((p) => toItem(p, templateReason(p, profile), profile)), basis: await basis(db) });
  } catch (error) {
    console.error("[policies] 목록 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 정책을 불러오지 못했어요.");
  }
}

/** 원문 열기 기록 ("정보 확인" 지표, 신청·참여가 아님). 응답 { url } */
export async function recordClick(userId: number, policyIdRaw: unknown, db: Db = pool): Promise<ApiResult> {
  const policyId = toId(policyIdRaw);
  if (policyId === null) return fail(400, "INVALID", "policyId가 올바르지 않아요.");
  try {
    const p = (await db.query<{ url: string | null }>("SELECT url FROM policies WHERE id = $1", [policyId])).rows[0];
    if (!p) return fail(404, "NOT_FOUND", "정책을 찾을 수 없어요.");
    await db.query("INSERT INTO policy_events (user_id, policy_id, event) VALUES ($1, $2, 'clicked')", [userId, policyId]);
    return ok({ url: p.url });
  } catch (error) {
    console.error("[policies] 클릭 기록 실패", errorCode(error));
    return fail(500, "SAVE_FAILED", "기록하지 못했어요. 원문은 그대로 열 수 있어요.");
  }
}
