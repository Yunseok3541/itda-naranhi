// 신청 도우미 실제 AI 확인 — AI_PROVIDER에 따라 Gemini 또는 GMS gpt-4o-mini (AI 4번: 대본 1 · 연습 1 · 질문 2). 무료 한도를 쓰므로 필요할 때만, 공개 주소 말고 로컬에서
// 정책은 로컬 DB의 실제 정책(읽기만), 챗봇은 DB에 쓰지 않음. 결과 기록: docs/고민기록.md #39
// 실행 (web/에서):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-apply-helper-live.mts --a=161 --b=156
const arg = (k: string) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1]);
const A = arg("a") || 161;
const B = arg("b") || 156;
const { db } = await import("@/lib/db");
const { applyHelper, HELPER_MODEL } = await import("@/app/api/policies/helper");
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { AI_PROVIDER, OPENAI_MODEL } = await import("@/lib/gemini");
const keyName = AI_PROVIDER === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
if (!process.env[keyName]) throw new Error(`${keyName}가 없어요 (AI_PROVIDER=${AI_PROVIDER})`);
console.log(`제공자 ${AI_PROVIDER} · 모델 ${AI_PROVIDER === "openai" ? OPENAI_MODEL : HELPER_MODEL}\n`);
const only = process.argv.includes("--two");
const all: [string, number, Body][] = [
  ["문의 대본 (내 질문 포함)", A, { intent: "script", text: "혼자 사는데 신청할 수 있어요" }],
  ["말하기 연습 1번째", A, { intent: "practice", text: "안녕하세요, 월세대출 문의드리려고요", history: [{ role: "staff", text: "네, 청년 정책 문의 창구예요. 어떤 일로 연락 주셨어요?" }] }],
  ["질문 (원문에 있음)", A, { intent: "ask", text: "온라인으로 신청할 수 있어요?" }],
  ["질문 (원문에 없음)", B, { intent: "ask", text: "기숙사도 제공돼요?" }],
];
const cases = only ? all.slice(0, 2) : all; // --two: 대본·연습만 (문장 다듬은 뒤 다시 볼 때)
let ai = 0;
try {
  for (const [name, id, body] of cases) {
    const t = Date.now();
    const r = (await applyHelper(id, body, db)).body as Body;
    if (r.source === "ai") ai++;
    console.log(`■ ${name} — ${r.source} · aiStatus ${r.aiStatus}${r.modelVersion ? ` (${r.modelVersion})` : ""}, ${Date.now() - t}ms`);
    if (r.script) console.log(`  ${r.script.opening}\n${r.script.questions.map((q: string) => `  - ${q}`).join("\n")}\n  ${r.script.closing}`);
    if (r.staffLine) console.log(`  담당자: ${r.staffLine}\n  도움말: ${r.tip ?? "(없음)"}`);
    if (r.intent === "ask") console.log(`  ${r.reply}`);
    console.log("");
    await sleep(5000); // flash-lite 분당 15번
  }
} finally {
  await db.end();
}
console.log(`AI 문장 통과 ${ai}/${cases.length} (질문 (원문에 없음)은 rule이 정상)`);
