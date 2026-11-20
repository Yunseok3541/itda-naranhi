// 정책 분류(AI ⑤) 정확도 평가: 정답 세트(scripts/eval/policy-gold.json)와 비교
// 비교 대상 3가지
//   before  : 11/19 분류 (입력 7칸, 이름 규칙 보정 후) — 정답 세트 파일에 저장된 값
//   after   : 지금 코드로 다시 분류 (입력 = 원문의 값 있는 칸 모두). DB에 쓰지 않고 메모리에서만 (정책 20개 = AI 3번)
//   keyword : AI 없이 신청 방법 문장의 단어로만 나눈 기준선 (발표의 "키워드 필터 vs AI" 비교)
// 실행 (web/에서, 로컬 DB에서 정책 원문을 읽음):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest GEMINI_MODEL=gemini-3.5-flash-lite node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/eval-policies.mts
//   --no-ai : after를 건너뛰고 before·keyword만
import { readFileSync, writeFileSync } from "node:fs";

const noAi = process.argv.includes("--no-ai");
const { db } = await import("@/lib/db");
const { classifyRows, MIN_DIFFICULTY } = await import("@/lib/policy-classify");
const { GEMINI_MODEL } = await import("@/lib/gemini");
type Burden = "online" | "visit" | "phone" | "group";
type Label = { actionable: boolean | null; burden: Burden | null; difficulty: number | null };
type Item = { sourceId: string; title: string; gold: Label; why: string; before: Label };

const goldPath = new URL("./eval/policy-gold.json", import.meta.url);
const gold = JSON.parse(readFileSync(goldPath, "utf8")) as { items: Item[] };

// 키워드 기준선: 신청 방법·심사·지원 내용에서 가장 부담 큰 단어 하나 (모임 > 상담 > 방문 > 온라인)
function keyword(raw: Record<string, string>): Label {
  const t = `${raw.plcyAplyMthdCn ?? ""} ${raw.srngMthdCn ?? ""} ${raw.plcySprtCn ?? ""}`;
  const burden: Burden = /캠프|교실|모임|워크숍|강좌|특강|교육생|프로그램 참여|동아리/.test(t) ? "group"
    : /상담|면접|전화|인터뷰/.test(t) ? "phone"
    : /방문|센터|주민센터|행정복지센터|자치구|시군구/.test(t) ? "visit" : "online";
  return { actionable: true, burden, difficulty: MIN_DIFFICULTY[burden] };
}

function score(name: string, pick: (it: Item) => Label | undefined) {
  let act = 0, actN = 0, bur = 0, exact = 0, near = 0, n = 0;
  for (const it of gold.items) {
    const p = pick(it);
    if (!p) continue;
    actN++;
    if (p.actionable === it.gold.actionable) act++;
    if (!it.gold.actionable) continue; // 방식·난이도는 개인이 이용 가능한 정책만 비교
    n++;
    if (p.burden === it.gold.burden) bur++;
    if (p.difficulty === it.gold.difficulty) exact++;
    if (p.difficulty !== null && it.gold.difficulty !== null && Math.abs(p.difficulty - it.gold.difficulty) <= 1) near++;
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}% (${a}/${b})` : "-");
  return { name, actionable: pct(act, actN), burden: pct(bur, n), difficultyExact: pct(exact, n), difficultyNear: pct(near, n) };
}

try {
  const rows = (
    await db.query<{ id: number; source_id: string; title: string; raw: Record<string, string> }>(
      "SELECT id, source_id, title, raw FROM policies WHERE source = 'youth_policy' AND source_id = ANY($1)",
      [gold.items.map((i) => i.sourceId)],
    )
  ).rows;
  const bySource = new Map(rows.map((r) => [r.source_id, r]));
  const missing = gold.items.filter((i) => !bySource.has(i.sourceId));
  if (missing.length) throw new Error(`DB에 없는 정책 ${missing.length}개 (먼저 sync-policies로 수집)`);

  const after = new Map<string, Label>();
  let modelVersion: string | null = null;
  if (!noAi) {
    const r = await classifyRows(rows.map((x) => ({ id: x.id, title: x.title, raw: x.raw })), { log: console.log });
    modelVersion = r.modelVersion;
    for (const x of rows) {
      const c = r.results.get(x.id);
      if (c) after.set(x.source_id, { actionable: c.actionable, burden: c.burden, difficulty: c.difficulty });
    }
  }

  const results = [
    score("keyword (AI 없음)", (it) => keyword(bySource.get(it.sourceId)!.raw)),
    score("before (11/19, 입력 7칸)", (it) => it.before),
    ...(noAi ? [] : [score(`after (지금, 입력 전부 · ${modelVersion ?? GEMINI_MODEL})`, (it) => after.get(it.sourceId))]),
  ];
  console.log(`\n정답 세트 ${gold.items.length}개 (개인 이용 가능 ${gold.items.filter((i) => i.gold.actionable).length}개)\n`);
  console.log("| 방식 | 이용 가능 여부 | 신청·참여 방식 | 난이도 정확 | 난이도 ±1 |");
  console.log("| ---- | -------------- | -------------- | ----------- | --------- |");
  for (const r of results) console.log(`| ${r.name} | ${r.actionable} | ${r.burden} | ${r.difficultyExact} | ${r.difficultyNear} |`);

  console.log("\n정답과 다른 항목 (before → after):");
  for (const it of gold.items) {
    const a = after.get(it.sourceId);
    const fmt = (l?: Label) => (l ? `${l.actionable ? "" : "사업 "}${l.burden ?? "-"} ${l.difficulty ?? "-"}` : "실패");
    const wrong = (l?: Label) => !l || l.actionable !== it.gold.actionable || (it.gold.actionable && (l.burden !== it.gold.burden || l.difficulty !== it.gold.difficulty));
    if (wrong(it.before) || (!noAi && wrong(a))) console.log(`  - ${it.title.slice(0, 30)} | 정답 ${fmt(it.gold)} | before ${fmt(it.before)} | after ${noAi ? "-" : fmt(a)}`);
  }
  if (!noAi) {
    writeFileSync(new URL("./eval/policy-eval-result.json", import.meta.url), JSON.stringify({
      at: new Date().toISOString(), model: modelVersion, results,
      after: Object.fromEntries(gold.items.map((it) => [it.sourceId, after.get(it.sourceId) ?? null])),
    }, null, 2) + "\n");
    console.log("\n결과 저장: scripts/eval/policy-eval-result.json");
  }
} finally {
  await db.end();
}
