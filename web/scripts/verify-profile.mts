// 프로필 고도화 검증 (시작 질문 ④~⑥ · 정책 신청 정보 · 자격 조건 규칙 · 추천 반영)
// 트랜잭션 안에서 가상 사용자·가상 정책으로 실행하고 롤백 → DB에 남지 않음. AI는 가짜 응답만 사용 (실제 호출 없음)
// 실행 (web/에서, 로컬 DB):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-profile.mts
process.env.GEMINI_API_KEY = "";

const { db } = await import("@/lib/db");
const { parseStartAnswers, parsePolicyInfo, parseBirthYear, readStartAnswers, EMPTY_POLICY_INFO, EMPTY_START } = await import("@/lib/profile");
const { checkEligibility } = await import("@/lib/policy-eligibility");
const { getProfile, saveProfile } = await import("@/app/api/profile/service");
const { recommendPolicies, listPolicies, scorePolicy } = await import("@/app/api/policies/service");
const { todayKst } = await import("@/app/api/_lib/http");
type Gen = typeof import("@/lib/gemini").generateJson;
type Cond = import("@/lib/policy-eligibility").PolicyConditions;
type Info = import("@/lib/profile").PolicyInfo;
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
const today = todayKst();
const year = Number(today.slice(0, 4));

// ---------- 입력 검사 (DB 불필요) ----------
const s1 = parseStartAnswers({ range: "near", burden: ["phone", "people", "phone"], needs: ["health"], support: "no" });
check("시작 질문: 빠진 키는 답하지 않음(null), 여러 개는 목록 순서로·중복 제거", "value" in s1 && s1.value.with === null && s1.value.living === null
  && JSON.stringify(s1.value.burden) === '["people","phone"]', s1);
check("시작 질문: 선택지에 없는 값 → 그 칸 이름", JSON.stringify(parseStartAnswers({ living: "dorm" })) === '{"invalid":"startAnswers.living"}');
check("시작 질문: 빈 문자열은 답하지 않음", "value" in parseStartAnswers({ range: "" }));
check("정책 정보: 틀린 값 → 칸 이름", JSON.stringify(parsePolicyInfo({ income: "rich" })) === '{"invalid":"policyInfo.income"}');
check("정책 정보: 해당 없음([])과 답하지 않음(null) 구분", (() => {
  const a = parsePolicyInfo({ special: [] });
  const b = parsePolicyInfo({});
  return "value" in a && "value" in b && Array.isArray(a.value.special) && a.value.special.length === 0 && b.value.special === null;
})());
check("출생연도: 15~45세 범위만, 문자열 숫자 허용, 빈 값은 null", parseBirthYear(String(year - 26), year) === year - 26 && parseBirthYear(year - 5, year) === undefined
  && parseBirthYear(1900, year) === undefined && parseBirthYear("", year) === null);
check("저장된 값 읽기: 모르는 값은 답하지 않음으로 (예전 형식 {range,burden,with}도 그대로)", (() => {
  const r = readStartAnswers({ range: "home", burden: ["people", "x"], with: "alone", extra: 1 });
  return r.range === "home" && r.burden === null && r.with === "alone" && r.needs === null;
})());

// ---------- 자격 조건 규칙 (DB 불필요) ----------
const none: Cond = { job_cd: "0013010", school_cd: "0049010", mrg_cd: "0055003", sbiz_cd: "0014010", earn_cd: "0043001", earn_max: "0", earn_etc: "", add_cond: "" };
const info = (o: Partial<Info>): Info => ({ ...EMPTY_POLICY_INFO, ...o });
const e0 = checkEligibility(none, info({ job: "employed" }));
check("제한 없음 코드 → 조건 없음", e0.mismatch.length === 0 && e0.toCheck.length === 0, e0);
const startup: Cond = { ...none, job_cd: "0013006" };
check("창업자 대상 + 일하지 않음 → 맞지 않음", checkEligibility(startup, info({ job: "unemployed" })).mismatch[0] === "취업 상태: (예비)창업자");
check("창업자 대상 + 창업 → 조건 통과", checkEligibility(startup, info({ job: "founder" })).mismatch.length === 0 && checkEligibility(startup, info({ job: "founder" })).toCheck.length === 0);
check("창업자 대상 + 답하지 않음 → 확인할 조건", checkEligibility(startup, info({})).toCheck[0] === "취업 상태: (예비)창업자");
check("창업자 대상 + '그 밖에' → 판단하지 않고 확인할 조건", checkEligibility(startup, info({ job: "other" })).toCheck.length === 1);
const etcJob: Cond = { ...none, job_cd: "0013001,0013009" };
check("재직자·기타 대상 + 일하지 않음 → 빼지 않고 확인할 조건 (기타가 섞이면 단정하지 않음)", (() => {
  const e = checkEligibility(etcJob, info({ job: "unemployed" }));
  return e.mismatch.length === 0 && e.toCheck[0] === "취업 상태: 재직자·기타";
})());
check("재직자·기타 대상 + 재직 → 조건 통과", checkEligibility(etcJob, info({ job: "employed" })).toCheck.length === 0);
check("학력: 대학 재학·기타 대상 + 고교 졸업 → 확인할 조건 / 대학 재학 → 통과", checkEligibility({ ...none, school_cd: "0049005,0049009" }, info({ school: "high_grad" })).toCheck.length === 1
  && checkEligibility({ ...none, school_cd: "0049005,0049009" }, info({ school: "college_student" })).toCheck.length === 0);
check("결혼: 기혼만 + 미혼 → 맞지 않음 / 답하지 않음 → 확인", checkEligibility({ ...none, mrg_cd: "0055001" }, info({ married: "single" })).mismatch[0] === "결혼: 기혼"
  && checkEligibility({ ...none, mrg_cd: "0055001" }, info({})).toCheck[0] === "결혼: 기혼");
const singleParent: Cond = { ...none, sbiz_cd: "0014004" };
check("한부모 대상: 해당 없음([]) → 맞지 않음 / 답하지 않음(null) → 확인 / 한부모 → 통과",
  checkEligibility(singleParent, info({ special: [] })).mismatch.length === 1 && checkEligibility(singleParent, info({})).toCheck.length === 1
  && checkEligibility(singleParent, info({ special: ["single_parent"] })).toCheck.length === 0);
check("특화 '기타' → 확인할 조건만 (판단 안 함)", (() => {
  const e = checkEligibility({ ...none, sbiz_cd: "0014009" }, info({ special: [] }));
  return e.mismatch.length === 0 && e.toCheck[0] === "대상: 기타";
})());
const income5000: Cond = { ...none, earn_cd: "0043002", earn_max: "5000" };
check("연소득 5,000만 원 이하: 5천~7천 → 맞지 않음 / 3천~5천 → 통과 / 답하지 않음 → 확인",
  checkEligibility(income5000, info({ income: "5000_7000" })).mismatch[0] === "연소득 5,000만 원 이하"
  && checkEligibility(income5000, info({ income: "3000_5000" })).toCheck.length === 0
  && checkEligibility(income5000, info({})).toCheck[0] === "연소득 5,000만 원 이하");
check("소득 문장 조건(중위소득) → 소득을 답해도 확인할 조건 / '무관'은 조건 아님",
  checkEligibility({ ...none, earn_cd: "0043003", earn_etc: "기준 중위소득 150% 이하" }, info({ income: "under_2000" })).toCheck[0] === "소득: 기준 중위소득 150% 이하"
  && checkEligibility({ ...none, earn_cd: "0043003", earn_etc: "무관" }, info({})).toCheck.length === 0);
check("추가 조건 문장은 줄여서 확인할 조건으로", (checkEligibility({ ...none, add_cond: "가".repeat(100) }, info({})).toCheck[0] ?? "").endsWith("…"));

// ---------- 저장·추천 (DB, 트랜잭션 후 롤백) ----------
const client = await db.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM policy_recommendations");
  await client.query("DELETE FROM policy_events");
  await client.query("DELETE FROM policies");
  const userId = (await client.query<{ id: number }>("INSERT INTO users (nickname, region_code) VALUES ('가상 프로필 사용자', '11440') RETURNING id")).rows[0].id;

  const g0 = (await getProfile(userId, client)).body as Body;
  check("처음: 시작 질문 null, 정책 정보 모두 null, 단계 1", g0.startAnswers === null && g0.policyInfo.job === null && g0.currentStage === 1, g0);

  const p1 = await saveProfile(userId, { startAnswers: { range: "out", burden: ["phone"], needs: ["money_job"], living: "alone" } }, client);
  const b1 = p1.body as Body;
  check("시작 질문 저장 → 활동 범위 '혼자 외출'이면 시작 단계 3", p1.status === 200 && b1.currentStage === 3 && b1.startAnswers.needs[0] === "money_job", b1);
  const typeCols = (await client.query("SELECT start_answers::text AS t FROM users WHERE id = $1", [userId])).rows[0].t as string;
  check("DB에는 답만 있고 유형 이름은 없음", !/형"|type|isolat|reclus/i.test(typeCols), typeCols);

  const p2 = await saveProfile(userId, { policyInfo: { job: "unemployed", income: "under_2000", special: [] }, birthYear: year - 26 }, client);
  check("정책 정보만 보내면 시작 질문은 그대로", p2.status === 200 && (p2.body as Body).startAnswers.range === "out" && (p2.body as Body).birthYear === year - 26, p2.body);
  check("틀린 값 → 400 + 칸 이름, 저장 안 함", (await saveProfile(userId, { policyInfo: { job: "ceo" } }, client)).body.field === "policyInfo.job"
    && ((await getProfile(userId, client)).body as Body).policyInfo.job === "unemployed");
  check("빈 본문·모르는 칸만 → 400", (await saveProfile(userId, {}, client)).status === 400 && (await saveProfile(userId, null, client)).status === 400);
  check("출생연도 범위 밖 → 400", (await saveProfile(userId, { birthYear: year - 3 }, client)).status === 400);
  const emptied = await saveProfile(userId, { policyInfo: { job: null } }, client);
  const raw = (await client.query("SELECT policy_info FROM users WHERE id = $1", [userId])).rows[0].policy_info;
  check("정책 정보를 모두 비우면 DB에 NULL (지우기)", emptied.status === 200 && raw === null, raw);
  await saveProfile(userId, { policyInfo: { job: "unemployed", income: "5000_7000", special: [] } }, client);
  check("policyInfo: null → 지우기", (await saveProfile(userId, { policyInfo: null }, client)).status === 200
    && (await client.query("SELECT policy_info FROM users WHERE id = $1", [userId])).rows[0].policy_info === null);
  check("없는 사용자 → 404", (await saveProfile(2_000_000_000, { birthYear: null }, client)).status === 404);

  // ---------- 데모 시작 질문 ①~③ (질문별 페이지 화면, 고민기록 #40) ----------
  // 화면은 세션이 생기기 전에 답을 모으고, "데모 시작" 뒤 PUT /api/profile { startAnswers } 한 번으로 저장한다 (단계별 임시 저장 없음)
  const newUser = async () => (await client.query<{ id: number }>("INSERT INTO users (nickname, region_code) VALUES ('가상 온보딩', '11440') RETURNING id")).rows[0].id;
  const stageOf: Record<string, number> = { home: 1, near: 2, out: 3, people: 4 };
  for (const [range, stage] of Object.entries(stageOf)) {
    const u = await newUser();
    const r = (await saveProfile(u, { startAnswers: { range, burden: ["unfamiliar"], with: "alone" } }, client)).body as Body;
    check(`① 활동 범위 ${range} → 시작 단계 ${stage}, ②·③ 그대로 저장`, r.currentStage === stage && r.startAnswers.range === range
      && r.startAnswers.burden[0] === "unfamiliar" && r.startAnswers.with === "alone", r);
  }
  const uFull = await newUser();
  const uThree = await newUser();
  const three = { range: "near", burden: ["people", "phone"], with: "together" };
  const bFull = (await saveProfile(uFull, { startAnswers: { ...EMPTY_START, ...three } }, client)).body as Body; // 지금 화면: 6칸 모두(④~⑥ null)
  const bThree = (await saveProfile(uThree, { startAnswers: three }, client)).body as Body;                    // ①~③만
  check("①~③만 보내도 6칸 모두 보낸 것과 같은 결과 (빠진 ④~⑥ = 답하지 않음)", JSON.stringify(bFull) === JSON.stringify(bThree) && bThree.startAnswers.support === null, { bFull, bThree });
  const uDup = await newUser();
  const bDup = (await saveProfile(uDup, { startAnswers: { burden: ["phone", "people", "phone"] } }, client)).body as Body;
  check("② 여러 개 선택: 목록 순서로 정리·중복 제거", JSON.stringify(bDup.startAnswers.burden) === '["people","phone"]', bDup.startAnswers);
  const uSkip = await newUser();
  const bSkip = (await saveProfile(uSkip, { startAnswers: {} }, client)).body as Body;
  check("모두 건너뛰고 저장 → 답 없음(모두 null)이지만 '시작 질문을 거침'(null 아님), 단계 1", bSkip.startAnswers !== null
    && Object.values(bSkip.startAnswers).every((v) => v === null) && bSkip.currentStage === 1, bSkip);
  const uBad = await newUser();
  const rBad = await saveProfile(uBad, { startAnswers: { range: "home", with: "both" } }, client);
  check("선택지에 없는 답 → 400 + 칸 이름, 아무것도 저장 안 함", rBad.status === 400 && rBad.body.field === "startAnswers.with"
    && ((await getProfile(uBad, client)).body as Body).startAnswers === null, rBad.body);
  const uRedo = await newUser();
  await saveProfile(uRedo, { startAnswers: { range: "out", support: "yes", living: "alone", needs: ["health"] } }, client); // 내 정보에서 ④~⑥까지 답함
  const bRedo = (await saveProfile(uRedo, { startAnswers: three }, client)).body as Body;                               // 다시 첫 화면에서 ①~③만
  check("⚠ 현재 계약: 시작 질문은 통째로 바뀜 → 이미 답한 ④~⑥ 위에 ①~③만 보내면 ④~⑥이 지워짐", bRedo.startAnswers.support === null
    && bRedo.startAnswers.needs === null && bRedo.currentStage === 2, bRedo.startAnswers);
  const bNoRange = (await saveProfile(uRedo, { startAnswers: { range: null, burden: ["morning"] } }, client)).body as Body;
  check("① 활동 범위를 비우면 시작 단계는 그대로 (다시 1로 내리지 않음)", bNoRange.startAnswers.range === null && bNoRange.currentStage === 2, bNoRange);

  // 가상 정책: 조건 없음 2개, 창업자 대상, 연소득 5천 이하, 생활비 태그
  const mk = async (key: string, raw: object, tags: string[], relevance = 2) =>
    (await client.query<{ id: number }>(
      `INSERT INTO policies (source, source_id, title, url, region_code, apply_always, raw, summary, burden, stage, relevance, tags, classified_at, actionable)
       VALUES ('youth_policy', $1, $2, 'https://example.org/p', '11000', true, $3, $4, 'online', 1, $5, $6, now(), true) RETURNING id`,
      [`profile-${key}`, `가상 정책 ${key}`, JSON.stringify(raw), `가상 정책 ${key} 요약`, relevance, tags],
    )).rows[0].id;
  const free = { jobCd: "0013010", schoolCd: "0049010", mrgSttsCd: "0055003", sbizCd: "0014010", earnCndSeCd: "0043001" };
  const id = {
    plain: await mk("plain", free, ["문화·여가"], 3),
    founder: await mk("founder", { ...free, jobCd: "0013006" }, ["일자리"], 3),
    income: await mk("income", { ...free, earnCndSeCd: "0043002", earnMaxAmt: "5000" }, ["주거"], 3),
    money: await mk("money", { ...free, earnCndSeCd: "0043003", earnEtcCn: "기준 중위소득 150% 이하" }, ["생활비"], 2),
  };

  // 답하지 않은 사용자: 아무것도 빼지 않고 확인할 조건만
  const anon = (await client.query<{ id: number }>("INSERT INTO users (nickname, region_code) VALUES ('가상', '11440') RETURNING id")).rows[0].id;
  const rA = (await recommendPolicies(anon, client, fakeGen({ items: [] }))).body as Body;
  const rAids = (rA.items as Body[]).map((i) => i.policyId);
  check("정책 정보가 없으면 자격으로 빼지 않음 (창업자·소득 정책도 후보)", rAids.includes(id.founder) && rAids.includes(id.income), rAids);
  const founderItem = (rA.items as Body[]).find((i) => i.policyId === id.founder);
  check("답하지 않은 조건 → conditionsToCheck에 표시, mayNotFit 비어 있음", founderItem?.conditionsToCheck?.[0] === "취업 상태: (예비)창업자" && founderItem?.mayNotFit.length === 0, founderItem);

  // 일하지 않음 + 연소득 5천~7천 → 창업자·연소득 정책은 추천에서 빠짐
  await saveProfile(userId, { policyInfo: { job: "unemployed", income: "5000_7000", special: [] } }, client);
  const gen = fakeGen({ items: [{ policyId: id.founder, reason: "후보 밖이어야 함" }, { policyId: id.money, reason: "생활비 부담을 덜 수 있어요." }] });
  const r1 = (await recommendPolicies(userId, client, gen)).body as Body;
  const r1ids = (r1.items as Body[]).map((i) => i.policyId);
  check("확실히 맞지 않는 정책(창업자 대상·연소득 초과)은 추천 후보에서 빠짐", !r1ids.includes(id.founder) && !r1ids.includes(id.income) && r1ids[0] === id.money, r1ids);
  const moneyItem = (r1.items as Body[]).find((i) => i.policyId === id.money);
  check("중위소득 문장 조건은 소득을 답해도 확인할 조건으로 남음", moneyItem?.conditionsToCheck?.[0] === "소득: 기준 중위소득 150% 이하", moneyItem);

  const all = (await listPolicies(userId, client)).body as Body;
  const allFounder = (all.items as Body[]).find((i) => i.policyId === id.founder);
  check("모든 정책 보기: 맞지 않아도 숨기지 않고 mayNotFit 표시", !!allFounder && allFounder.mayNotFit[0] === "취업 상태: (예비)창업자", allFounder);

  // 같은 날 정보를 바꾸면: 저장된 추천을 재사용하되 이제 맞지 않는 정책은 뺌 (AI 다시 안 부름)
  await saveProfile(userId, { policyInfo: { job: "unemployed", income: "5000_7000", special: [] } }, client);
  await client.query("UPDATE policies SET raw = raw || '{\"earnCndSeCd\":\"0043002\",\"earnMaxAmt\":\"3000\",\"earnEtcCn\":\"\"}' WHERE id = $1", [id.money]);
  const gen2 = fakeGen({ items: [] });
  const r2 = (await recommendPolicies(userId, client, gen2)).body as Body;
  check("재사용 시 맞지 않게 된 정책은 빼고 AI 호출 0", r2.reused === true && gen2.calls === 0 && !(r2.items as Body[]).some((i) => i.policyId === id.money), r2.items);

  // 추천 기준을 실제로 바꾸면 오늘 저장된 추천을 지우고 새 기준으로 다시 만듦 (FE_QA, 고민기록 #51)
  const savedRows = async () => Number((await client.query<{ n: string }>(
    "SELECT count(*) AS n FROM policy_recommendations WHERE user_id = $1 AND rec_date = $2::date", [userId, today])).rows[0].n);
  const before = await savedRows();
  await saveProfile(userId, { policyInfo: { job: "unemployed", income: "under_2000", special: [] } }, client);
  const afterChange = await savedRows();
  const gen3 = fakeGen({ items: [{ policyId: id.income, reason: "소득 조건이 맞아요." }] });
  const r3 = (await recommendPolicies(userId, client, gen3)).body as Body;
  check("기준(소득)을 바꾸면 오늘 추천을 지우고 다음 조회 때 새로 만듦", before === 1 && afterChange === 0 && r3.reused !== true && gen3.calls === 1, { before, afterChange, reused: r3.reused, calls: gen3.calls });
  await saveProfile(userId, { birthYear: year - 26 }, client); // 지금과 같은 출생연도
  check("같은 값으로 다시 저장하면 오늘 추천은 그대로", (await savedRows()) === 1);
  await saveProfile(userId, { startAnswers: { range: "home" } }, client);
  check("시작 질문(단계)을 바꿔도 오늘 추천을 지움", (await savedRows()) === 0);

  // 점수: 필요한 것 ⑥ 반영, AI에는 정책 신청 정보를 보내지 않음
  const prompts: string[] = [];
  const spy = (async (o: { prompt: string; fallback: unknown }) => { prompts.push(o.prompt); return { data: { items: [] }, usedFallback: false, modelVersion: "fake", fallbackReason: null }; }) as unknown as Gen;
  const third = (await client.query<{ id: number }>(
    `INSERT INTO users (nickname, region_code, start_answers, policy_info) VALUES ('가상', '11440', '{"needs":["money_job"],"support":"no"}', '{"job":"unemployed","income":"under_2000"}') RETURNING id`,
  )).rows[0].id;
  await recommendPolicies(third, client, spy);
  check("AI 입력: 필요한 것은 들어가고, 취업·소득 같은 정책 신청 정보는 없음", /생활비·일자리/.test(prompts[0] ?? "") && !/unemployed|under_2000|일하고 있지|소득 없음/.test(prompts[0] ?? ""), prompts[0]);
  const row = { id: 1, title: "x", summary: "", burden: "online", stage: 1, difficulty_note: null, relevance: 1, tags: ["생활비"], url: null, apply_end: null, apply_always: true, region_code: "11000",
    job_cd: null, school_cd: null, mrg_cd: null, sbiz_cd: null, earn_cd: null, earn_max: null, earn_etc: null, add_cond: null } as Parameters<typeof scorePolicy>[0];
  const prof: Parameters<typeof scorePolicy>[1] = { level: 1, region: "11440", age: null, burdens: [], together: null, costStops: 0, needs: [], checkinNeeds: [], support: null, living: null, info: EMPTY_POLICY_INFO };
  check("'생활비·일자리'가 필요함 → 생활비 정책 점수 높아짐", scorePolicy(row, { ...prof, needs: ["money_job"] }, today) > scorePolicy(row, prof, today));
  check("'가족과의 관계'가 필요함 → 이름·요약에 가족이 든 정책 점수 높아짐", scorePolicy({ ...row, title: "가족돌봄청년 지원" }, { ...prof, needs: ["family"] }, today) > scorePolicy({ ...row, title: "가족돌봄청년 지원" }, prof, today));
} finally {
  await client.query("ROLLBACK");
  client.release();
  await db.end();
}

console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exitCode = failCount ? 1 : 0;
