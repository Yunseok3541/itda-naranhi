// 개인 맞춤 정책 추천 검증 (수집 정규화 · 분류 검사 · 추천 규칙 · 하루 재사용 · 클릭 기록)
// 트랜잭션 안에서 가상 정책·가상 사용자로 실행하고 롤백 → DB에 남지 않음. AI는 가짜 응답만 사용 (실제 호출 없음)
// 실행 (web/에서, 로컬 DB):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-policies.mts
process.env.GEMINI_API_KEY = ""; // 혹시 실제 generateJson이 불려도 호출하지 않게

const { db } = await import("@/lib/db");
const { normalizePolicy, upsertPolicies, pickDemoSet } = await import("@/lib/policy-sync");
const { checkClassification, actionableByRule, sourceFields, projectBeforeAi, classifyPending } = await import("@/lib/policy-classify");
const { recommendPolicies, listPolicies, recordClick, filterByDifficulty, scorePolicy } = await import("@/app/api/policies/service");
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
function fakeGen(data: unknown) {
  const fn = (async () => {
    fn.calls++;
    return { data, usedFallback: false, modelVersion: "fake", fallbackReason: null };
  }) as unknown as Gen & { calls: number };
  fn.calls = 0;
  return fn;
}
const invalidGen = (async (o: { fallback: unknown }) => ({ data: o.fallback, usedFallback: true, modelVersion: null, fallbackReason: "invalid" })) as unknown as Gen;
const brokenDb: Db = { query: (async () => { throw new Error("simulated db failure"); }) as Db["query"] };

const today = todayKst();
const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
const ymd8 = (d: string) => d.replace(/-/g, "");

// ---------- 수집 정규화 (DB 불필요) ----------
const base = {
  plcyNo: "T1", plcyNm: "가상 정책", aplyPrdSeCd: "0057002", aplyYmd: "", zipCd: "11110,11440", rgtrHghrkInstCd: "6110000",
  sprtTrgtAgeLmtYn: "N", sprtTrgtMinAge: "19", sprtTrgtMaxAge: "34", lastMdfcnDt: "2026-11-13 09:30:29", lclsfNm: "주거,주거",
  aplyUrlAddr: "", refUrlAddr1: "https://example.org/p", plcyExplnCn: "", plcyKywdNm: "", plcySprtCn: "",
};
const n1 = normalizePolicy(base, today);
check("서울 지역 코드 목록 → 서울 전체(11000), 상시, URL, 분야 중복 제거", n1?.regionCode === "11000" && n1.applyAlways && n1.url === "https://example.org/p" && n1.category === "주거", n1);
check("나이 제한 없음(N) → 나이 null", n1?.ageMin === null && n1.ageMax === null);
check("나이 제한(Y) → 19~34", normalizePolicy({ ...base, sprtTrgtAgeLmtYn: "Y" }, today)?.ageMax === 34);
check("마감 지난 정책 제외", normalizePolicy({ ...base, aplyPrdSeCd: "0057001", aplyYmd: `20260101 ~ ${ymd8(addDays(-1))}` }, today) === null);
check("마감 전 정책 → 신청 기간 저장", normalizePolicy({ ...base, aplyPrdSeCd: "0057001", aplyYmd: `20260101 ~ ${ymd8(addDays(3))}` }, today)?.applyEnd === addDays(3));
const unclear = normalizePolicy({ ...base, aplyPrdSeCd: "0057003", plcyAplyMthdCn: "온라인 신청", bizPrdEndYmd: ymd8(addDays(30)) }, today);
check("기간 구분 0057003 + 신청 방법 있음 + 사업 기간 안 끝남 → 기간 불명확으로 포함", unclear?.applyUnclear === true && unclear.applyAlways === false && unclear.applyEnd === null, unclear);
check("0057003인데 신청 방법이 없거나 사업 기간이 끝났으면 제외",
  normalizePolicy({ ...base, aplyPrdSeCd: "0057003", plcyAplyMthdCn: "" }, today) === null
  && normalizePolicy({ ...base, aplyPrdSeCd: "0057003", plcyAplyMthdCn: "온라인 신청", bizPrdEndYmd: ymd8(addDays(-1)) }, today) === null);
check("0057003 + 사업 기간 없음 → 포함", normalizePolicy({ ...base, aplyPrdSeCd: "0057003", plcyAplyMthdCn: "방문 신청", bizPrdEndYmd: "        " }, today)?.applyUnclear === true);
check("다른 지역 기관이 모든 지역 코드를 단 정책 제외", normalizePolicy({ ...base, zipCd: "11440,26110,41110", rgtrHghrkInstCd: "6300000" }, today) === null);
check("중앙부처(1)·산하기관(B) → 전국(null)", normalizePolicy({ ...base, zipCd: "11440,26110", rgtrHghrkInstCd: "1371000" }, today)?.regionCode === null
  && normalizePolicy({ ...base, zipCd: "11440,26110", rgtrHghrkInstCd: "B550000" }, today)?.regionCode === null);
check("수정 시각 → 한국 시간 ISO", n1?.sourceUpdatedAt === "2026-11-13T09:30:29+09:00");
const many = Array.from({ length: 40 }, (_, i) => ({ ...n1!, sourceId: `N${i}`, title: `가상 전국 정책 ${i}`, regionCode: null, hint: i % 5 }));
check("전국 정책 상한 없음: 지역·전국 모두 넣음 (시험용 상한을 주면 그만큼만)", pickDemoSet([...many, n1!]).length === 41 && pickDemoSet([...many, n1!], 30).length === 31);
check("이름이 같은 정책(띄어쓰기 무시)은 최근 수정된 하나만", (() => {
  const r = pickDemoSet([{ ...n1!, sourceId: "D1", title: "청년 월세", sourceUpdatedAt: "2026-01-01T00:00:00+09:00" }, { ...n1!, sourceId: "D2", title: "청년  월세", sourceUpdatedAt: "2026-02-01T00:00:00+09:00" }]);
  return r.length === 1 && r[0].sourceId === "D2";
})());

// ---------- 분류 검사 ----------
const src = "월 20만원 지원, 신청은 온라인";
check("원문에 없는 숫자가 든 요약 → 버림", checkClassification({ actionable: true, summary: "월 50만원을 지원해요.", burden: "online", difficulty: 1, difficultyNote: "x", relevance: 2, tags: [] }, src) === null);
check("원문에 있는 숫자(쉼표 무시) → 통과", checkClassification({ actionable: true, summary: "월 20만원을 지원한다.", burden: "online", difficulty: 1, difficultyNote: "x", relevance: 2, tags: [] }, src) !== null);
const floored = checkClassification({ actionable: true, summary: "상담을 받을 수 있다.", burden: "phone", difficulty: 2, difficultyNote: "", relevance: 3, tags: ["마음건강", "없는태그", "마음건강"] }, src);
check("이름 규칙: 정부 사업 → false (상담이 같이 있어도 사업 우선)", actionableByRule("청년의 삶 실태조사") === false && actionableByRule("온라인 통합 청년정책플랫폼(온통청년) 고도화") === false
  && actionableByRule("청년 마음건강 AI 시스템 등 시범 설치") === false && actionableByRule("온라인 상 자살유발정보 24시간 모니터링 및 자살예방상담지원") === false);
check("이름 규칙: 대출·보증·할인·공급·상담 → true, 해당 없음 → null(AI 판단)", actionableByRule("청년 전월세 대출보증") === true && actionableByRule("국립 문화시설 청년할인") === true
  && actionableByRule("2026 청년안심주택 공급(매입)") === true && actionableByRule("청년 창업자 세무정보 제공 및 상담") === true && actionableByRule("청년인문교실") === null);
const input = sourceFields({ id: 1, title: "가상 정책", raw: { plcyNm: "가상 정책", plcyKywdNm: "맞춤형상담서비스", mclsfNm: "취약계층 및 금융지원",
  addAplyQlfcCndCn: "서울시 거주 고립 청년", srngMthdCn: "", plcyPvsnMthdCd: "0042005", zipCd: "11440", inqCnt: "73", newTextField: "새로 생긴 한글 칸",
  sprtTrgtAgeLmtYn: "Y", sprtTrgtMinAge: "19", sprtTrgtMaxAge: "39", sprtSclCnt: "0" } });
check("AI 입력: 키워드·분류·추가 자격 조건·나이 포함, 목록에 없는 한글 칸도 포함", input["키워드"] === "맞춤형상담서비스" && input["중분류"] === "취약계층 및 금융지원"
  && input["추가_자격_조건"] === "서울시 거주 고립 청년" && input["나이"] === "19~39세" && input["newTextField"] === "새로 생긴 한글 칸", input);
check("AI 입력: 빈 칸·숫자 코드·지역 코드·조회수·지원 규모 0은 넣지 않음", !("심사_방법" in input) && !("plcyPvsnMthdCd" in input) && !("zipCd" in input) && !("inqCnt" in input) && !("지원_규모" in input), input);
check("AI 전 정부 사업 거르기: 이름 규칙, 중분류 '정책인프라구축'(서비스 말이 없을 때)",
  projectBeforeAi("청년의 삶 실태조사", {}) && projectBeforeAi("청년정책 사회보장협의제도 개선", { mclsfNm: "정책인프라구축" })
  && !projectBeforeAi("청년 전월세 대출보증", { mclsfNm: "정책인프라구축" }) && !projectBeforeAi("청년인문교실", { mclsfNm: "미래역량강화" }));
check("actionable 값이 없으면 버림", checkClassification({ summary: "요약입니다요", burden: "online", difficulty: 1, difficultyNote: "", relevance: 1, tags: [] }, src) === null);
check("전화 방식인데 난이도 2 → 최소 5로 올림, 태그 목록 밖·중복 제거, 이유 기본 문구", floored?.difficulty === 5 && JSON.stringify(floored.tags) === '["마음건강"]' && !!floored.difficultyNote, floored);
check("없는 방식·범위 밖 난이도 → 버림", checkClassification({ actionable: true, summary: "요약입니다요", burden: "mail", difficulty: 1, difficultyNote: "", relevance: 1, tags: [] }, src) === null
  && checkClassification({ actionable: true, summary: "요약입니다요", burden: "online", difficulty: 9, difficultyNote: "", relevance: 1, tags: [] }, src) === null);

// ---------- 추천 (DB, 트랜잭션 후 롤백) ----------
const client = await db.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM policy_recommendations");
  await client.query("DELETE FROM policy_events");
  await client.query("DELETE FROM policies"); // 롤백으로 되돌아감

  // 가상 정책: [키, 지역, 난이도, 방식, 관련도, 태그, 마감, 나이 상한, 분류 여부]
  const defs: [string, string | null, number, string, number, string[], string | null, number | null, boolean][] = [
    ["P1", "11000", 1, "online", 3, ["마음건강"], null, null, true],
    ["P2", "11000", 1, "online", 1, ["문화·여가"], null, null, true],
    ["P3", "11000", 2, "online", 2, ["생활비"], addDays(30), null, true],
    ["P4", "11000", 3, "visit", 3, ["주거"], null, null, true],
    ["P5", "11000", 5, "phone", 3, ["마음건강"], null, null, true],
    ["P6", "11000", 6, "group", 3, ["사람과 함께"], null, null, true],
    ["P7", "11000", 1, "online", 3, [], addDays(-1), null, true], // 마감 지남
    ["P8", "26000", 1, "online", 3, [], null, null, true], // 다른 시도
    ["P9", "11000", 1, "online", 3, [], null, 20, true], // 나이 상한 20
    ["P10", "11000", 1, "online", 3, [], null, null, false], // 분류 전
    ["P11", null, 2, "online", 0, [], null, null, true], // 전국
    ["P12", "11440", 1, "online", 2, [], null, null, true], // 마포구만
    ["P13", "11000", 1, "online", 3, [], null, null, true], // 개인이 신청할 수 없는 정부 사업 (actionable false)
  ];
  const id: Record<string, number> = {};
  for (const [k, region, stage, burden, rel, tags, end, ageMax, classified] of defs) {
    id[k] = (
      await client.query<{ id: number }>(
        `INSERT INTO policies (source, source_id, title, url, region_code, age_max, apply_end, apply_always, raw, summary, burden, stage, relevance, tags, classified_at, actionable)
         VALUES ('youth_policy', $1, $2, $11, $3, $4, $5::date, $5::date IS NULL, '{}', $12, $6, $7, $8, $9, CASE WHEN $10 THEN now() END, $13)
         RETURNING id`,
        [`verify-${k}`, `가상 정책 ${k}`, region, ageMax, end, burden, stage, rel, tags, classified,
          `https://example.org/verify-${k}`, `가상 정책 ${k} 요약`, k !== "P13"],
      )
    ).rows[0].id;
  }
  const user = async (stage: number, answers: object | null) =>
    (
      await client.query<{ id: number }>(
        "INSERT INTO users (nickname, current_stage, region_code, birth_year, start_answers) VALUES ('가상 정책 사용자', $1, '11440', $2, $3) RETURNING id",
        [stage, Number(today.slice(0, 4)) - 26, answers],
      )
    ).rows[0].id;
  const A = await user(1, { burden: ["phone"], with: "alone" });
  const B = await user(1, null);

  const all = (await listPolicies(A, client)).body as Body;
  const ids = (all.items as Body[]).map((i) => i.policyId);
  check("모든 정책: 마감·다른 시도·나이·분류 전·개인이 신청 못 하는 사업 제외", ![id.P7, id.P8, id.P9, id.P10, id.P13].some((x) => ids.includes(x)), ids);
  check("모든 정책: 서울 전체·마포구·전국 포함, 난이도 거르지 않음(6까지)", [id.P1, id.P11, id.P12, id.P6].every((x) => ids.includes(x)));
  check("모든 정책: 기준 지역 표시", all.basis?.region === "서울 마포구", all.basis);

  // AI 응답: 후보 밖 999, 금지 표현 이유, 중복, 난이도 범위 밖(P4), 정상
  const gen = fakeGen({ items: [
    { policyId: 999, reason: "없는 정책" },
    { policyId: id.P1, reason: "반드시 신청해야 해요" },
    { policyId: id.P1, reason: "중복" },
    { policyId: id.P4, reason: "범위 밖" },
    { policyId: id.P3, reason: "온라인으로 생활비 부담을 덜 수 있어요." },
  ] });
  const r1 = (await recommendPolicies(A, client, gen)).body as Body;
  const r1ids = (r1.items as Body[]).map((i) => i.policyId);
  check("1단계 사용자 → 난이도 2까지만 후보 (P4 제외)", r1.maxDifficulty === 2 && !r1ids.includes(id.P4), r1);
  check("후보 밖·중복 제거, 순서 유지 [P1, P3]", JSON.stringify(r1ids) === JSON.stringify([id.P1, id.P3]), r1ids);
  check("금지 표현 이유 → 문장 틀로 교체, 정상 이유는 그대로", !/반드시/.test(r1.items[0].reason) && r1.items[1].reason === "온라인으로 생활비 부담을 덜 수 있어요.", r1.items);
  check("응답 칸: 방식 이름·마감·범위·문의 연결 여부", r1.items[0].burdenLabel && r1.items[0].deadline === "상시 모집" && r1.items[0].scope === "서울" && r1.items[0].needsInquiry === false, r1.items[0]);
  check("AI 1회 호출, usedFallback=false", gen.calls === 1 && r1.usedFallback === false);
  const shown = (await client.query("SELECT count(*)::int AS n FROM policy_events WHERE user_id = $1 AND event = 'shown'", [A])).rows[0].n;
  check("추천한 정책 노출 기록 2건", shown === 2, shown);

  const gen2 = fakeGen({ items: [] });
  const r2 = (await recommendPolicies(A, client, gen2)).body as Body;
  check("같은 날 다시 요청 → 저장된 추천, AI 호출 0", r2.reused === true && gen2.calls === 0 && JSON.stringify((r2.items as Body[]).map((i) => i.policyId)) === JSON.stringify(r1ids));
  const shown2 = (await client.query("SELECT count(*)::int AS n FROM policy_events WHERE user_id = $1 AND event = 'shown'", [A])).rows[0].n;
  check("재사용 때는 노출 기록을 다시 쌓지 않음", shown2 === 2, shown2);

  const r3 = (await recommendPolicies(B, client, invalidGen)).body as Body;
  check("AI 실패 → 규칙 순서 상위 3개 + 문장 틀 이유, usedFallback", r3.usedFallback === true && r3.items.length === 3 && r3.items[0].policyId === id.P1 && r3.items.every((i: Body) => i.reason.length > 0), r3.items);

  // 점수: 전화가 부담인 사용자에게 전화 정책은 뒤로, 돈 때문에 멈춘 적 있으면 생활비 정책을 앞으로
  const row = (k: string) => ({ id: id[k], title: k, summary: "", burden: defs.find((d) => d[0] === k)![3], stage: defs.find((d) => d[0] === k)![2],
    difficulty_note: null, relevance: defs.find((d) => d[0] === k)![4], tags: defs.find((d) => d[0] === k)![5], url: null, apply_end: null, apply_always: true, region_code: "11000" }) as Parameters<typeof scorePolicy>[0];
  const prof: Parameters<typeof scorePolicy>[1] = { level: 1, region: "11440", age: 26, burdens: [], together: null, costStops: 0, needs: [], support: null, living: null,
    info: { job: null, school: null, married: null, income: null, special: null } };
  check("전화 부담 → 전화 정책 점수 낮아짐", scorePolicy(row("P5"), { ...prof, burdens: ["phone"] }, today) < scorePolicy(row("P5"), prof, today));
  check("혼자 하고 싶음 → 함께하는 정책 점수 낮아짐", scorePolicy(row("P6"), { ...prof, together: false }, today) < scorePolicy(row("P6"), prof, today));
  check("돈 때문에 멈춘 적 있음 → 생활비 정책 점수 높아짐", scorePolicy(row("P3"), { ...prof, costStops: 1 }, today) > scorePolicy(row("P3"), prof, today));
  const widened = filterByDifficulty([row("P1"), row("P4"), row("P5")].map((r, i) => ({ ...r, stage: [1, 3, 5][i] })), 1);
  check("후보가 3개 미만이면 3개가 될 때까지 난이도를 넓힘 (난이도 1·3·5 → 5까지)", widened.maxDifficulty === 5 && widened.rows.length === 3, widened.maxDifficulty);
  check("후보가 충분하면 넓히지 않음 (1단계 → 2까지)", filterByDifficulty([1, 1, 2, 3].map((s, i) => ({ ...row("P1"), id: i, stage: s })), 1).maxDifficulty === 2);

  const click = await recordClick(A, String(id.P1), client);
  const clicked = (await client.query("SELECT count(*)::int AS n FROM policy_events WHERE user_id = $1 AND event = 'clicked'", [A])).rows[0].n;
  check("원문 열기 기록 → url 응답 + clicked 1건", click.status === 200 && (click.body as Body).url === `https://example.org/verify-P1` && clicked === 1, click);
  check("없는 정책 404 / 잘못된 ID 400", (await recordClick(A, "999999", client)).status === 404 && (await recordClick(A, "abc", client)).status === 400);

  // 수집 저장: 같은 내용 다시 → 변화 없음, 원문 수정 시각이 바뀌면 다시 분류 대상
  const p1 = { ...n1!, sourceId: "verify-upsert" };
  const u1 = await upsertPolicies(client, [p1]);
  await client.query("UPDATE policies SET classified_at = now() WHERE source_id = 'verify-upsert'");
  const u2 = await upsertPolicies(client, [p1]);
  const keep = (await client.query("SELECT classified_at IS NOT NULL AS c FROM policies WHERE source_id = 'verify-upsert'")).rows[0].c;
  const u3 = await upsertPolicies(client, [{ ...p1, sourceUpdatedAt: "2026-11-19T10:00:00+09:00" }]);
  const reset = (await client.query("SELECT classified_at IS NULL AS c FROM policies WHERE source_id = 'verify-upsert'")).rows[0].c;
  check("수집 저장: 새 1 → 같은 내용 0/0(분류 유지) → 수정 시각 바뀜 1(분류 지움)",
    u1.inserted === 1 && u2.inserted === 0 && u2.updated === 0 && keep && u3.updated === 1 && reset, { u1, u2, u3, keep, reset });

  // 기간 불명확(0057003) 정책은 목록에 들어가고 "원문에서 확인"으로 표시
  const u = (await client.query<{ id: number }>(
    `INSERT INTO policies (source, source_id, title, region_code, apply_always, apply_unclear, raw, summary, burden, stage, relevance, tags, classified_at, actionable)
     VALUES ('youth_policy', 'verify-P15', '가상 정책 P15', '11000', false, true, '{}', '기간 불명확 요약', 'online', 1, 2, '{}', now(), true) RETURNING id`)).rows[0].id;
  const allU = (await listPolicies(A, client)).body as Body;
  const itemU = (allU.items as Body[]).find((i) => i.policyId === u);
  check("기간 불명확 정책: 목록에 포함, 마감 표시 \"신청 기간은 원문에서 확인\"", itemU?.deadline === "신청 기간은 원문에서 확인", itemU);

  // AI 전 거르기: 정부 사업은 AI 없이 actionable=false로 정리, 나머지만 AI로
  await client.query(`INSERT INTO policies (source, source_id, title, raw) VALUES ('youth_policy', 'verify-P16', '청년의 삶 실태조사', '{}')`);
  const genSkip = fakeGen({ items: [] });
  const cr = await classifyPending(client, { generate: genSkip });
  const p16 = (await client.query("SELECT actionable, classified_at IS NOT NULL AS done FROM policies WHERE source_id = 'verify-P16'")).rows[0];
  check("분류: 정부 사업 1개는 AI 없이 정리, 남은 분류 전(P10)만 AI로", cr.skipped === 1 && p16.actionable === false && p16.done && genSkip.calls === 1, { cr, p16, calls: genSkip.calls });

  check("DB 장애 → 500 LOAD_FAILED", (await recommendPolicies(A, brokenDb, fakeGen({ items: [] }))).status === 500);
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}

console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exitCode = failCount ? 1 : 0;
