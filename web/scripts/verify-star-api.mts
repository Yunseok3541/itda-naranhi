// 별 추천 → 시도 저장 → 밤하늘 재조회 흐름 검증 (가상 사용자, 트랜잭션 후 롤백 → 공용 DB에 남지 않음)
// 실행 (web/에서):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts            실제 Gemini
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --ai-fail  잘못된 키로 AI 실패 재현
// 사용자 ID는 세션 대신 인자로 넣는다 (세션 헬퍼와 무관하게 조회·저장 로직만 검증)
if (process.argv.includes("--ai-fail")) process.env.GEMINI_API_KEY = "invalid-key-for-test";

const { db } = await import("@/lib/db");
const { recommend } = await import("@/app/api/_lib/recommendations");
const { createAttempt } = await import("@/app/api/_lib/attempts");
const { getSky } = await import("@/app/api/_lib/sky");
const { createDraft, listDrafts, updateDraft } = await import("@/app/api/_lib/inquiries");
const { getCenter, listCenters } = await import("@/app/api/_lib/centers");
type Db = import("@/app/api/_lib/http").Db;
type Gen = typeof import("@/lib/gemini").generateJson;

const aiFail = process.argv.includes("--ai-fail");
let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// AI 응답을 정해 둔 값으로 바꾸는 가짜 generateJson
const fakeGen = (data: unknown): Gen =>
  (async () => ({ data, usedFallback: false, modelVersion: "fake", fallbackReason: null })) as unknown as Gen;

// 쿼리를 던지는 가짜 DB (insertOnly면 INSERT만 실패)
const brokenDb = (real: Db, insertOnly: boolean): Db => ({
  query: (async (text: string, values?: unknown[]) => {
    if (!insertOnly || /^\s*INSERT/i.test(text)) throw new Error("simulated db failure");
    return real.query(text, values);
  }) as Db["query"],
});

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
  const checkin = async (user: number, choice: string | null) =>
    (
      await client.query<{ id: number }>(
        "INSERT INTO checkins (user_id, text, weather, today_choice, risk) VALUES ($1, $2, 'partly_cloudy', $3, 'normal') RETURNING id",
        [user, "오늘은 집 근처까지는 나갈 수 있을 것 같아요.", choice],
      )
    ).rows[0].id;

  console.log(`\n== 모드: ${aiFail ? "AI 실패(잘못된 키)" : "실제 Gemini"} ==\n`);

  // ---------- 추천 ----------
  const cA = await checkin(A, "near");
  const t0 = Date.now();
  const r1 = await recommend(A, { checkinId: cA }, client);
  const b1 = r1.body as Body;
  const ids1 = (b1.items ?? []).map((i: Body) => i.starId);
  console.log("추천 1차:", r1.status, `${Date.now() - t0}ms`, JSON.stringify(b1));
  check("추천 200", r1.status === 200);
  check("추천 1~3개", ids1.length >= 1 && ids1.length <= 3, ids1);
  // near 후보 = 2단계 비GPS(11~15) → 1단계(1~10). 실제 시드 ID 범위 안
  check("추천 별이 near 후보(1~15) 안", ids1.every((id: number) => id >= 1 && id <= 15), ids1);
  check(`usedFallback=${aiFail}`, b1.usedFallback === aiFail, b1.usedFallback);
  check("reused=false", b1.reused === false);
  check("제목·이유 있음", (b1.items ?? []).every((i: Body) => i.title && i.reason));

  const t1 = Date.now();
  const r2 = await recommend(A, { checkinId: cA }, client);
  const b2 = r2.body as Body;
  const ms2 = Date.now() - t1;
  console.log("추천 재요청:", r2.status, `${ms2}ms`);
  check("재요청 reused=true", b2.reused === true);
  check("재요청 같은 별·같은 이유", JSON.stringify(b2.items) === JSON.stringify(b1.items), b2.items);
  check("재요청 usedFallback 유지", b2.usedFallback === b1.usedFallback);

  const cA2 = await checkin(A, "out");
  const r3 = await recommend(A, { checkinId: cA2 }, client);
  check("같은 날 다른 체크인도 첫 추천 재사용", (r3.body as Body).reused === true && JSON.stringify((r3.body as Body).items) === JSON.stringify(b1.items));

  const rOther = await recommend(B, { checkinId: cA }, client);
  check("남의 체크인으로 추천 → 404", rOther.status === 404, rOther);
  check("checkinId 없음 → 400", (await recommend(A, {}, client)).status === 400);
  check("checkinId 문자열 → 400", (await recommend(A, { checkinId: "abc" }, client)).status === 400);
  check("DB 조회 실패 → 500 LOAD_FAILED", (await recommend(A, { checkinId: cA }, brokenDb(client, false))).body.code === "LOAD_FAILED");

  // AI가 후보 밖 ID·중복·금지 표현을 낸 경우 (B의 첫 추천, rest)
  const cB = await checkin(B, "rest");
  const rFake = await recommend(
    B,
    { checkinId: cB },
    client,
    fakeGen({ items: [{ starId: 999, reason: "없는 별" }, { starId: 16, reason: "바깥 별" }, { starId: 2, reason: "반드시 해야 해요" }, { starId: 2, reason: "중복" }] }),
  );
  const bf = rFake.body as Body;
  console.log("가짜 AI(후보 밖 ID):", JSON.stringify(bf));
  check("후보 밖 ID(999, rest에서 GPS 16) 제거", bf.items.every((i: Body) => i.starId !== 999 && i.starId !== 16));
  check("rest는 1개", bf.items.length === 1, bf.items.length);
  check("금지 표현 이유 → 기본 이유", bf.items[0]?.starId === 2 && !/반드시/.test(bf.items[0].reason), bf.items);

  // 모든 ID가 후보 밖 → 기본 후보
  const cB2 = await checkin(B, "home");
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [B]);
  const rEmpty = await recommend(B, { checkinId: cB2 }, client, fakeGen({ items: [{ starId: 999, reason: "x" }] }));
  check("AI 결과가 모두 후보 밖 → usedFallback + 실제 후보", (rEmpty.body as Body).usedFallback === true && (rEmpty.body as Body).items.length === 3);
  await client.query("DELETE FROM daily_recommendations WHERE user_id = $1", [B]);

  // ---------- 시도 저장 ----------
  const star = ids1[0];
  const a1 = await createAttempt(A, { starId: star, status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", verifyMethod: "self", stopReason: "tired" }, client);
  console.log("시도 dim:", a1.status, JSON.stringify(a1.body));
  check("시도 저장 201", a1.status === 201);
  check("응답 필드(attemptId·starId·status·cheer·help)", ["attemptId", "starId", "status", "cheer", "help"].every((k) => k in a1.body));
  check(`응원 usedFallback=${aiFail}`, (a1.body as Body).usedFallback === aiFail);
  if (aiFail) check("AI 실패 → dim 기본 응원", (a1.body as Body).cheer === "오늘 손을 뻗어 본 순간을 이 별에 담았어요.");

  const a2 = await createAttempt(A, { starId: star, status: "bright", reflection: "오늘은 5분을 채웠어요" }, client);
  check("같은 별 두 번째 시도(bright) 201", a2.status === 201);
  const a3 = await createAttempt(A, { starId: 1, status: "bright" }, client);
  check("회고 없는 시도 → 기본 응원, AI 안 부름", a3.status === 201 && (a3.body as Body).cheer === "오늘 해낸 일을 이 별에 담았어요." && (a3.body as Body).modelVersion === null);

  check("bright + stopReason → 400", (await createAttempt(A, { starId: star, status: "bright", stopReason: "tired" }, client)).status === 400);
  check("status 오류 → 400", (await createAttempt(A, { starId: star, status: "done" }, client)).status === 400);
  check("stopReason 허용값 밖 → 400", (await createAttempt(A, { starId: star, status: "dim", stopReason: "lazy" }, client)).status === 400);
  check("verifyMethod 허용값 밖 → 400", (await createAttempt(A, { starId: star, status: "dim", verifyMethod: "nfc" }, client)).status === 400);
  check("회고 301자 → 400", (await createAttempt(A, { starId: star, status: "dim", reflection: "가".repeat(301) }, client)).status === 400);
  check("없는 별 → 404", (await createAttempt(A, { starId: 99999, status: "dim" }, client)).status === 404);

  // 가상 위기 표현
  const danger = await createAttempt(A, { starId: 2, status: "dim", reflection: "다 그만 끝내고 싶어요" }, client);
  console.log("위기 회고:", danger.status, JSON.stringify(danger.body));
  check("위기 회고 → 201 + help + 기본 응원", danger.status === 201 && (danger.body as Body).help !== null && (danger.body as Body).risk === "danger" && (danger.body as Body).cheer === "오늘 손을 뻗어 본 순간을 이 별에 담았어요.");

  // 저장 실패 + 위기 표현 → 500, help 유지, cheer 없음
  const failed = await createAttempt(A, { starId: 2, status: "dim", reflection: "죽고 싶다는 생각이 들었어요" }, brokenDb(client, true));
  console.log("저장 실패:", failed.status, JSON.stringify(failed.body));
  check("저장 실패 → 500 SAVE_FAILED", failed.status === 500 && failed.body.code === "SAVE_FAILED");
  check("저장 실패에도 help 전달", failed.body.help !== null);
  check("저장 실패에는 cheer 없음", !("cheer" in failed.body));
  const failedAll = await createAttempt(A, { starId: 2, status: "dim", reflection: "죽고 싶어요" }, brokenDb(client, false));
  check("DB 전체 장애(별 조회부터 실패) → 500 + help", failedAll.status === 500 && failedAll.body.help !== null);
  const badInput = await createAttempt(A, { starId: 2, status: "x", reflection: "자해를 했어요" }, client);
  check("400 응답에도 규칙 help", badInput.status === 400 && badInput.body.help !== null);

  // 가짜 AI: 금지 표현 응원 → 기본 문구
  const bannedCheer = await createAttempt(A, { starId: 3, status: "bright", reflection: "이불을 정리했어요" }, client, fakeGen({ cheer: "완벽해요! 반드시 매일 하세요", risk: "normal" }));
  check("금지 표현 응원 → 기본 문구", (bannedCheer.body as Body).cheer === "오늘 해낸 일을 이 별에 담았어요." && (bannedCheer.body as Body).usedFallback === true);

  // ---------- 밤하늘 ----------
  const sky1 = (await getSky(A, client)).body as Body;
  const sky1Again = (await getSky(A, client)).body as Body; // 새로고침 = 같은 요청을 다시
  const s = sky1.stars.find((x: Body) => x.starId === star);
  console.log("밤하늘 해당 별:", JSON.stringify(s));
  check("별 16개", sky1.stars.length === 16, sky1.stars.length);
  check("dim 후 bright → 최종 bright", s.status === "bright");
  check("기억 2개, 최신순, 시도별 상태 유지", s.memories.length === 2 && s.memories[0].status === "bright" && s.memories[1].status === "dim");
  check("기억에 회고 원문·날짜(YYYY-MM-DD)", s.memories[1].reflection === "현관문을 열고 잠깐 서 봤어요" && /^\d{4}-\d{2}-\d{2}$/.test(s.memories[1].date));
  check("회고 없는 시도는 reflection null", sky1.stars.find((x: Body) => x.starId === 1).memories[0].reflection === null);
  check("시도 안 한 별 untried + memories []", sky1.stars.some((x: Body) => x.status === "untried" && x.memories.length === 0 && x.attempts === 0));
  check("새로고침(재조회) 결과 동일", JSON.stringify(sky1) === JSON.stringify(sky1Again));
  check("별 상세 직접 진입용 제목", typeof s.title === "string" && s.title.length > 0);

  const skyB = (await getSky(B, client)).body as Body;
  check("다른 사용자 밤하늘: 전부 untried, 기억 없음", skyB.stars.every((x: Body) => x.status === "untried" && x.memories.length === 0));
  check("DB 장애 → 500 LOAD_FAILED", (await getSky(A, brokenDb(client, false))).body.code === "LOAD_FAILED");

  // ---------- 센터·문의 초안 ----------
  check("센터 목록(마포 예시)", (listCenters("11440").body as Body).centers.length === 1);
  check("센터 목록 빈 결과", (listCenters("26110").body as Body).centers.length === 0);
  check("센터 region 오류 → 400", listCenters("abc").status === 400);
  check("센터 상세 예시 표시", (getCenter("9001").body as Body).center.isSample === true);
  check("없는 센터 → 404", getCenter("1").status === 404);

  const d1 = await createDraft(A, { centerId: 9001, question: "처음인데 예약 없이 들러도 되나요?" }, client);
  console.log("문의 초안:", d1.status, JSON.stringify(d1.body));
  check("초안 201", d1.status === 201);
  check(`초안 usedFallback=${aiFail}`, (d1.body as Body).usedFallback === aiFail);
  check("초안에 입력에 없는 숫자 없음", !/\d/.test(String((d1.body as Body).draft)));
  const draftId = (d1.body as Body).draftId;
  check("남의 초안 목록에 안 보임", ((await listDrafts(B, null, client)).body as Body).drafts.length === 0);
  check("남의 초안 수정 → 404", (await updateDraft(B, String(draftId), { sent: true }, client)).status === 404);
  const u = await updateDraft(A, String(draftId), { draft: "안녕하세요. 처음 방문하려는데 예약 없이 가도 될까요?", sent: true }, client);
  check("내 초안 수정 + 문의해 봤어요", u.status === 200 && (u.body as Body).sentAt !== null);
  check("초안 저장 실패 → 500 + 초안 유지", (await createDraft(A, { centerId: 9001, question: "처음인데 괜찮을까요?" }, brokenDb(client, true))).body.draft !== undefined);
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
