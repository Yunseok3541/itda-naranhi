// 별 추천 → 회고 처리 → 시도 저장 → 밤하늘 재조회 흐름 검증
// 가상 사용자로 트랜잭션 안에서 실행하고 롤백 → 공용 DB에 남지 않음 (ID 시퀀스 값만 올라감)
// 사용자 ID는 세션 대신 인자로 넣는다 (쿠키 세션을 거친 확인은 scripts/verify-http.sh)
// 실행 (web/에서):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts            실제 Gemini
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --no-key   키 없음 (기본값 경로)
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --ai-fail  잘못된 키 (호출 실패)
//   모델을 바꿔 보려면 앞에 GEMINI_MODEL=... 를 붙인다
const noKey = process.argv.includes("--no-key");
const aiFail = process.argv.includes("--ai-fail");
if (noKey) process.env.GEMINI_API_KEY = "";
if (aiFail) process.env.GEMINI_API_KEY = "invalid-key-for-test";
const expectFallback = noKey || aiFail;

const { db } = await import("@/lib/db");
const { GEMINI_MODEL } = await import("@/lib/gemini");
const { recommend } = await import("@/app/api/recommendations/service");
const { processReflection, inspectReflection } = await import("@/lib/reflection");
const { createAttempt } = await import("@/app/api/_lib/attempts");
const { getSky } = await import("@/app/api/_lib/sky");
const { createDraft, listDrafts, updateDraft } = await import("@/app/api/_lib/inquiries");
const { getCenter, listCenters } = await import("@/app/api/_lib/centers");
type Db = import("@/app/api/_lib/http").Db;
type Gen = typeof import("@/lib/gemini").generateJson;

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// AI 응답을 정해 둔 값으로 바꾸는 가짜 generateJson (calls로 호출 횟수 확인)
function fakeGen(data: unknown) {
  const fn = (async () => {
    fn.calls++;
    return { data, usedFallback: false, modelVersion: "fake", fallbackReason: null };
  }) as unknown as Gen & { calls: number };
  fn.calls = 0;
  return fn;
}
// 형식이 틀린 응답 / 예외를 던지는 호출
const invalidGen = (async (o: { fallback: unknown }) => ({ data: o.fallback, usedFallback: true, modelVersion: null, fallbackReason: "invalid" })) as unknown as Gen;
const throwingGen = (async () => {
  throw new Error("simulated AI crash");
}) as unknown as Gen;

// 쿼리를 던지는 가짜 DB (insertOnly면 INSERT가 들어간 문장만 실패. 시도 저장은 WITH ... INSERT 형태)
const brokenDb = (real: Db, insertOnly: boolean): Db => ({
  query: (async (text: string, values?: unknown[]) => {
    if (!insertOnly || /\bINSERT\s+INTO\b/i.test(text)) throw new Error("simulated db failure");
    return real.query(text, values);
  }) as Db["query"],
});

console.log(`\n== 모드: ${noKey ? "키 없음" : aiFail ? "AI 실패(잘못된 키)" : `실제 Gemini (${GEMINI_MODEL})`} · ${new Date().toISOString()} ==\n`);

// ---------- 회고 처리 함수 (DB 불필요) ----------
const r0 = await processReflection({ status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", starTitle: "현관 앞 5분 서 있기", stopReason: "tired" });
console.log("회고 처리:", JSON.stringify(r0));
check("processReflection 반환 키는 cheer·help 두 개", JSON.stringify(Object.keys(r0).sort()) === '["cheer","help"]', Object.keys(r0));
check("정상 회고 → help null, 응원 문자열", r0.help === null && typeof r0.cheer === "string" && r0.cheer.length > 0);
const d0 = await inspectReflection({ status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", starTitle: "현관 앞 5분 서 있기" });
check(`실제 호출 usedFallback=${expectFallback}`, d0.usedFallback === expectFallback, d0);
if (!expectFallback) check("응답 모델 버전 기록", typeof d0.modelVersion === "string" && d0.modelVersion.length > 0, d0.modelVersion);

const emptyGen = fakeGen({ cheer: "x", risk: "normal" });
const rEmptyRefl = await processReflection({ status: "bright", reflection: "  " }, emptyGen);
check("빈 회고 → AI 호출 없음 + bright 기본 응원", emptyGen.calls === 0 && rEmptyRefl.cheer === "오늘 해낸 일을 이 별에 담았어요." && rEmptyRefl.help === null);
const rThrow = await processReflection({ status: "dim", reflection: "죽고 싶다는 생각이 들었어요" }, throwingGen);
check("AI 호출 예외 → 기본 응원 + 규칙 기반 help", rThrow.cheer === "오늘 손을 뻗어 본 순간을 이 별에 담았어요." && rThrow.help !== null);
const rInvalid = await processReflection({ status: "dim", reflection: "오늘은 너무 힘들었어요" }, invalidGen);
check("출력 형식 오류 → 기본 응원 + 규칙(부정 감정)으로 최소 caution help", rInvalid.help !== null && rInvalid.cheer.startsWith("오늘 손을"));
const rInvalidOk = await processReflection({ status: "bright", reflection: "창문 열고 하늘 봤어요" }, invalidGen);
check("출력 형식 오류 + 평범한 회고 → 기본 응원, help null", rInvalidOk.help === null && rInvalidOk.cheer === "오늘 해낸 일을 이 별에 담았어요.");
const rBanned = await processReflection({ status: "bright", reflection: "이불을 정리했어요" }, fakeGen({ cheer: "완벽해요! 반드시 매일 하세요", risk: "normal" }));
check("금지 표현 응원 → 기본 문구", rBanned.cheer === "오늘 해낸 일을 이 별에 담았어요.");
const rAiDanger = await processReflection({ status: "dim", reflection: "다 놓아버리고 싶어요" }, fakeGen({ cheer: "잘했어요", risk: "danger" }));
check("AI가 danger → 기본 응원 + help", rAiDanger.help !== null && rAiDanger.cheer.startsWith("오늘 손을"));
const rRuleOverAi = await processReflection({ status: "dim", reflection: "자해를 했어요" }, fakeGen({ cheer: "잘했어요", risk: "normal" }));
check("AI가 normal이어도 규칙 danger면 help", rRuleOverAi.help !== null);
const rGood = await processReflection({ status: "dim", reflection: "우편함까지 가 봤어요" }, fakeGen({ cheer: "우편함까지 다녀온 걸음이 별에 남았어요.", risk: "normal" }));
check("검증 통과한 AI 응원은 그대로 사용", rGood.cheer === "우편함까지 다녀온 걸음이 별에 남았어요." && rGood.help === null);

const client = await db.connect();
try {
  await client.query("BEGIN");
  const mk = async (nick: string, stage = 1) =>
    (
      await client.query<{ id: number }>(
        `INSERT INTO users (nickname, start_answers, current_stage) VALUES ($1, '{"range":"near","burden":["people"],"with":"alone"}', $2) RETURNING id`,
        [nick, stage],
      )
    ).rows[0].id;
  const A = await mk("검증A");
  const B = await mk("검증B");
  const C = await mk("검증C", 2); // 2단계 → 3단계 별(바깥 GPS 별)까지 후보

  // ---------- 시드 (별 ID를 직접 적지 않고 추천 범위 규칙으로 구함: gps=바깥, stage 1=집 안, 그 외=집 근처) ----------
  type SeedStar = { id: number; constellation_id: number; stage: number; star_count: number; title: string; verify_type: string; place_type: string | null; category: string; points: number };
  const seed = (
    await client.query<SeedStar>(
      `SELECT s.id, s.constellation_id, c.stage, c.star_count, s.title, s.verify_type, s.place_type, s.category, p.points
       FROM stars s JOIN constellations c ON c.id = s.constellation_id JOIN v_star_points p ON p.star_id = s.id
       ORDER BY c.stage, s.constellation_id, s.position`,
    )
  ).rows;
  const homeIds = seed.filter((s) => s.verify_type !== "gps" && s.stage === 1).map((s) => s.id);
  const nearIds = seed.filter((s) => s.verify_type !== "gps" && s.stage === 2).map((s) => s.id); // 1단계 사용자에게 보이는 집 근처 별
  const gpsId = seed.find((s) => s.verify_type === "gps")!.id; // 가장 낮은 단계의 바깥 별
  const pointsOf = (id: number) => seed.find((s) => s.id === id)!.points;
  const byConst = new Map<number, SeedStar[]>();
  for (const s of seed) byConst.set(s.constellation_id, [...(byConst.get(s.constellation_id) ?? []), s]);
  const stageCount = [1, 2, 3, 4].map((st) => [...byConst.values()].filter((g) => g[0].stage === st).length).join(",");
  console.log(`시드: 별자리 ${byConst.size}개 · 별 ${seed.length}개 · 단계별 별자리 수 ${stageCount} · 집 안 ${homeIds} · 집 근처 ${nearIds} · 첫 바깥 별 ${gpsId}`);
  check("별자리 10개, 난이도 1·2·3·4 = 1·3·3·3개", byConst.size === 10 && stageCount === "1,3,3,3", stageCount);
  check("별 수 = 난이도 (1단계만 3개), star_count와 실제 별 수 일치",
    [...byConst.values()].every((g) => g.length === g[0].star_count && g.length === (g[0].stage === 1 ? 3 : g[0].stage)));
  check("별 30개, 제목 중복 없음", seed.length === 30 && new Set(seed.map((s) => s.title)).size === 30);
  check("별 점수 = 난이도 × 10", seed.every((s) => s.points === s.stage * 10));
  check("1단계 사용자의 집 안 후보 3개, 집 근처 6개", homeIds.length === 3 && nearIds.length === 6, { homeIds, nearIds });
  check("gps 별은 place_type 있음, 청년센터·봉사 별 포함",
    seed.every((s) => (s.verify_type === "gps") === (s.place_type !== null)) && seed.some((s) => s.category === "center") && seed.some((s) => s.category === "volunteer"));
  const v4 = (
    await client.query<{ sub_quests: number; sub_on_outside: number; center_gps: number; home_outside: number; photo: number }>(
      `SELECT (SELECT count(*)::int FROM sub_quests) AS sub_quests,
              (SELECT count(*)::int FROM sub_quests q JOIN stars s ON s.id = q.star_id WHERE s.is_outside) AS sub_on_outside,
              (SELECT count(*)::int FROM stars WHERE place_type = 'youth_center' AND category = 'center' AND is_outside) AS center_gps,
              (SELECT count(*)::int FROM stars s JOIN constellations c ON c.id = s.constellation_id WHERE c.stage = 1 AND s.is_outside) AS home_outside,
              (SELECT count(*)::int FROM stars WHERE verify_type = 'photo') AS photo`,
    )
  ).rows[0];
  check("v4 구조: 하위 퀘스트 8개(모두 바깥 별), 센터 앞 GPS 별 1개, 1단계는 집 안, 사진 확인 별 없음",
    v4.sub_quests === 8 && v4.sub_on_outside === 8 && v4.center_gps === 1 && v4.home_outside === 0 && v4.photo === 0, v4);
  const checkin = async (user: number, choice: string | null) =>
    (
      await client.query<{ id: number }>(
        "INSERT INTO checkins (user_id, text, weather, today_choice, risk) VALUES ($1, $2, 'partly_cloudy', $3, 'normal') RETURNING id",
        [user, "오늘은 집 근처까지는 나갈 수 있을 것 같아요.", choice],
      )
    ).rows[0].id;

  // ---------- 추천 ----------
  const cA = await checkin(A, "near");
  const t0 = Date.now();
  const r1 = await recommend(A, { checkinId: cA }, client);
  const b1 = r1.body as Body;
  const ids1 = (b1.items ?? []).map((i: Body) => i.starId);
  console.log("추천 1차:", r1.status, `${Date.now() - t0}ms`, JSON.stringify(b1));
  check("정상 추천 200", r1.status === 200);
  check("1~3개", ids1.length >= 1 && ids1.length <= 3, ids1);
  // near 후보 = 2단계 비GPS → 1단계. 실제 시드 별 안
  check("near 후보(집 근처·집 안) 안의 실제 별", ids1.every((id: number) => [...nearIds, ...homeIds].includes(id)), ids1);
  check("계약 필드 starId·title·reason", (b1.items ?? []).every((i: Body) => Number.isInteger(i.starId) && i.title && i.reason));
  check(`usedFallback=${expectFallback}`, b1.usedFallback === expectFallback, b1.usedFallback);
  check("reused=false, todayChoice=near", b1.reused === false && b1.todayChoice === "near");

  // 같은 요청 반복 → 일관된 결과 (AI 다시 부르지 않음)
  const repeats: Body[] = [];
  for (let i = 0; i < 3; i++) {
    const gen = fakeGen({ items: [{ starId: homeIds[0], reason: "다른 결과" }] });
    const r = await recommend(A, { checkinId: cA }, client, gen);
    repeats.push({ body: r.body, calls: gen.calls });
  }
  check("같은 요청 3번 반복 → 3번 모두 같은 별·같은 이유", repeats.every((r) => JSON.stringify(r.body.items) === JSON.stringify(b1.items)));
  check("반복 요청은 reused=true, AI 호출 0회", repeats.every((r) => r.body.reused === true && r.calls === 0));
  check("반복 요청 usedFallback 유지", repeats.every((r) => r.body.usedFallback === b1.usedFallback));

  const cA2 = await checkin(A, "out");
  const changedChoiceGen = fakeGen({ items: [{ starId: gpsId, reason: "바깥 별이에요." }] });
  const r3 = await recommend(A, { checkinId: cA2 }, client, changedChoiceGen);
  const b3 = r3.body as Body;
  check("활동 범위가 넓어지면 범위에 맞는 기존 별 재사용", b3.reused === true && JSON.stringify(b3.items.map((i: Body) => i.starId)) === JSON.stringify(ids1));
  check("범위 변경은 현재 선택·기본 이유 반환, AI 호출 0회", b3.todayChoice === "out" && b3.usedFallback === true && changedChoiceGen.calls === 0);

  // 쉬어 가기 → 빈 추천, AI 호출·저장 없음. 오늘 추천이 이미 있어도 빈 추천
  const cArest = await checkin(A, "rest");
  const restGen = fakeGen({ items: [{ starId: homeIds[0], reason: "x" }] });
  const rRestA = await recommend(A, { checkinId: cArest }, client, restGen);
  check("쉬어 가기(추천 있던 날) → items [] + AI 호출 0", (rRestA.body as Body).items.length === 0 && restGen.calls === 0);
  const cB = await checkin(B, "rest");
  const rRestB = await recommend(B, { checkinId: cB }, client, restGen);
  const rest = rRestB.body as Body;
  console.log("쉬어 가기:", JSON.stringify(rest));
  check("쉬어 가기 → 200 { items: [], usedFallback: false, todayChoice: rest }", rRestB.status === 200 && rest.items.length === 0 && rest.usedFallback === false && rest.todayChoice === "rest");
  const storedB = await client.query("SELECT 1 FROM daily_recommendations WHERE user_id = $1", [B]);
  check("쉬어 가기는 저장하지 않음", storedB.rowCount === 0);
  // 쉬어 가기 뒤 같은 날 집 안을 고르면 그때 추천을 만든다
  const cB2 = await checkin(B, "home");
  const homeGen = fakeGen({
    items: [
      { starId: 999, reason: "없는 별" },
      { starId: nearIds[0], reason: "범위 밖 집 근처 별" },
      { starId: homeIds[1], reason: "반드시 해야 해요" },
      { starId: homeIds[1], reason: "중복" },
      { starId: homeIds[2], reason: "몸을 천천히 늘려 보는 별이에요." },
    ],
  });
  const rHome = await recommend(B, { checkinId: cB2 }, client, homeGen);
  const bh = rHome.body as Body;
  console.log("가짜 AI(후보 밖 ID 섞임):", JSON.stringify(bh));
  check("쉬어 가기 뒤 집 안 → 새 추천 생성(AI 1회)", homeGen.calls === 1 && bh.reused === false);
  check("후보 밖 ID(999, 집 안 범위 밖 집 근처 별)·중복 제거", JSON.stringify(bh.items.map((i: Body) => i.starId)) === JSON.stringify([homeIds[1], homeIds[2]]), bh.items);
  check("금지 표현 이유만 기본 이유로 교체", !/반드시/.test(bh.items[0].reason) && bh.items[1].reason === "몸을 천천히 늘려 보는 별이에요.");
  check("일부라도 유효하면 usedFallback=false", bh.usedFallback === false);

  // 모든 ID가 후보 밖 / 형식 오류 → 유효한 기본 후보
  const cC = await checkin(C, "out");
  const rAllBad = await recommend(C, { checkinId: cC }, client, fakeGen({ items: [{ starId: 999, reason: "x" }, { starId: -1, reason: "y" }] }));
  const ba = rAllBad.body as Body;
  console.log("가짜 AI(모두 후보 밖):", JSON.stringify(ba.items.map((i: Body) => [i.starId, i.reason])));
  check("모두 후보 밖 → usedFallback + 실제 후보 3개", ba.usedFallback === true && ba.items.length === 3);
  check(`out 기본 후보는 바깥(GPS ${gpsId})부터`, ba.items[0].starId === gpsId, ba.items[0]);
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [C]);
  const rInvalidRec = await recommend(C, { checkinId: cC }, client, invalidGen);
  check("형식 오류 → 같은 기본 후보", (rInvalidRec.body as Body).usedFallback === true && JSON.stringify((rInvalidRec.body as Body).items) === JSON.stringify(ba.items));

  // 바깥 추천만 저장된 날 집 안으로 바꿔도 GPS 별을 보여주거나 Gemini를 재호출하지 않는다.
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [C]);
  const outdoor = await recommend(C, { checkinId: cC }, client, changedChoiceGen);
  check("바깥 선택에 GPS 별만 저장", (outdoor.body as Body).items.map((i: Body) => i.starId).join(",") === String(gpsId));
  const cHome = await checkin(C, "home");
  const noSecondCall = fakeGen({ items: [] });
  const narrowed = (await recommend(C, { checkinId: cHome }, client, noSecondCall)).body as Body;
  check("바깥 → 집 안: 집 안 기본 후보 최대 3개, AI 재호출 없음",
    narrowed.todayChoice === "home" && narrowed.reused && narrowed.usedFallback && noSecondCall.calls === 0
    && narrowed.items.length === 3 && narrowed.items.every((i: Body) => homeIds.includes(i.starId)), narrowed);

  // 체크인 소유·입력
  const rOther = await recommend(B, { checkinId: cA }, client);
  check("다른 사용자의 체크인 → 404 (존재 여부 숨김)", rOther.status === 404 && rOther.body.code === "NOT_FOUND", rOther);
  check("없는 체크인 → 404", (await recommend(A, { checkinId: 2_000_000_000 }, client)).status === 404);
  check("checkinId 없음 → 400", (await recommend(A, {}, client)).status === 400);
  check("checkinId 문자열 → 400", (await recommend(A, { checkinId: "abc" }, client)).status === 400);
  check("DB 조회 실패 → 500 LOAD_FAILED", (await recommend(A, { checkinId: cA }, brokenDb(client, false))).body.code === "LOAD_FAILED");
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [C]);
  const rSaveFail = await recommend(C, { checkinId: cC }, brokenDb(client, true), fakeGen({ items: [{ starId: gpsId, reason: "바깥 별이에요." }] }));
  check("추천 저장 실패 → 추천은 200으로 응답", rSaveFail.status === 200 && (rSaveFail.body as Body).items.length === 1);

  // ---------- 시도 저장 (윤석 담당 범위, 기존 구현 회귀 확인) ----------
  const star = ids1[0];
  const a1 = await createAttempt(A, { starId: star, status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", verifyMethod: "self", stopReason: "tired" }, client);
  console.log("시도 dim:", a1.status, JSON.stringify(a1.body));
  check("시도 저장 201 + attemptId·starId·status·cheer·help", a1.status === 201 && ["attemptId", "starId", "status", "cheer", "help"].every((k) => k in a1.body));
  const a2 = await createAttempt(A, { starId: star, status: "bright", reflection: "오늘은 5분을 채웠어요" }, client);
  check("같은 별 두 번째 시도(bright) 201", a2.status === 201);
  check("dim은 0점, 처음 bright는 난이도×10", a1.body.pointsEarned === 0 && a1.body.totalPoints === 0
    && a2.body.pointsEarned === pointsOf(star) && a2.body.totalPoints === pointsOf(star), [a1.body.pointsEarned, a2.body.pointsEarned, pointsOf(star)]);
  check("bright + stopReason → 400", (await createAttempt(A, { starId: star, status: "bright", stopReason: "tired" }, client)).status === 400);
  check("없는 별 → 404", (await createAttempt(A, { starId: 99999, status: "dim" }, client)).status === 404);
  const failed = await createAttempt(A, { starId: 2, status: "dim", reflection: "죽고 싶다는 생각이 들었어요" }, brokenDb(client, true));
  console.log("시도 저장 실패:", failed.status, JSON.stringify(failed.body));
  check("시도 저장 실패 → 500 SAVE_FAILED + help 유지 + cheer 없음", failed.status === 500 && failed.body.code === "SAVE_FAILED" && failed.body.help !== null && !("cheer" in failed.body));
  const failedAll = await createAttempt(A, { starId: 2, status: "dim", reflection: "죽고 싶어요" }, brokenDb(client, false));
  check("DB 전체 장애 → 500 + help", failedAll.status === 500 && failedAll.body.help !== null);
  check("입력 오류 400에도 규칙 help", (await createAttempt(A, { starId: 2, status: "x", reflection: "자해를 했어요" }, client)).body.help !== null);

  // ---------- 밤하늘 (윤석 담당 범위, 기존 구현 회귀 확인) ----------
  const sky1 = (await getSky(A, client)).body as Body;
  const sky1Again = (await getSky(A, client)).body as Body; // 새로고침 = 같은 요청을 다시
  const s = sky1.stars.find((x: Body) => x.starId === star);
  check("dim 뒤 bright → 최종 bright, 기억 2개(최신순, 시도별 상태)", s.status === "bright" && s.memories.length === 2 && s.memories[0].status === "bright" && s.memories[1].status === "dim");
  check("기억에 회고 원문·날짜(YYYY-MM-DD)", s.memories[1].reflection === "현관문을 열고 잠깐 서 봤어요" && /^\d{4}-\d{2}-\d{2}$/.test(s.memories[1].date));
  check("새로고침(재조회) 결과 동일", JSON.stringify(sky1) === JSON.stringify(sky1Again));
  check("다른 사용자 밤하늘: 기록 섞이지 않음", ((await getSky(B, client)).body as Body).stars.every((x: Body) => x.status === "untried" && x.memories.length === 0));
  check("밤하늘 totalPoints·별 points (밝힌 별만 점수, 나머지 0)", sky1.totalPoints === pointsOf(star) && s.points === pointsOf(star)
    && sky1.stars.filter((x: Body) => x.starId !== star).every((x: Body) => x.points === 0), sky1.totalPoints);
  check("다른 사용자 포인트 0", ((await getSky(B, client)).body as Body).totalPoints === 0);

  // ---------- 포인트 (고민기록 #28): 별을 처음 밝힐 때만 난이도×10, 중복·dim 적립 없음 ----------
  const D = await mk("검증D");
  const earned: number[] = [];
  const brighten = async (starId: number) => {
    const r = await createAttempt(D, { starId, status: "bright" }, client, emptyGen);
    earned.push(r.body.pointsEarned as number);
    return r.body as Body;
  };
  const viewTotal = async () =>
    (await client.query<{ total_points: number; bright_stars: number }>("SELECT total_points, bright_stars FROM v_user_points WHERE user_id = $1", [D])).rows[0];
  const [h0, h1, h2] = homeIds;
  const dimOnly = await createAttempt(D, { starId: h0, status: "dim", stopReason: "tired" }, client, emptyGen);
  check("포인트 없는 사용자: dim → 0점, 뷰에 행 없음", dimOnly.body.pointsEarned === 0 && dimOnly.body.totalPoints === 0 && (await viewTotal()) === undefined);
  const p1 = await brighten(h0);
  const p2 = await brighten(h0);
  check("같은 별 다시 완료 → 0점, 총점 그대로", p1.pointsEarned === 10 && p2.pointsEarned === 0 && p2.totalPoints === 10, [p1, p2]);
  await brighten(h1);
  const p4 = await brighten(h2);
  check("1단계 별자리 완성 = 30점", p4.totalPoints === 30, p4);
  const twoStage = [...byConst.values()].find((g) => g[0].stage === 2)!;
  const fourStage = [...byConst.values()].find((g) => g[0].stage === 4)!;
  // 하위 퀘스트(더 작게 해 보기): 원래 별의 dim 시도 → 하위 퀘스트 bright(원래 별이 밝아짐) → 원래 별을 다시 완료해도 중복 없음
  // 시도 저장 API가 아직 subQuestId를 받지 않아 DB에 직접 넣는다
  const sq = (
    await client.query<{ id: number; star_id: number; title: string }>(
      "SELECT id, star_id, title FROM sub_quests WHERE star_id = ANY($1) ORDER BY id LIMIT 1",
      [twoStage.map((x) => x.id)],
    )
  ).rows[0];
  const parent = await createAttempt(D, { starId: sq.star_id, status: "dim" }, client, emptyGen);
  await client.query(
    "INSERT INTO star_attempts (user_id, star_id, parent_attempt_id, sub_quest_id, custom_title, status) VALUES ($1, $2, $3, $4, $5, 'bright')",
    [D, sq.star_id, parent.body.attemptId, sq.id, sq.title],
  );
  check("하위 퀘스트로 원래 별이 밝아지면 원래 별 점수 1번", (await viewTotal()).total_points === 30 + pointsOf(sq.star_id));
  const p3 = await brighten(sq.star_id);
  check("하위 퀘스트로 밝힌 별을 다시 완료 → 0점", p3.pointsEarned === 0 && p3.totalPoints === 30 + pointsOf(sq.star_id), p3);
  for (const x of twoStage) await brighten(x.id);
  const afterTwo = (await viewTotal()).total_points;
  for (const x of fourStage) await brighten(x.id);
  const afterFour = await viewTotal();
  check("2단계 별자리 완성 = 10·2² = 40점", afterTwo - 30 === 40, afterTwo);
  check("4단계 별자리 완성 = 10·4² = 160점", afterFour.total_points - afterTwo === 160, afterFour);
  const threeStar = seed.find((x) => x.stage === 3)!.id;
  const dim3 = await createAttempt(D, { starId: threeStar, status: "dim" }, client, emptyGen);
  const skyD = (await getSky(D, client)).body as Body;
  console.log("포인트 D:", JSON.stringify({ earned, view: afterFour, sky: skyD.totalPoints }));
  check("3단계 별 dim → 0점, 밤하늘 점수 0", dim3.body.pointsEarned === 0 && skyD.stars.find((x: Body) => x.starId === threeStar).points === 0);
  // 응답 적립 합에는 직접 넣은 하위 퀘스트 시도의 점수가 빠져 있어 더해서 비교
  check("응답 적립 합 = 뷰 총점 = 밤하늘 총점 (230점, 밝힌 별 9개)",
    earned.reduce((a, b) => a + b, 0) + pointsOf(sq.star_id) === 230 && afterFour.total_points === 230 && skyD.totalPoints === 230 && afterFour.bright_stars === 9 && dim3.body.totalPoints === 230);
  const failedBright = await createAttempt(D, { starId: threeStar, status: "bright" }, brokenDb(client, true), emptyGen);
  check("저장 실패 → pointsEarned 없음, 총점 그대로", failedBright.status === 500 && !("pointsEarned" in failedBright.body) && (await viewTotal()).total_points === 230);

  // ---------- 센터·문의 초안 (후속) ----------
  check("센터 목록(마포 예시) / 빈 결과 / region 오류", (listCenters("11440").body as Body).centers.length === 1 && (listCenters("26110").body as Body).centers.length === 0 && listCenters("abc").status === 400);
  check("센터 상세 예시 표시 / 없는 센터 404", (getCenter("9001").body as Body).center.isSample === true && getCenter("1").status === 404);
  const d1 = await createDraft(A, { centerId: 9001, question: "처음인데 예약 없이 들러도 되나요?" }, client);
  console.log("문의 초안:", d1.status, JSON.stringify(d1.body));
  check(`초안 201, usedFallback=${expectFallback}`, d1.status === 201 && (d1.body as Body).usedFallback === expectFallback);
  check("초안에 입력에 없는 숫자 없음", !/\d/.test(String((d1.body as Body).draft)));
  check("생성 직후 저장만 한 상태 (sent=false, sentAt=null)", (d1.body as Body).sent === false && (d1.body as Body).sentAt === null);
  const draftId = (d1.body as Body).draftId;
  const editedDraft = "안녕하세요. 처음 방문하려는데 예약 없이 가도 될까요?";
  const u1 = await updateDraft(A, String(draftId), { draft: editedDraft }, client);
  const relisted = ((await listDrafts(A, "9001", client)).body as Body).drafts.find((x: Body) => x.draftId === draftId);
  check("수정 → 재조회에 고친 문장, 여전히 sent=false", u1.status === 200 && relisted?.draft === editedDraft && relisted?.sent === false);
  const u2 = await updateDraft(A, String(draftId), { sent: true }, client);
  check("문의해 봤어요 → sent=true + sentAt 날짜, 문장 유지", (u2.body as Body).sent === true && /^\d{4}-\d{2}-\d{2}$/.test((u2.body as Body).sentAt) && (u2.body as Body).draft === editedDraft);
  check("남의 초안 목록에 안 보임 / 남의 초안 수정 404", ((await listDrafts(B, null, client)).body as Body).drafts.length === 0 && (await updateDraft(B, String(draftId), { sent: true }, client)).status === 404);
  check("초안 수정 저장 실패 → 500 SAVE_FAILED", (await updateDraft(A, String(draftId), { draft: "고친 문장" }, brokenDb(client, false))).body.code === "SAVE_FAILED");
  check("초안 저장 실패 → 500 + 초안 유지", (await createDraft(A, { centerId: 9001, question: "처음인데 괜찮을까요?" }, brokenDb(client, true))).body.draft !== undefined);
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
