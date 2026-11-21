// 마음 짚기 검증 (점수 계산 · 입력 검사 · 비교 문장 · 저장/조회 API 서비스)
// 트랜잭션 안에서 가상 사용자로 실행하고 롤백 → DB에 남지 않음. AI는 쓰지 않음
// 실행 (web/에서, 로컬 DB. 변경 SQL db/migrations/20261124_mind_check.sql 적용 후):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-mind-check.mts
// 다른 DB 연결로 돌리려면 run(db)를 import해서 부름 (BEGIN/ROLLBACK은 부르는 쪽 책임)
import type { Db } from "../src/app/api/_lib/http";

const { buildMindResult, compareMind, emptyAnswers, nextMindCheckDate, parseMindAnswers, scoreMind, WHO5_LOW } = await import("../src/lib/mind-check");
const { getMindCheck, saveMindCheck } = await import("../src/app/api/mind-check/service");

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run(db: Db) {
  let pass = 0, failCount = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    if (cond) pass++; else failCount++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
  };

  // ---------- 계산 (DB 불필요) ----------
  const full = { ucla: [2, 2, 3], lsns: [2, 1, 1, 3, 1, 0], who5: [2, 2, 1, 1, 3] };
  check("점수: 묶음 합계 (UCLA 7, LSNS 8, WHO-5 9)", JSON.stringify(scoreMind(full)) === '{"ucla":7,"lsns":8,"who5":9}', scoreMind(full));
  const partial = { ...emptyAnswers(), ucla: [1, 1, 1], lsns: [2, null, 1, 3, 1, 0] };
  check("점수: 하나라도 비운 묶음은 null", JSON.stringify(scoreMind(partial)) === '{"ucla":3,"lsns":null,"who5":null}', scoreMind(partial));
  check("입력: 한 묶음만 다 답해도 됨, 빠진 묶음 키는 모두 비움", (() => {
    const r = parseMindAnswers({ who5: [5, 5, 5, 5, 5] });
    return "value" in r && r.value.ucla.length === 3 && r.value.ucla.every(v => v === null) && r.value.lsns.length === 6;
  })());
  check("입력: 다 답한 묶음이 없으면 answers", JSON.stringify(parseMindAnswers(partial.lsns ? { lsns: partial.lsns } : {})) === '{"invalid":"answers"}');
  check("입력: 선택지에 없는 값 → 그 칸 이름 (UCLA 0점 없음)", JSON.stringify(parseMindAnswers({ ucla: [0, 1, 1] })) === '{"invalid":"answers.ucla"}');
  check("입력: 문항 수가 다르면 그 칸 이름", JSON.stringify(parseMindAnswers({ who5: [1, 1, 1] })) === '{"invalid":"answers.who5"}');
  check("입력: 객체가 아니면 answers", JSON.stringify(parseMindAnswers([1, 2])) === '{"invalid":"answers"}' && JSON.stringify(parseMindAnswers(null)) === '{"invalid":"answers"}');

  const ch = compareMind({ ucla: 5, lsns: 12, who5: 14 }, { ucla: 7, lsns: 11, who5: 10 });
  check("비교: UCLA는 낮아지면 좋아짐, LSNS 1점 차이는 비슷함, WHO-5 4점 오르면 좋아짐",
    ch.map(c => `${c.scale}:${c.trend}`).join(",") === "ucla:better,lsns:same,who5:better", ch);
  const ch2 = compareMind({ ucla: 8, lsns: 6, who5: null }, { ucla: 7, lsns: 9, who5: 12 });
  check("비교: 나빠짐 문장, 한쪽이라도 비운 묶음은 비교하지 않음",
    ch2.map(c => `${c.scale}:${c.trend}`).join(",") === "ucla:worse,lsns:worse" && ch2[1].text.includes("조금 줄었어요"), ch2);
  check("비교: 문장에 점수 숫자가 없음 (\"지난 2주\" 빼고)", [...ch, ...ch2].every(c => !/\d/.test(c.text.replace("지난 2주", ""))));
  check("다음 날짜: 28일 뒤 (한국 날짜)", nextMindCheckDate("2026-11-21T15:30:00Z") === "2026-12-20", nextMindCheckDate("2026-11-21T15:30:00Z"));
  check("WHO-5 낮음 기준: 12점이면 안내, 13점이면 안내 없음",
    buildMindResult({ checkedAt: "2026-11-21T00:00:00Z", scores: { ucla: null, lsns: null, who5: WHO5_LOW - 1 } }, null).lowWellbeing
    && !buildMindResult({ checkedAt: "2026-11-21T00:00:00Z", scores: { ucla: null, lsns: null, who5: WHO5_LOW } }, null).lowWellbeing);

  // ---------- 저장·조회 (DB) ----------
  const userId = (await db.query<{ id: number }>("INSERT INTO users (nickname) VALUES ('마음 짚기 검증') RETURNING id")).rows[0].id;
  const empty = await getMindCheck(userId, db);
  check("조회: 처음에는 latest null", empty.status === 200 && (empty.body as Body).latest === null, empty);

  const bad = await saveMindCheck(userId, { answers: { ucla: [1, 9, 1] } }, db);
  check("저장: 틀린 값 400 INVALID + field", bad.status === 400 && (bad.body as Body).code === "INVALID" && (bad.body as Body).field === "answers.ucla", bad);
  const none = await saveMindCheck(userId, { answers: {} }, db);
  check("저장: 아무 묶음도 다 답하지 않으면 400", none.status === 400 && (none.body as Body).field === "answers", none);
  check("저장: 본문이 없어도 400 (500 아님)", (await saveMindCheck(userId, null, db)).status === 400);

  const first = await saveMindCheck(userId, { answers: full }, db);
  const f = (first.body as Body).latest;
  check("첫 저장: 201, 비교 없음(null), WHO-5 9점 → 안내", first.status === 201 && f.changes === null && f.lowWellbeing === true
    && f.scores.ucla === 7 && f.scores.lsns === 8 && f.scores.who5 === 9, first);
  const row = (await db.query<Body>("SELECT answers, ucla_score, lsns_score, who5_score, spin_score FROM survey_results WHERE user_id = $1", [userId])).rows;
  check("DB: 한 줄, 답 그대로 + 점수 칸, spin_score는 비움", row.length === 1 && row[0].lsns_score === 8 && row[0].spin_score === null
    && JSON.stringify(row[0].answers.lsns) === "[2,1,1,3,1,0]", row);

  // 두 번째: 외로움 줄고(7→4) 사람 늘고(8→14) WHO-5는 건너뜀
  await db.query("UPDATE survey_results SET created_at = now() - interval '29 days' WHERE user_id = $1", [userId]);
  const second = await saveMindCheck(userId, { answers: { ucla: [1, 2, 1], lsns: [3, 2, 2, 3, 2, 2] } }, db);
  const s2 = (second.body as Body).latest;
  check("두 번째: 지난번과 비교 (외로움 줄고 사람 늘었음, WHO-5는 건너뛰어 비교 안 함), 안내 없음",
    second.status === 201 && s2.changes.map((c: Body) => `${c.scale}:${c.trend}`).join(",") === "ucla:better,lsns:better" && s2.lowWellbeing === false, s2);
  const got = await getMindCheck(userId, db);
  check("조회: 최근 결과가 저장 응답과 같음", JSON.stringify((got.body as Body).latest) === JSON.stringify(s2), got);

  // 예전 실제 설문은 UCLA와 Mini-SPIN 점수를 함께 저장했으며 비교 대상에서 빠진다.
  const other = (await db.query<{ id: number }>("INSERT INTO users (nickname) VALUES ('예전 기록') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO survey_results (user_id, answers, ucla_score, spin_score, created_at) VALUES ($1, '{\"ucla\":[1,1,1],\"spin\":[1,1,1]}', 3, 3, now() - interval '40 days')", [other]);
  check("예전 UCLA·Mini-SPIN 설문만 있는 사용자: 처음과 같음", ((await getMindCheck(other, db)).body as Body).latest === null);
  const after = await saveMindCheck(other, { answers: { who5: [3, 3, 3, 3, 3] } }, db);
  check("예전 기록 뒤 첫 저장: 비교 없음(null)", (after.body as Body).latest.changes === null, after);
  check("다른 사용자 기록은 섞이지 않음", ((await getMindCheck(userId, db)).body as Body).latest.scores.who5 === null);

  console.log(`\n${pass} passed, ${failCount} failed`);
  return failCount;
}

// 직접 실행: DATABASE_URL의 DB에서 트랜잭션 → 롤백
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/verify-mind-check.mts")) {
  const { db: pool } = await import("../src/lib/db");
  const client = await pool.connect();
  let failed = 1;
  try {
    await client.query("BEGIN");
    failed = await run(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
  process.exit(failed ? 1 : 0);
}
