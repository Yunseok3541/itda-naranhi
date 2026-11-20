// 포인트 검증: 유성 터치(+1, 같은 유성 중복 없음, 하루 한도) · 데일리 체크인(+100, 하루 한 번) · 별 포인트와 합산 (고민기록 #32)
// 가상 사용자로 트랜잭션 안에서 실행하고 롤백 → 공용 DB에 남지 않음 (ID 시퀀스 값만 올라감)
// 사용자 ID는 세션 대신 인자로 넣는다. AI는 부르지 않는다 (가짜 응답)
// 실행 (web/에서, db/migrations/20261121_reward_points.sql이 적용된 DB):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-points.mts
const { db } = await import("@/lib/db");
const P = await import("@/lib/points");
const { catchMeteor, awardCheckinPoints, getPoints } = await import("@/app/api/_lib/points");
const { createAttempt } = await import("@/app/api/_lib/attempts");
const { getSky } = await import("@/app/api/_lib/sky");
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
const fakeGen = (async () => ({ data: { cheer: "오늘 해낸 일을 이 별에 담았어요.", risk: "normal" }, usedFallback: false, modelVersion: "fake", fallbackReason: null })) as unknown as Gen;
const brokenDb: Db = { query: (async () => { throw new Error("simulated db failure"); }) as Db["query"] };

console.log(`\n== 포인트 검증 · ${new Date().toISOString()} ==\n`);

// ---------- 규칙 함수 (DB 불필요) ----------
const NOW = Date.UTC(2026, 10, 20, 3, 0, 5); // 한국 시간 2026-11-20 12:00:05
const cur = P.meteorIdAt(NOW);
check("유성 번호 = floor(초 / 간격)", cur === Math.floor(NOW / 1000 / P.METEOR_INTERVAL_SECONDS), cur);
check("유성 번호가 떨어지는 시각 ≤ 지금 < 다음 유성 시각", P.meteorStartsAt(cur) <= NOW && NOW < P.meteorStartsAt(cur + 1));
check("지금 유성·다음 1개는 받을 수 있음", P.isMeteorCatchable(cur, NOW) && P.isMeteorCatchable(cur + 1, NOW));
check("2개 뒤(아직 안 온 유성)는 받을 수 없음", !P.isMeteorCatchable(cur + 2, NOW));
const oldest = P.meteorIdAt(NOW - P.METEOR_GRACE_SECONDS * 1000);
check(`${P.METEOR_GRACE_SECONDS}초 전 유성까지 받고, 그보다 오래된 유성은 못 받음`, P.isMeteorCatchable(oldest, NOW) && !P.isMeteorCatchable(oldest - 1, NOW));
check("포인트 숫자: 유성 1 · 체크인 100", P.METEOR_POINTS === 1 && P.CHECKIN_POINTS === 100);
const perHour = 3600 / P.METEOR_INTERVAL_SECONDS;
check(`밸런스: 유성 하루 최대(${P.METEOR_DAILY_LIMIT * P.METEOR_POINTS}) < 체크인 하루(${P.CHECKIN_POINTS}) (한도 없으면 시간당 ${perHour})`,
  P.METEOR_DAILY_LIMIT * P.METEOR_POINTS < P.CHECKIN_POINTS);

// ---------- 잘못된 요청 (DB에 닿기 전에 400) ----------
for (const bad of [null, {}, { meteorId: "abc" }, { meteorId: -1 }, { meteorId: 0 }, { meteorId: 1.5 }, { meteorId: [cur] }]) {
  const r = await catchMeteor(1, bad, brokenDb, NOW);
  check(`잘못된 meteorId ${JSON.stringify(bad)} → 400 INVALID`, r.status === 400 && r.body.code === "INVALID", r);
}
const rBroken = await catchMeteor(1, { meteorId: cur }, brokenDb, NOW);
check("DB 실패 → 유성 500 SAVE_FAILED (성공으로 보내지 않음)", rBroken.status === 500 && rBroken.body.code === "SAVE_FAILED" && !("pointsEarned" in rBroken.body), rBroken);
const gBroken = await getPoints(1, brokenDb, NOW);
check("DB 실패 → 포인트 조회 500 LOAD_FAILED", gBroken.status === 500 && gBroken.body.code === "LOAD_FAILED", gBroken);
let threw = false;
try { await awardCheckinPoints(1, brokenDb); } catch { threw = true; }
check("DB 실패 → 체크인 포인트는 예외 (라우트가 잡아서 null로 응답)", threw);

const client = await db.connect();
try {
  await client.query("BEGIN");
  const mk = async (nick: string) =>
    (await client.query<{ id: number }>("INSERT INTO users (nickname, current_stage) VALUES ($1, 1) RETURNING id", [nick])).rows[0].id;
  const A = await mk("포인트A");
  const B = await mk("포인트B");
  const earnedA: number[] = []; // A가 응답으로 받은 포인트 (합 = 총점이어야 함)

  // ---------- 처음 ----------
  const g0 = (await getPoints(A, client, NOW)).body as Body;
  check("새 사용자 → 총 0, 출처별 0, 오늘 체크인 안 함", g0.totalPoints === 0 && g0.stars.points === 0 && g0.meteor.points === 0
    && g0.checkin.points === 0 && g0.checkin.doneToday === false && g0.meteor.caughtToday === 0, g0);
  check("유성 일정 정보 (간격·한도·현재 번호·서버 시각)", g0.meteor.intervalSeconds === P.METEOR_INTERVAL_SECONDS
    && g0.meteor.dailyLimit === P.METEOR_DAILY_LIMIT && g0.meteor.currentMeteorId === cur && g0.serverTime === new Date(NOW).toISOString()
    && Date.parse(g0.meteor.nextMeteorAt) === P.meteorStartsAt(cur + 1), g0.meteor);

  // ---------- 데일리 체크인 +100 ----------
  const c1 = await awardCheckinPoints(A, client);
  earnedA.push(c1.pointsEarned);
  check("오늘 첫 체크인 → +100, 총 100", c1.pointsEarned === 100 && c1.totalPoints === 100, c1);
  const c2 = await awardCheckinPoints(A, client);
  earnedA.push(c2.pointsEarned);
  check("같은 날 두 번째 체크인 → 0, 총 100 그대로", c2.pointsEarned === 0 && c2.totalPoints === 100, c2);
  const g1 = (await getPoints(A, client, NOW)).body as Body;
  check("조회: 체크인 100, 오늘 체크인 함", g1.checkin.points === 100 && g1.checkin.doneToday === true && g1.totalPoints === 100, g1);
  // 어제 받은 체크인 포인트가 있어도 오늘은 또 받음
  await client.query(
    `INSERT INTO point_events (user_id, source, ref_key, points, earned_date)
     VALUES ($1, 'checkin', to_char((now() AT TIME ZONE 'Asia/Seoul')::date - 1, 'YYYY-MM-DD'), 100, (now() AT TIME ZONE 'Asia/Seoul')::date - 1)`, [B]);
  const cB = await awardCheckinPoints(B, client);
  check("어제 체크인 포인트가 있어도 오늘 첫 체크인 → +100 (B 총 200)", cB.pointsEarned === 100 && cB.totalPoints === 200, cB);

  // ---------- 유성 +1 ----------
  const m1 = await catchMeteor(A, { meteorId: cur }, client, NOW);
  const b1 = m1.body as Body;
  earnedA.push(b1.pointsEarned ?? 0);
  check("유성 터치 → 201, +1, 총 101, 오늘 1개", m1.status === 201 && b1.pointsEarned === 1 && b1.reason === null
    && b1.totalPoints === 101 && b1.meteor.caughtToday === 1 && b1.meteorId === cur, b1);
  const m2 = await catchMeteor(A, { meteorId: cur }, client, NOW);
  const b2 = m2.body as Body;
  earnedA.push(b2.pointsEarned ?? 0);
  check("같은 유성 다시 → 200, 0, ALREADY_CAUGHT, 총 101", m2.status === 200 && b2.pointsEarned === 0 && b2.reason === "ALREADY_CAUGHT"
    && b2.totalPoints === 101 && b2.meteor.caughtToday === 1, b2);
  const m2s = await catchMeteor(A, { meteorId: String(cur) }, client, NOW);
  check("같은 유성을 문자열 번호로 보내도 중복 → 0", (m2s.body as Body).pointsEarned === 0 && (m2s.body as Body).reason === "ALREADY_CAUGHT", m2s.body);
  // 지난 유성을 시간이 한참 지나 다시 보내도 중복(이미 받음)으로 본다
  const m2late = await catchMeteor(A, { meteorId: cur }, client, NOW + 3600_000);
  check("받은 유성을 1시간 뒤 다시 → ALREADY_CAUGHT", (m2late.body as Body).reason === "ALREADY_CAUGHT", m2late.body);
  const mOld = await catchMeteor(A, { meteorId: oldest - 1 }, client, NOW);
  check("유예 시간 지난 유성 → 200, 0, EXPIRED", mOld.status === 200 && (mOld.body as Body).pointsEarned === 0 && (mOld.body as Body).reason === "EXPIRED", mOld.body);
  const mFuture = await catchMeteor(A, { meteorId: cur + 2 }, client, NOW);
  check("아직 안 온 유성 → EXPIRED", (mFuture.body as Body).reason === "EXPIRED" && (mFuture.body as Body).pointsEarned === 0, mFuture.body);
  const mNext = await catchMeteor(A, { meteorId: cur + 1 }, client, NOW);
  earnedA.push((mNext.body as Body).pointsEarned ?? 0);
  check("다음 유성(기기 시계가 조금 빠름) → +1, 총 102", (mNext.body as Body).pointsEarned === 1 && (mNext.body as Body).totalPoints === 102, mNext.body);
  const mB = await catchMeteor(B, { meteorId: cur }, client, NOW);
  check("다른 사용자는 같은 유성으로도 +1 (중복 판단은 사용자별)", mB.status === 201 && (mB.body as Body).pointsEarned === 1 && (mB.body as Body).totalPoints === 201, mB.body);
  let dupErr = "";
  try {
    await client.query("SAVEPOINT dup");
    await client.query("INSERT INTO point_events (user_id, source, ref_key, points) VALUES ($1, 'meteor', $2, 1)", [A, String(cur)]);
  } catch (e) { dupErr = (e as { code?: string }).code ?? ""; await client.query("ROLLBACK TO SAVEPOINT dup"); }
  check("DB도 같은 유성 중복 적립을 거절 (UNIQUE, 23505)", dupErr === "23505", dupErr);

  // ---------- 하루 한도 ----------
  // 어제 받은 유성은 오늘 한도에 세지 않음
  await client.query(
    `INSERT INTO point_events (user_id, source, ref_key, points, earned_date)
     SELECT $1, 'meteor', 'old-' || g, 1, (now() AT TIME ZONE 'Asia/Seoul')::date - 1 FROM generate_series(1, $2) g`,
    [A, P.METEOR_DAILY_LIMIT]);
  earnedA.push(P.METEOR_DAILY_LIMIT); // 어제 받은 것도 총점에는 들어감
  const todayFill = P.METEOR_DAILY_LIMIT - 2; // 오늘 이미 2개 받음 → 한도까지 채우기
  await client.query(
    `INSERT INTO point_events (user_id, source, ref_key, points) SELECT $1, 'meteor', 'fill-' || g, 1 FROM generate_series(1, $2) g`,
    [A, todayFill - 1]);
  earnedA.push(todayFill - 1);
  const mLast = await catchMeteor(A, { meteorId: cur - 1 }, client, NOW);
  earnedA.push((mLast.body as Body).pointsEarned ?? 0);
  check(`한도 직전 유성 → +1, 오늘 ${P.METEOR_DAILY_LIMIT}개 (어제 것은 세지 않음)`, (mLast.body as Body).pointsEarned === 1
    && (mLast.body as Body).meteor.caughtToday === P.METEOR_DAILY_LIMIT, mLast.body);
  const mOver = await catchMeteor(A, { meteorId: cur - 2 }, client, NOW);
  const bOver = mOver.body as Body;
  check("한도 넘은 유성 → 200, 0, DAILY_LIMIT, 기록 안 남음", mOver.status === 200 && bOver.pointsEarned === 0 && bOver.reason === "DAILY_LIMIT"
    && bOver.meteor.caughtToday === P.METEOR_DAILY_LIMIT, bOver);
  const overRow = Number((await client.query("SELECT count(*) FROM point_events WHERE user_id = $1 AND ref_key = $2", [A, String(cur - 2)])).rows[0].count);
  check("한도 넘은 유성은 적립 기록이 남지 않음", overRow === 0, overRow);

  // ---------- 별 포인트와 합산 ----------
  const star = (await client.query<{ id: number; points: number }>(
    "SELECT s.id, p.points FROM stars s JOIN v_star_points p ON p.star_id = s.id ORDER BY s.id LIMIT 1")).rows[0];
  const att = (await createAttempt(A, { starId: star.id, status: "bright", reflection: "" }, client, fakeGen)).body as Body;
  earnedA.push(att.pointsEarned ?? 0);
  const expectedTotal = earnedA.reduce((a, b) => a + b, 0);
  check(`별 처음 따기 → +${star.points}, 시도 응답 총점에 유성·체크인 포함 (${expectedTotal})`, att.pointsEarned === star.points && att.totalPoints === expectedTotal, att);

  const g2 = (await getPoints(A, client, NOW)).body as Body;
  const view = (await client.query("SELECT * FROM v_user_points WHERE user_id = $1", [A])).rows[0];
  const sky = (await getSky(A, client)).body as Body;
  const skyStarSum = (sky.stars as Body[]).reduce((s, x) => s + x.points, 0);
  console.log("A 포인트:", JSON.stringify({ total: g2.totalPoints, stars: g2.stars, meteor: g2.meteor.points, checkin: g2.checkin.points }));
  check("밸런스: 별 + 유성 + 체크인 = 총점", g2.stars.points + g2.meteor.points + g2.checkin.points === g2.totalPoints, g2);
  check("밸런스: 응답으로 받은 포인트의 합 = 총점", g2.totalPoints === expectedTotal, { got: g2.totalPoints, expectedTotal });
  check("출처별: 체크인 100 · 유성 = 오늘 한도 + 어제 한도 · 별 = 딴 별 점수",
    g2.checkin.points === 100 && g2.meteor.points === P.METEOR_DAILY_LIMIT * 2 && g2.stars.points === star.points && g2.stars.brightStars === 1, g2);
  check("뷰 v_user_points = 조회 API (총·별·유성·체크인)", view.total_points === g2.totalPoints && view.star_points === g2.stars.points
    && view.meteor_points === g2.meteor.points && view.checkin_points === g2.checkin.points && view.bright_stars === 1, view);
  check("밤하늘 totalPoints = 총점, 별 points 합 = 별 포인트", sky.totalPoints === g2.totalPoints && skyStarSum === g2.stars.points, { sky: sky.totalPoints, skyStarSum });

  // 별 없이 유성·체크인만 있는 사용자도 뷰에 행이 있음 (FULL JOIN)
  const vB = (await client.query("SELECT * FROM v_user_points WHERE user_id = $1", [B])).rows[0];
  check("별이 없는 사용자도 총점 = 유성 + 체크인 (B 201, 밝힌 별 0)", vB?.total_points === 201 && vB.bright_stars === 0 && vB.star_points === 0, vB);
  const vNone = (await client.query("SELECT * FROM v_user_points WHERE user_id = $1", [await mk("포인트없음")])).rows;
  check("포인트가 하나도 없는 사용자는 행이 없음 (0으로 처리)", vNone.length === 0, vNone);

  // 사용자를 지우면 적립 기록도 함께 지워짐
  await client.query("DELETE FROM users WHERE id = $1", [B]);
  const leftB = Number((await client.query("SELECT count(*) FROM point_events WHERE user_id = $1", [B])).rows[0].count);
  check("사용자 삭제 → 적립 기록도 삭제 (ON DELETE CASCADE)", leftB === 0, leftB);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await db.end();
}

console.log(`\n결과: ${pass} 통과 / ${failCount} 실패`);
process.exit(failCount ? 1 : 0);
