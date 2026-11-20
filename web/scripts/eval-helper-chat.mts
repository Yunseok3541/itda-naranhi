// 신청 도우미 자유 대화 평가 (고민기록 #45) — 실제 정책 10개 × 자주 나올 질문 5개를 실제 AI로
// 재는 것: AI 답 통과율 · 걸러짐 · 다시 받기 · 응답 시간 · 근거(원문/일반/대화) · 자격 판정처럼 보이는 답(자동 표시)
// ⚠ 실제 AI를 50번 이상 부른다. Gemini 무료 한도에서는 돌리지 말고 GMS(AI_PROVIDER=openai)로. 공개 주소 말고 로컬 DB(읽기만)
// 실행 (web/에서):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest_master node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/eval-helper-chat.mts
// 결과: scripts/eval/helper-chat-eval-result.json (정책 원문은 공개 데이터, 질문은 정해 둔 가상 문장)
import { writeFileSync } from "node:fs";

const { db } = await import("@/lib/db");
const { applyHelper, judgesEligibility } = await import("@/app/api/policies/helper");
const { generateJson, AI_PROVIDER, ACTIVE_MODEL } = await import("@/lib/gemini");

const QUESTIONS = [
  { id: "eligibility", text: "혼자 사는데 이거 신청할 수 있어?" },
  { id: "channel", text: "전화는 좀 무서운데 다른 방법 있어?" },
  { id: "amount", text: "돈은 얼마나 받아?" },
  { id: "deadline", text: "언제까지 신청해야 돼?" },
  { id: "giveup", text: "너무 귀찮다 그냥 안 할래" },
];

if (AI_PROVIDER !== "openai") {
  console.error("Gemini 무료 한도를 아끼려고 GMS(AI_PROVIDER=openai)에서만 돌립니다");
  process.exit(1);
}

let calls = 0;
const counted = (async (o: Parameters<typeof generateJson>[0]) => { calls++; return generateJson(o); }) as typeof generateJson;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

try {
  const policies = (await db.query<{ id: number; title: string; burden: string }>(
    `SELECT id, title, burden FROM policies
     WHERE actionable AND burden IS NOT NULL AND raw->>'plcyAplyMthdCn' IS NOT NULL
     ORDER BY relevance DESC, id LIMIT 10`)).rows;
  const rows: Body[] = [];
  for (const p of policies) {
    for (const q of QUESTIONS) {
      const before = calls;
      const t = Date.now();
      const r = (await applyHelper(p.id, { intent: "chat", text: q.text }, db, counted)).body as Body;
      const ms = Date.now() - t;
      // 서버와 같은 검사로 표시 (서버가 걸렀다면 여기 오지 않음 → 0이어야 정상). 사람이 결과 파일에서 다시 본다
      const verdict = r.source === "ai" && judgesEligibility(r.reply);
      rows.push({ policyId: p.id, policy: p.title, burden: p.burden, question: q.id, source: r.source, aiStatus: r.aiStatus, basis: r.basis ?? null,
        aiCalls: calls - before, ms, verdictSuspect: verdict, reply: r.reply, sections: (r.sections ?? []).map((s: Body) => s.title) });
      process.stdout.write(r.source === "ai" ? "." : r.source === "rule" ? "r" : "x");
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  const n = rows.length;
  const pct = (k: number) => `${Math.round((k / n) * 100)}%`;
  const by = (f: (r: Body) => string) => rows.reduce<Record<string, number>>((m, r) => ({ ...m, [f(r)]: (m[f(r)] ?? 0) + 1 }), {});
  const ai = rows.filter((r) => r.source === "ai");
  const summary = {
    at: new Date().toISOString(), provider: AI_PROVIDER, model: ACTIVE_MODEL, policies: policies.length, questions: QUESTIONS.length, total: n,
    aiAnswered: `${ai.length} (${pct(ai.length)})`, rule: rows.filter((r) => r.source === "rule").length,
    fallback: `${rows.filter((r) => r.source === "fallback").length} (${pct(rows.filter((r) => r.source === "fallback").length)})`,
    aiStatus: by((r) => r.aiStatus), basis: by((r) => r.basis ?? "-"),
    retried: rows.filter((r) => r.aiCalls > 1).length, aiCalls: calls,
    msAvg: Math.round(rows.reduce((a, r) => a + r.ms, 0) / n), msMax: Math.max(...rows.map((r) => r.ms)),
    verdictSuspect: rows.filter((r) => r.verdictSuspect).length,
    byQuestion: Object.fromEntries(QUESTIONS.map((q) => {
      const rs = rows.filter((r) => r.question === q.id);
      return [q.id, { ai: rs.filter((r) => r.source === "ai").length, fallback: rs.filter((r) => r.source === "fallback").length, basis: rs.map((r) => r.basis ?? "-").join(",") }];
    })),
  };
  writeFileSync("scripts/eval/helper-chat-eval-result.json", JSON.stringify({ summary, rows }, null, 2));
  console.log("\n" + JSON.stringify(summary, null, 2));
} finally {
  await db.end();
}
