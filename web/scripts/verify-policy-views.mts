// 정책 화면 상단 보기 전환 검증: 맞춤 추천(recommended) / 모든 정책(all) 응답, counts, 동시 요청 시 같은 추천
// 트랜잭션 안에서 가상 정책으로 실행하고 롤백 → DB에 남지 않음. AI는 가짜 응답만 (실제 호출 없음)
// 실행 (web/에서, 로컬 DB):
//   DATABASE_URL=postgres://app:app@localhost:5432/starquest node node_modules/tsx/dist/cli.mjs scripts/verify-policy-views.mts
const { db } = await import("@/lib/db");
const { recommendPolicies, listPolicies, submitFeedback, parseView } = await import("@/app/api/policies/service");
const { todayKst } = await import("@/app/api/_lib/http");
type Db = import("@/app/api/_lib/http").Db;
type Gen = typeof import("@/lib/gemini").generateJson;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}
function fakeGen(data: unknown, during?: () => Promise<void>) {
  const fn = (async () => {
    fn.calls++;
    if (during) await during();
    return { data, usedFallback: false, modelVersion: "fake", fallbackReason: null };
  }) as unknown as Gen & { calls: number };
  fn.calls = 0;
  return fn;
}
const brokenDb: Db = { query: (async () => { throw new Error("simulated db failure"); }) as Db["query"] };
const ids = (b: Body) => (b.items as Body[]).map((i) => i.policyId);
const today = todayKst();

console.log(`\n== 정책 보기 전환 검증 · ${new Date().toISOString()} ==\n`);

// ---------- ?view= 값 (DB 불필요) ----------
check("view 없음·빈 값 → recommended", parseView(null) === "recommended" && parseView("") === "recommended");
check("view=recommended / view=all", parseView("recommended") === "recommended" && parseView("all") === "all");
check("모르는 값(ALL, foo, 'all ') → null (라우트가 400)", parseView("ALL") === null && parseView("foo") === null && parseView("all ") === null);
check("DB 실패 → 맞춤 추천 500 LOAD_FAILED", (await recommendPolicies(1, brokenDb, fakeGen({ items: [] }))).body.code === "LOAD_FAILED");
check("DB 실패 → 모든 정책 500 LOAD_FAILED", (await listPolicies(1, brokenDb)).body.code === "LOAD_FAILED");

const client = await db.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM policy_recommendations");
  await client.query("DELETE FROM policy_events");
  await client.query("DELETE FROM policies"); // 피드백·수정 요청은 ON DELETE CASCADE

  // 가상 정책: 분야가 다른 1단계 정책 5개 + 2단계 1개 + 5단계 1개(1단계 사용자 추천 범위 밖) + 마감 지남 1개
  const defs: [string, number, string[], string | null][] = [
    ["H", 1, ["주거"], null], ["M", 1, ["생활비"], null], ["J", 1, ["일자리"], null], ["C", 2, ["마음건강"], null],
    ["L", 1, ["문화·여가"], null], ["E", 1, ["배움"], null], ["HARD", 5, ["사람과 함께"], null],
    ["OLD", 1, ["주거"], new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10)],
  ];
  const id: Record<string, number> = {};
  for (const [k, stage, tags, end] of defs) {
    id[k] = (
      await client.query<{ id: number }>(
        `INSERT INTO policies (source, source_id, title, url, region_code, apply_end, apply_always, raw, summary, burden, stage, relevance, tags, classified_at, actionable)
         VALUES ('youth_policy', $1, $2, 'https://example.org/p', '11000', $3::date, $3::date IS NULL, '{}', $4, 'online', $5, 3, $6, now(), true)
         RETURNING id`,
        [`views-${k}`, `가상 정책 ${k}`, end, `가상 정책 ${k} 요약`, stage, tags],
      )
    ).rows[0].id;
  }
  const user = async () =>
    (await client.query<{ id: number }>("INSERT INTO users (nickname, current_stage, region_code) VALUES ('가상 보기 사용자', 1, '11440') RETURNING id")).rows[0].id;
  const A = await user();
  const OPEN = 7; // OLD(마감) 빼고 모두

  // ---------- 모든 정책 먼저 (맞춤 추천을 아직 만들지 않음) ----------
  const a0 = (await listPolicies(A, client)).body as Body;
  check(`모든 정책: view=all, 마감 지난 정책 빼고 ${OPEN}개, counts.all = 목록 수`, a0.view === "all" && a0.items.length === OPEN && a0.counts.all === OPEN && !ids(a0).includes(id.OLD), a0.counts);
  check("모든 정책: 난이도 거르지 않음 (5단계 정책도 보임)", ids(a0).includes(id.HARD));
  check("맞춤 추천을 아직 만들지 않았으면 counts.recommended = null, AI·저장 없음", a0.counts.recommended === null
    && Number((await client.query("SELECT count(*) FROM policy_recommendations WHERE user_id = $1", [A])).rows[0].count) === 0, a0.counts);

  // ---------- 맞춤 추천 (기존 로직: 난이도 1+1까지, 분야 다양화, 하루 한 번 저장) ----------
  const gen = fakeGen({ items: [
    { policyId: id.HARD, reason: "범위 밖" }, { policyId: id.H, reason: "집에서 신청할 수 있어요." },
    { policyId: id.M, reason: "생활비 부담을 덜 수 있어요." }, { policyId: id.J, reason: "일 경험을 쌓을 수 있어요." },
  ] });
  const r1 = (await recommendPolicies(A, client, gen)).body as Body;
  check("맞춤 추천: view=recommended, 처음 만듦(reused=false), AI 1회", r1.view === "recommended" && r1.reused === false && gen.calls === 1, r1);
  check("기존 로직대로: 추천 범위 밖(5단계) 제외, AI 순서 [H, M, J]", JSON.stringify(ids(r1)) === JSON.stringify([id.H, id.M, id.J]) && r1.maxDifficulty === 2, ids(r1));
  check("counts = { recommended: 3, all: 7 }", r1.counts.recommended === 3 && r1.counts.all === OPEN, r1.counts);
  check("기존 응답 칸 유지 (usedFallback·basis·modelVersion, 항목의 reason·bucket·evidence)", r1.usedFallback === false && r1.basis?.region && r1.modelVersion === "fake"
    && r1.items.every((i: Body) => i.reason && i.bucket && Array.isArray(i.evidence)), r1.items[0]);

  // 보기를 오가도 같은 추천 (저장된 추천, AI 다시 안 부름)
  const gen2 = fakeGen({ items: [{ policyId: id.L, reason: "다른 결과" }] });
  const r2 = (await recommendPolicies(A, client, gen2)).body as Body;
  check("맞춤 → 모든 정책 → 맞춤: 같은 추천·같은 counts, reused=true, AI 0회", r2.reused === true && gen2.calls === 0
    && JSON.stringify(ids(r2)) === JSON.stringify(ids(r1)) && JSON.stringify(r2.counts) === JSON.stringify(r1.counts), r2);
  const a1 = (await listPolicies(A, client)).body as Body;
  check("모든 정책: counts.recommended = 저장된 맞춤 추천 수(3), 목록은 그대로 7개", a1.counts.recommended === 3 && a1.items.length === OPEN, a1.counts);

  // ---------- [나랑 안 맞아요] 뒤 ----------
  const fb = await submitFeedback(A, id.M, { reason: "not_needed" }, client);
  check("피드백 저장 201", fb.status === 201, fb.body);
  const r3 = (await recommendPolicies(A, client, fakeGen({ items: [] }))).body as Body;
  check("맞춤 추천에서 그 정책이 빠지고 counts.recommended 2, counts.all은 7 그대로", !ids(r3).includes(id.M) && r3.counts.recommended === 2 && r3.counts.all === OPEN, r3.counts);
  const a2 = (await listPolicies(A, client)).body as Body;
  check("모든 정책에서는 그대로 보이고, counts.recommended도 2로 맞음", ids(a2).includes(id.M) && a2.counts.recommended === 2 && a2.counts.all === OPEN, a2.counts);

  // ---------- 동시 요청: 추천을 만드는 동안 다른 요청이 먼저 저장 ----------
  const B = await user();
  const firstSaved = [{ policyId: id.L, reason: "먼저 저장된 추천" }, { policyId: id.E, reason: "먼저 저장된 추천 2" }, { policyId: id.C, reason: "먼저 저장된 추천 3" }];
  const raceGen = fakeGen({ items: [{ policyId: id.H, reason: "나중 요청" }, { policyId: id.M, reason: "나중 요청" }, { policyId: id.J, reason: "나중 요청" }] }, async () => {
    // AI를 기다리는 사이 같은 사용자의 다른 요청이 추천을 저장했다고 가정
    await client.query("INSERT INTO policy_recommendations (user_id, rec_date, policy_ids, items, used_fallback) VALUES ($1, $2::date, $3, $4, false)",
      [B, today, firstSaved.map((x) => x.policyId), JSON.stringify(firstSaved)]);
  });
  const rRace = (await recommendPolicies(B, client, raceGen)).body as Body;
  check("동시 요청: 나중에 끝난 요청도 먼저 저장된 추천을 돌려줌 (reused=true)", rRace.reused === true
    && JSON.stringify(ids(rRace)) === JSON.stringify(firstSaved.map((x) => x.policyId)) && rRace.items[0].reason === "먼저 저장된 추천", ids(rRace));
  const savedB = (await client.query("SELECT items FROM policy_recommendations WHERE user_id = $1", [B])).rows;
  check("저장된 추천은 하나뿐이고 먼저 저장된 것 그대로", savedB.length === 1 && savedB[0].items[0].reason === "먼저 저장된 추천", savedB);
  const shownB = Number((await client.query("SELECT count(*) FROM policy_events WHERE user_id = $1 AND event = 'shown'", [B])).rows[0].count);
  check("저장하지 못한 요청은 노출 기록을 남기지 않음", shownB === 0, shownB);
  const rAgain = (await recommendPolicies(B, client, fakeGen({ items: [] }))).body as Body;
  check("다시 요청해도 같은 추천", JSON.stringify(ids(rAgain)) === JSON.stringify(ids(rRace)), ids(rAgain));

  // ---------- 추천할 정책이 없을 때 ----------
  await client.query("UPDATE policies SET actionable = false");
  const C = await user();
  const rNone = (await recommendPolicies(C, client, fakeGen({ items: [] }))).body as Body;
  const aNone = (await listPolicies(C, client)).body as Body;
  check("정책이 없으면 둘 다 빈 목록, counts 0", rNone.view === "recommended" && rNone.items.length === 0 && rNone.counts.recommended === 0 && rNone.counts.all === 0
    && aNone.items.length === 0 && aNone.counts.all === 0, { r: rNone.counts, a: aNone.counts });
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await db.end();
}

console.log(`\n결과: ${pass} 통과 / ${failCount} 실패`);
process.exit(failCount ? 1 : 0);
