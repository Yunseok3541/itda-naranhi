// 프로필 이미지 검증: 획득한 별자리 목록, 획득한 별자리만 고를 수 있음, 미획득·없는 별자리 거절 (고민기록 #33)
// 가상 사용자로 트랜잭션 안에서 실행하고 롤백 → 공용 DB에 남지 않음 (ID 시퀀스 값만 올라감)
// 실행 (web/에서, db/migrations/20261121_profile_avatar.sql이 적용된 DB):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-avatar.mts
const { db } = await import("@/lib/db");
const { getAvatar, saveAvatar } = await import("@/app/api/profile/avatar/service");
const { getSky } = await import("@/app/api/_lib/sky");
const { getCompletedConstellationIds } = await import("@/lib/constellations");
const { characters } = await import("@/app/catalog/characters");
type Db = import("@/app/api/_lib/http").Db;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}
const brokenDb: Db = { query: (async () => { throw new Error("simulated db failure"); }) as Db["query"] };

console.log(`\n== 프로필 이미지 검증 · ${new Date().toISOString()} ==\n`);

// ---------- 잘못된 요청 (DB에 닿기 전에 400) ----------
for (const bad of [null, [], {}, { constellationId: "abc" }, { constellationId: 0 }, { constellationId: -2 }, { constellationId: 1.5 }, { constellationId: true }, { avatar: "saebit" }]) {
  const r = await saveAvatar(1, bad, brokenDb);
  check(`잘못된 요청 ${JSON.stringify(bad)} → 400 INVALID`, r.status === 400 && r.body.code === "INVALID" && r.body.field === "constellationId", r);
}
check("DB 실패 → 조회 500 LOAD_FAILED", (await getAvatar(1, brokenDb)).body.code === "LOAD_FAILED");
check("DB 실패 → 변경 500 (성공으로 보내지 않음)", (await saveAvatar(1, { constellationId: 1 }, brokenDb)).status === 500);

const client = await db.connect();
try {
  await client.query("BEGIN");
  const mk = async (nick: string) =>
    (await client.query<{ id: number }>("INSERT INTO users (nickname) VALUES ($1) RETURNING id", [nick])).rows[0].id;
  const A = await mk("이미지A");
  const B = await mk("이미지B");
  const starsOf = async (constellationId: number) =>
    (await client.query<{ id: number }>("SELECT id FROM stars WHERE constellation_id = $1 ORDER BY position", [constellationId])).rows.map((r) => r.id);
  const attempt = (user: number, starId: number, status: "bright" | "dim", at = "now()") =>
    client.query(`INSERT INTO star_attempts (user_id, star_id, status, created_at) VALUES ($1, $2, $3, ${at})`, [user, starId, status]);
  const c1 = await starsOf(1);
  const c2 = await starsOf(2);
  const c3 = await starsOf(3);
  console.log(`별자리 1: 별 ${c1.length}개, 2: ${c2.length}개, 3: ${c3.length}개`);

  // ---------- 처음 ----------
  const g0 = (await getAvatar(A, client)).body as Body;
  const total = Number((await client.query("SELECT count(*) FROM constellations")).rows[0].count);
  check(`처음: 기본 캐릭터(null), 별자리 ${total}개 모두 미획득`, g0.avatarConstellationId === null && g0.constellations.length === total
    && g0.constellations.every((c: Body) => c.acquired === false && c.acquiredDate === null), g0);
  check("목록 = 도감 캐릭터 순서·이름 (화면이 constellationId로 캐릭터를 찾을 수 있음)",
    characters.every((ch) => g0.constellations.find((c: Body) => c.constellationId === ch.constellationId)?.name === ch.constellation.name), g0.constellations);

  // ---------- 획득 기준 ----------
  // 별자리 1: 마지막 별만 빼고 bright, 마지막 별은 dim → 미획득
  for (const id of c1.slice(0, -1)) await attempt(A, id, "bright", "now() - interval '2 days'");
  await attempt(A, c1[c1.length - 1], "dim");
  const g1 = (await getAvatar(A, client)).body as Body;
  check("별을 하나라도 덜 땄으면(dim은 못 딴 것) 미획득", g1.constellations.find((c: Body) => c.constellationId === 1).acquired === false, g1.constellations[0]);
  const r403 = await saveAvatar(A, { constellationId: 1 }, client);
  check("미획득 별자리로 변경 → 403 NOT_ACQUIRED, 저장 안 함", r403.status === 403 && r403.body.code === "NOT_ACQUIRED"
    && (await client.query("SELECT avatar_constellation_id FROM users WHERE id = $1", [A])).rows[0].avatar_constellation_id === null, r403.body);

  // 마지막 별까지 따면 획득. 획득 날짜 = 마지막 별을 처음 딴 날 (그 뒤 다시 따도 그대로)
  await attempt(A, c1[c1.length - 1], "bright", "now() - interval '1 day'");
  await attempt(A, c1[0], "bright"); // 다시 따기
  const g2 = (await getAvatar(A, client)).body as Body;
  const yesterday = (await client.query("SELECT to_char((now() - interval '1 day') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS d")).rows[0].d;
  const got1 = g2.constellations.find((c: Body) => c.constellationId === 1);
  check("별자리의 별을 모두 따면 획득, 획득 날짜 = 마지막 별을 처음 딴 날(한국 날짜), 다시 따도 그대로", got1.acquired === true && got1.acquiredDate === yesterday, { got1, yesterday });
  check("다른 별자리는 여전히 미획득", g2.constellations.filter((c: Body) => c.acquired).length === 1);

  // 화면의 판단(lib/constellations.ts)과 같은지: 밤하늘 응답으로 계산한 완성 별자리 = 서버 획득 목록
  for (const id of c3.slice(0, 1)) await attempt(A, id, "bright"); // 별자리 3은 일부만
  const sky = (await getSky(A, client)).body as Body;
  const fe = [...getCompletedConstellationIds(sky.stars)].sort((a, b) => a - b);
  const be = ((await getAvatar(A, client)).body as Body).constellations.filter((c: Body) => c.acquired).map((c: Body) => c.constellationId);
  check("서버 획득 목록 = 화면 getCompletedConstellationIds(밤하늘) 결과", JSON.stringify(fe) === JSON.stringify(be), { fe, be });

  // ---------- 변경 ----------
  const r1 = await saveAvatar(A, { constellationId: 1 }, client);
  check("획득한 별자리로 변경 → 200, 응답에 바뀐 값과 목록", r1.status === 200 && (r1.body as Body).avatarConstellationId === 1 && (r1.body as Body).constellations.length === total, r1.body);
  check("다시 조회해도 그대로 (서버에 저장)", ((await getAvatar(A, client)).body as Body).avatarConstellationId === 1);
  const r1s = await saveAvatar(A, { constellationId: "1" }, client);
  check("번호를 문자열로 보내도 됨", r1s.status === 200 && (r1s.body as Body).avatarConstellationId === 1, r1s.body);
  const rNot = await saveAvatar(A, { constellationId: 3 }, client);
  check("일부만 딴 별자리로 변경 → 403, 기존 이미지 유지", rNot.status === 403 && ((await getAvatar(A, client)).body as Body).avatarConstellationId === 1, rNot.body);
  const r404 = await saveAvatar(A, { constellationId: 99999 }, client);
  check("없는 별자리 → 404 NOT_FOUND", r404.status === 404 && r404.body.code === "NOT_FOUND", r404.body);
  const rNull = await saveAvatar(A, { constellationId: null }, client);
  check("null → 기본 캐릭터로 (언제든 가능)", rNull.status === 200 && (rNull.body as Body).avatarConstellationId === null, rNull.body);
  const rNoUser = await saveAvatar(2_000_000_000, { constellationId: null }, client);
  check("없는 사용자 → 404", rNoUser.status === 404 && (await getAvatar(2_000_000_000, client)).status === 404, rNoUser.body);

  // 다른 사용자가 획득한 별자리는 내 것이 아님
  for (const id of c2) await attempt(B, id, "bright");
  const rOther = await saveAvatar(A, { constellationId: 2 }, client);
  check("다른 사용자가 획득한 별자리 → 403 (획득은 사용자별)", rOther.status === 403, rOther.body);
  check("B는 자기가 획득한 별자리 2를 고를 수 있음", (await saveAvatar(B, { constellationId: 2 }, client)).status === 200);

  // 콘텐츠가 바뀌어 별자리에 별이 늘면 → 미획득이 되고, 저장된 이미지는 기본 캐릭터로 보여 줌
  await client.query("SAVEPOINT grow");
  const pos = Number((await client.query("SELECT max(position) + 1 AS p FROM stars WHERE constellation_id = 2")).rows[0].p);
  await client.query("INSERT INTO stars (constellation_id, position, title) VALUES (2, $1, '검증용 새 별')", [pos]);
  const gGrow = (await getAvatar(B, client)).body as Body;
  check("별자리에 별이 늘면 미획득, 저장된 이미지는 기본 캐릭터(null)로 응답", gGrow.avatarConstellationId === null
    && gGrow.constellations.find((c: Body) => c.constellationId === 2).acquired === false, gGrow);
  await client.query("ROLLBACK TO SAVEPOINT grow");
  check("원래대로 되돌리면 다시 별자리 2", ((await getAvatar(B, client)).body as Body).avatarConstellationId === 2);

  // DB 제약: 없는 별자리 번호는 저장 자체가 안 됨
  let fkErr = "";
  try {
    await client.query("SAVEPOINT fk");
    await client.query("UPDATE users SET avatar_constellation_id = 99999 WHERE id = $1", [A]);
  } catch (e) { fkErr = (e as { code?: string }).code ?? ""; await client.query("ROLLBACK TO SAVEPOINT fk"); }
  check("DB 외래키: 없는 별자리 번호 거절 (23503)", fkErr === "23503", fkErr);
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await db.end();
}

console.log(`\n결과: ${pass} 통과 / ${failCount} 실패`);
process.exit(failCount ? 1 : 0);
