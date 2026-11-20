// 퀘스트 후 설문 · 성향 점수 · 시작 질문 → 우선 focus 검증 (고민기록 #32)
// 트랜잭션 안에서 가상 사용자로 실행하고 롤백 → DB에 남지 않음. AI 호출 없음
// 실행 (web/에서, 로컬 DB만. 공용 Neon에 쓰지 않음):
//   DATABASE_URL=postgres://app:app@localhost:55432/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-survey.mts
import { readFileSync } from "node:fs";

process.env.GEMINI_API_KEY = "";

const { db } = await import("@/lib/db");
const { TAGS, FOCUSES } = await import("@/lib/quest-meta");
const { focusPriority, readStartAnswers, EMPTY_START } = await import("@/lib/profile");
const { attemptScore, tagScores, topFromSurvey, topFromStartAnswers, computePreference } = await import("@/lib/preference");
const { createAttempt } = await import("@/app/api/_lib/attempts");
const { saveSurvey } = await import("@/app/api/_lib/survey");
const { getPreferences } = await import("@/app/api/preferences/service");
type Db = import("@/app/api/_lib/http").Db;
type Start = import("@/lib/profile").StartAnswers;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const start = (o: Partial<Start>): Start => ({ ...EMPTY_START, ...o });

// ---------- 상수 = quests.json ----------
const qj = JSON.parse(readFileSync(new URL("../../quests.json", import.meta.url), "utf8")) as {
  tags: Record<string, { label: string }>;
  focuses: Record<string, unknown>;
  quests: { id: number; tags: string[] }[];
};
check("성향 태그 key·label·순서 = quests.json", eq(TAGS.map(([k, l]) => [k, l]), Object.entries(qj.tags).map(([k, v]) => [k, v.label])));
check("focus key·순서 = quests.json", eq([...FOCUSES], Object.keys(qj.focuses)));

// ---------- 시작 질문 → 우선 focus ----------
const fp = (o: Partial<Start>) => focusPriority(start(o));
check("값 없음 → [daily, outing], 1단계", eq(fp({}), { focusPriority: ["daily", "outing"], suggestedStage: 1 }), fp({}));
check("저장된 값이 없는 사용자(null) → 기본값", eq(focusPriority(readStartAnswers(null)).focusPriority, ["daily", "outing"]));
check("은둔(집 안) + 고립(기댈 사람 없음) → outing·daily·relation, 1단계",
  eq(fp({ range: "home", support: "no" }), { focusPriority: ["daily", "outing", "relation"], suggestedStage: 1 }), fp({ range: "home", support: "no" }));
check("needs 생활비·일자리 → [work], 활동 범위 없으면 1단계", eq(fp({ needs: ["money_job"] }), { focusPriority: ["work"], suggestedStage: 1 }));
check("가족과 지냄 + 가족 관계 필요 → relation 2표가 맨 앞",
  eq(fp({ living: "family", needs: ["family", "health"] }).focusPriority, ["relation", "daily"]), fp({ living: "family", needs: ["family", "health"] }));
check("잘 모르겠어요(support unsure) → relation", eq(fp({ support: "unsure" }).focusPriority, ["relation"]));
check("혼자 외출 가능 → 3단계, 규칙 없음이면 기본 focus", eq(fp({ range: "out" }), { focusPriority: ["daily", "outing"], suggestedStage: 3 }));
check("표가 같으면 daily·outing·relation·work 순",
  eq(fp({ needs: ["money_job", "people", "health"] }).focusPriority, ["daily", "relation", "work"]));
check("needs '잘 모르겠어요'는 규칙 없음", eq(fp({ needs: ["unsure"] }).focusPriority, ["daily", "outing"]));

// ---------- 성향 점수 (순수 함수) ----------
check("시도 점수: 둘 다 → 평균, 한쪽만 → 그 값, 없음 → null",
  attemptScore({ satisfaction: 4, achievement: 5 }) === 4.5 && attemptScore({ satisfaction: null, achievement: 2 }) === 2 && attemptScore({ satisfaction: null, achievement: null }) === null);
const rows = [
  { satisfaction: 5, achievement: 5, tags: ["outdoor"] },
  { satisfaction: 4, achievement: null, tags: ["outdoor", "social"] },
  { satisfaction: null, achievement: 2, tags: ["learning"] },
  { satisfaction: null, achievement: null, tags: ["rest"] }, // 설문 안 함 → 세지 않음
];
const ts = tagScores(rows);
check("태그별 평균·개수 (설문 없는 시도는 빼고, 태그 5개 모두)",
  eq(ts.map((t) => [t.tag, t.score, t.count]), [["outdoor", 4.5, 2], ["social", 4, 1], ["career", null, 0], ["learning", 2, 1], ["rest", null, 0]]), ts);
check("label = 바깥형·만남형·직업형·배움형·회복형", eq(ts.map((t) => t.label), ["바깥형", "만남형", "직업형", "배움형", "회복형"]));
check("top: 3점 이상만, 점수 높은 순 최대 2개 (배움형 2점 제외)", eq(topFromSurvey(ts), ["outdoor", "social"]));
const homeAlone = start({ range: "home", with: "alone", needs: ["money_job"] });
check("시작 질문 top: 집 안·혼자 → 회복형 2표, 생활비·일자리 → 직업형", eq(topFromStartAnswers(homeAlone), ["rest", "career"]));
check("시작 질문 top: 답 없음 → 회복형·바깥형", eq(topFromStartAnswers(EMPTY_START), ["rest", "outdoor"]));
check("설문 3개 미만 → basis start_answers", computePreference(rows.slice(0, 2), homeAlone).basis === "start_answers");
check("설문 3개 이상 → basis survey + 설문 top", eq(computePreference(rows, homeAlone), { tags: ts, top: ["outdoor", "social"], basis: "survey", surveyedAttempts: 3 }));
const low = computePreference([1, 2, 1].map((s) => ({ satisfaction: s, achievement: s, tags: ["outdoor"] })), homeAlone);
check("설문 3개여도 3점 이상인 태그가 없으면 시작 질문 기준", low.basis === "start_answers" && eq(low.top, ["rest", "career"]) && low.surveyedAttempts === 3, low);

// ---------- DB: 설문 API · 성향 API ----------
const brokenDb = (real: Db): Db => ({
  query: (async (text: string, values?: unknown[]) => {
    if (/\bUPDATE\b|\bSELECT\b/i.test(text)) throw new Error("simulated db failure");
    return real.query(text, values);
  }) as Db["query"],
});

const client = await db.connect();
try {
  await client.query("BEGIN");
  const mk = async (nick: string, answers: Start | null) =>
    (await client.query<{ id: number }>("INSERT INTO users (nickname, start_answers, current_stage) VALUES ($1, $2, 1) RETURNING id", [nick, answers && JSON.stringify(answers)])).rows[0].id;
  const P = await mk("설문P", homeAlone);
  const Q = await mk("설문Q", null);

  // 시험에 쓸 별: 태그가 서로 다른 별 3개 (DB와 quests.json이 같은지도 확인)
  const starTags = new Map((await client.query<{ id: number; tags: string[] }>("SELECT id, tags FROM stars")).rows.map((r) => [r.id, r.tags]));
  check("DB 별 태그 = quests.json", qj.quests.every((q) => eq(starTags.get(q.id), q.tags)) && starTags.size === qj.quests.length);
  const pick = (tags: string[]) => qj.quests.find((q) => eq(q.tags, tags))!.id;
  const sOut = pick(["outdoor"]);
  const sOutSocial = pick(["outdoor", "social"]);
  const sLearn = pick(["learning"]);
  const attempt = async (user: number, starId: number, status: "bright" | "dim") =>
    (await createAttempt(user, { starId, status }, client)).body.attemptId as number;
  const a1 = await attempt(P, sOut, "bright");
  const a2 = await attempt(P, sOutSocial, "dim");
  const a3 = await attempt(P, sLearn, "bright");
  const points = async (u: number) => Number((await client.query("SELECT COALESCE((SELECT total_points FROM v_user_points WHERE user_id = $1), 0) AS p", [u])).rows[0].p);
  const pointsBefore = await points(P);

  const skip = await saveSurvey(P, String(a1), {}, client);
  const skipNull = await saveSurvey(P, String(a1), null, client);
  check("건너뛰기({}·본문 없음) → 200 saved=false, 저장 안 함",
    skip.status === 200 && skip.body.saved === false && skipNull.status === 200 && skipNull.body.saved === false
      && (await client.query("SELECT surveyed_at FROM star_attempts WHERE id = $1", [a1])).rows[0].surveyed_at === null, skip);
  const s1 = await saveSurvey(P, String(a1), { satisfaction: 5, achievement: 5 }, client);
  console.log("설문 저장:", s1.status, JSON.stringify(s1.body));
  check("설문 저장 → 200 saved=true + 값 + 날짜(YYYY-MM-DD)",
    s1.status === 200 && s1.body.saved === true && s1.body.satisfaction === 5 && s1.body.achievement === 5 && /^\d{4}-\d{2}-\d{2}$/.test(String(s1.body.surveyedAt)), s1.body);
  const s2 = await saveSurvey(P, String(a2), { satisfaction: 4 }, client);
  check("손 뻗어 보기(dim) 시도도 설문 가능, 한쪽만 답해도 됨", s2.status === 200 && s2.body.satisfaction === 4 && s2.body.achievement === null, s2.body);
  for (const [name, b] of [["0", { satisfaction: 0 }], ["6", { achievement: 6 }], ["문자열", { satisfaction: "4" }], ["소수", { achievement: 3.5 }], ["배열 본문", [1, 2]]] as const) {
    const r = await saveSurvey(P, String(a3), b, client);
    check(`범위 밖·형식 오류(${name}) → 400 INVALID`, r.status === 400 && r.body.code === "INVALID", r);
  }
  check("attemptId 형식 오류 → 400", (await saveSurvey(P, "abc", { satisfaction: 3 }, client)).status === 400);
  check("없는 시도 → 404", (await saveSurvey(P, "2000000000", { satisfaction: 3 }, client)).status === 404);
  const other = await saveSurvey(Q, String(a1), { satisfaction: 1 }, client);
  check("다른 사용자의 시도 → 404, 값 그대로",
    other.status === 404 && other.body.code === "NOT_FOUND" && (await client.query("SELECT satisfaction FROM star_attempts WHERE id = $1", [a1])).rows[0].satisfaction === 5);
  check("DB 장애 → 500 SAVE_FAILED", (await saveSurvey(P, String(a3), { satisfaction: 3 }, brokenDb(client))).body.code === "SAVE_FAILED");
  check("설문해도 포인트 그대로", (await points(P)) === pointsBefore, [pointsBefore, await points(P)]);

  const pr2 = (await getPreferences(P, client)).body as Body;
  console.log("성향(설문 2개):", JSON.stringify(pr2));
  check("설문 2개 → basis start_answers, top = 시작 질문, focus·단계 = 시작 질문",
    pr2.basis === "start_answers" && eq(pr2.top, ["rest", "career"]) && pr2.surveyedAttempts === 2
      && eq(pr2.focusPriority, ["daily", "outing", "work"]) && pr2.suggestedStage === 1, pr2);
  await saveSurvey(P, String(a3), { achievement: 2 }, client);
  const pr3 = (await getPreferences(P, client)).body as Body;
  console.log("성향(설문 3개):", JSON.stringify(pr3));
  check("설문 3개 → basis survey, 태그 점수 = 순수 함수 계산과 같음",
    pr3.basis === "survey" && eq(pr3.top, ["outdoor", "social"]) && pr3.surveyedAttempts === 3
      && eq(pr3.tags.map((t: Body) => [t.tag, t.score, t.count]), [["outdoor", 4.5, 2], ["social", 4, 1], ["career", null, 0], ["learning", 2, 1], ["rest", null, 0]]), pr3);
  const over = await saveSurvey(P, String(a1), { achievement: 1 }, client);
  check("다시 보내면 덮어씀 (빠진 칸 = 답하지 않음)", over.body.satisfaction === null && over.body.achievement === 1, over.body);
  const pr4 = (await getPreferences(P, client)).body as Body;
  check("덮어쓴 값으로 다시 계산 (바깥형 (1+4)/2 = 2.5 → top에서 빠짐)",
    pr4.tags[0].score === 2.5 && eq(pr4.top, ["social"]), pr4.tags);

  const prQ = (await getPreferences(Q, client)).body as Body;
  check("시작 질문·설문 없는 사용자 → 기본 top·focus, 태그 5개 모두 count 0",
    prQ.basis === "start_answers" && eq(prQ.top, ["rest", "outdoor"]) && eq(prQ.focusPriority, ["daily", "outing"]) && prQ.surveyedAttempts === 0
      && prQ.tags.length === 5 && prQ.tags.every((t: Body) => t.count === 0 && t.score === null), prQ);
  check("없는 사용자 → 404", (await getPreferences(2_000_000_000, client)).status === 404);
  check("DB 장애 → 500 LOAD_FAILED", (await getPreferences(P, brokenDb(client))).body.code === "LOAD_FAILED");
  check("응답에 연구 유형 이름 없음", !/형:|고립형|은둔형|독립거주|가족동거형|건강·정서/.test(JSON.stringify([pr2, pr3, prQ])));

  // DB 제약: 설문 값 없이 surveyed_at만 / 범위 밖 값은 거절
  for (const [name, sql] of [
    ["값 없이 surveyed_at만", "UPDATE star_attempts SET satisfaction = NULL, achievement = NULL, surveyed_at = now() WHERE id = $1"],
    ["값은 있는데 surveyed_at 없음", "UPDATE star_attempts SET satisfaction = 3, surveyed_at = NULL WHERE id = $1"],
    ["만족도 6", "UPDATE star_attempts SET satisfaction = 6, surveyed_at = now() WHERE id = $1"],
  ] as const) {
    await client.query("SAVEPOINT c");
    const rejected = await client.query(sql, [a3]).then(() => false, () => true);
    await client.query("ROLLBACK TO SAVEPOINT c");
    check(`DB 제약: ${name} → 거절`, rejected);
  }
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
