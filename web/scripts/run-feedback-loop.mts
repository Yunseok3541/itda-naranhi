// 정책 피드백 루프 실행 (실제 Gemini 에이전트: 판정 flash-lite · 검증 flash-lite · 승인 flash)
// ⚠ 무료 한도를 쓴다: 피드백 하나에 AI 최대 5번 (판정 2 + 검증 2 + 승인 1). 시연에서는 돌리지 않고 구조·검증만 보여 준다 (고민기록 #38)
// 실행 (web/에서):
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/run-feedback-loop.mts --limit=3
//   --list : 실행하지 않고 대기 중인 피드백과 최근 수정 요청만 보기 (AI 호출 없음)
const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8));
const limit = Number.isInteger(limitArg) && limitArg > 0 ? Math.min(limitArg, 10) : 3;
const listOnly = process.argv.includes("--list");

const { db } = await import("@/lib/db");
const { processPendingFeedback } = await import("@/lib/policy-feedback-loop");
const { geminiAgents, JUDGE_MODEL, REVIEW_MODEL } = await import("@/lib/policy-feedback-agents");

try {
  const pending = (await db.query<{ id: number; policy_id: number; reason: string; text: string | null }>(
    "SELECT id, policy_id, reason, text FROM policy_feedback WHERE loop_status = 'pending' ORDER BY id")).rows;
  console.log(`대기 중인 피드백 ${pending.length}개`);
  for (const p of pending.slice(0, 10)) console.log(`  #${p.id} 정책 ${p.policy_id} · ${p.reason}${p.text ? ` · "${p.text.slice(0, 40)}"` : ""}`);
  const recent = (await db.query<{ id: number; policy_id: number; field: string; proposed_value: string; status: string; attempts: number }>(
    "SELECT id, policy_id, field, proposed_value, status, attempts FROM policy_correction_requests ORDER BY id DESC LIMIT 10")).rows;
  console.log(`최근 수정 요청 ${recent.length}개`);
  for (const r of recent) console.log(`  #${r.id} 정책 ${r.policy_id} · ${r.field} → ${r.proposed_value} · ${r.status} (판정 ${r.attempts}번)`);
  if (!listOnly && pending.length) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 없어요 (키 없이는 판정이 모두 실패해 루프가 끝남)");
    console.log(`\n실행: 최대 ${limit}개 · 판정 ${JUDGE_MODEL} · 승인 ${REVIEW_MODEL}`);
    const results = await processPendingFeedback(db, geminiAgents(), { limit, log: console.log });
    const by = results.reduce<Record<string, number>>((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] ?? 0) + 1 }), {});
    console.log("결과:", JSON.stringify(by));
  }
} catch (error) {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.end();
}
