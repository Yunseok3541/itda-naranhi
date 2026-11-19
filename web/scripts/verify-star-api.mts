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

// 쿼리를 던지는 가짜 DB (insertOnly면 INSERT만 실패)
const brokenDb = (real: Db, insertOnly: boolean): Db => ({
  query: (async (text: string, values?: unknown[]) => {
    if (!insertOnly || /^\s*INSERT/i.test(text)) throw new Error("simulated db failure");
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
  const mk = async (nick: string) =>
    (
      await client.query<{ id: number }>(
        `INSERT INTO users (nickname, start_answers, current_stage) VALUES ($1, '{"range":"near","burden":["people"],"with":"alone"}', 1) RETURNING id`,
        [nick],
      )
    ).rows[0].id;
  const A = await mk("검증A");
  const B = await mk("검증B");
  const C = await mk("검증C");
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
  // near 후보 = 2단계 비GPS(11~15) → 1단계(1~10). 실제 시드 ID 범위 안
  check("near 후보(1~15) 안의 실제 별", ids1.every((id: number) => id >= 1 && id <= 15), ids1);
  check("계약 필드 starId·title·reason", (b1.items ?? []).every((i: Body) => Number.isInteger(i.starId) && i.title && i.reason));
  check(`usedFallback=${expectFallback}`, b1.usedFallback === expectFallback, b1.usedFallback);
  check("reused=false, todayChoice=near", b1.reused === false && b1.todayChoice === "near");

  // 같은 요청 반복 → 일관된 결과 (AI 다시 부르지 않음)
  const repeats: Body[] = [];
  for (let i = 0; i < 3; i++) {
    const gen = fakeGen({ items: [{ starId: 1, reason: "다른 결과" }] });
    const r = await recommend(A, { checkinId: cA }, client, gen);
    repeats.push({ body: r.body, calls: gen.calls });
  }
  check("같은 요청 3번 반복 → 3번 모두 같은 별·같은 이유", repeats.every((r) => JSON.stringify(r.body.items) === JSON.stringify(b1.items)));
  check("반복 요청은 reused=true, AI 호출 0회", repeats.every((r) => r.body.reused === true && r.calls === 0));
  check("반복 요청 usedFallback 유지", repeats.every((r) => r.body.usedFallback === b1.usedFallback));

  const cA2 = await checkin(A, "out");
  const r3 = await recommend(A, { checkinId: cA2 }, client);
  check("같은 날 다른 체크인(바깥)도 첫 추천 재사용", (r3.body as Body).reused === true && JSON.stringify((r3.body as Body).items) === JSON.stringify(b1.items));
  check("재사용 응답의 todayChoice는 처음 기준(near)", (r3.body as Body).todayChoice === "near");

  // 쉬어 가기 → 빈 추천, AI 호출·저장 없음. 오늘 추천이 이미 있어도 빈 추천
  const cArest = await checkin(A, "rest");
  const restGen = fakeGen({ items: [{ starId: 1, reason: "x" }] });
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
      { starId: 16, reason: "범위 밖 바깥 별" },
      { starId: 2, reason: "반드시 해야 해요" },
      { starId: 2, reason: "중복" },
      { starId: 3, reason: "이불을 가볍게 정리해 보는 별이에요." },
    ],
  });
  const rHome = await recommend(B, { checkinId: cB2 }, client, homeGen);
  const bh = rHome.body as Body;
  console.log("가짜 AI(후보 밖 ID 섞임):", JSON.stringify(bh));
  check("쉬어 가기 뒤 집 안 → 새 추천 생성(AI 1회)", homeGen.calls === 1 && bh.reused === false);
  check("후보 밖 ID(999, 집 안 범위 밖 GPS 16)·중복 제거", JSON.stringify(bh.items.map((i: Body) => i.starId)) === "[2,3]", bh.items);
  check("금지 표현 이유만 기본 이유로 교체", !/반드시/.test(bh.items[0].reason) && bh.items[1].reason === "이불을 가볍게 정리해 보는 별이에요.");
  check("일부라도 유효하면 usedFallback=false", bh.usedFallback === false);

  // 모든 ID가 후보 밖 / 형식 오류 → 유효한 기본 후보
  const cC = await checkin(C, "out");
  const rAllBad = await recommend(C, { checkinId: cC }, client, fakeGen({ items: [{ starId: 999, reason: "x" }, { starId: -1, reason: "y" }] }));
  const ba = rAllBad.body as Body;
  console.log("가짜 AI(모두 후보 밖):", JSON.stringify(ba.items.map((i: Body) => [i.starId, i.reason])));
  check("모두 후보 밖 → usedFallback + 실제 후보 3개", ba.usedFallback === true && ba.items.length === 3);
  check("out 기본 후보는 바깥(GPS 16)부터", ba.items[0].starId === 16, ba.items[0]);
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [C]);
  const rInvalidRec = await recommend(C, { checkinId: cC }, client, invalidGen);
  check("형식 오류 → 같은 기본 후보", (rInvalidRec.body as Body).usedFallback === true && JSON.stringify((rInvalidRec.body as Body).items) === JSON.stringify(ba.items));

  // 체크인 소유·입력
  const rOther = await recommend(B, { checkinId: cA }, client);
  check("다른 사용자의 체크인 → 404 (존재 여부 숨김)", rOther.status === 404 && rOther.body.code === "NOT_FOUND", rOther);
  check("없는 체크인 → 404", (await recommend(A, { checkinId: 2_000_000_000 }, client)).status === 404);
  check("checkinId 없음 → 400", (await recommend(A, {}, client)).status === 400);
  check("checkinId 문자열 → 400", (await recommend(A, { checkinId: "abc" }, client)).status === 400);
  check("DB 조회 실패 → 500 LOAD_FAILED", (await recommend(A, { checkinId: cA }, brokenDb(client, false))).body.code === "LOAD_FAILED");
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [C]);
  const rSaveFail = await recommend(C, { checkinId: cC }, brokenDb(client, true), fakeGen({ items: [{ starId: 16, reason: "바깥 별이에요." }] }));
  check("추천 저장 실패 → 추천은 200으로 응답", rSaveFail.status === 200 && (rSaveFail.body as Body).items.length === 1);

  // ---------- 시도 저장 (윤석 담당 범위, 기존 구현 회귀 확인) ----------
  const star = ids1[0];
  const a1 = await createAttempt(A, { starId: star, status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", verifyMethod: "self", stopReason: "tired" }, client);
  console.log("시도 dim:", a1.status, JSON.stringify(a1.body));
  check("시도 저장 201 + attemptId·starId·status·cheer·help", a1.status === 201 && ["attemptId", "starId", "status", "cheer", "help"].every((k) => k in a1.body));
  const a2 = await createAttempt(A, { starId: star, status: "bright", reflection: "오늘은 5분을 채웠어요" }, client);
  check("같은 별 두 번째 시도(bright) 201", a2.status === 201);
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

  // ---------- 센터·문의 초안 (후속) ----------
  check("센터 목록(마포 예시) / 빈 결과 / region 오류", (listCenters("11440").body as Body).centers.length === 1 && (listCenters("26110").body as Body).centers.length === 0 && listCenters("abc").status === 400);
  check("센터 상세 예시 표시 / 없는 센터 404", (getCenter("9001").body as Body).center.isSample === true && getCenter("1").status === 404);
  const d1 = await createDraft(A, { centerId: 9001, question: "처음인데 예약 없이 들러도 되나요?" }, client);
  console.log("문의 초안:", d1.status, JSON.stringify(d1.body));
  check(`초안 201, usedFallback=${expectFallback}`, d1.status === 201 && (d1.body as Body).usedFallback === expectFallback);
  check("초안에 입력에 없는 숫자 없음", !/\d/.test(String((d1.body as Body).draft)));
  const draftId = (d1.body as Body).draftId;
  check("남의 초안 목록에 안 보임 / 남의 초안 수정 404", ((await listDrafts(B, null, client)).body as Body).drafts.length === 0 && (await updateDraft(B, String(draftId), { sent: true }, client)).status === 404);
  check("초안 저장 실패 → 500 + 초안 유지", (await createDraft(A, { centerId: 9001, question: "처음인데 괜찮을까요?" }, brokenDb(client, true))).body.draft !== undefined);
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
