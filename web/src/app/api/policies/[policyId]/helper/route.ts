// POST /api/policies/{policyId}/helper — 신청 도우미 (로직: ../../helper.ts, 고민기록 #39)
// 요청 { intent: steps|docs|script|practice|ask|start, text?, history? }. 대화는 저장하지 않지만, AI 무료 한도를 지키려고 세션은 필요
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { ruleHelp } from "@/lib/safety";
import { fail, toResponse } from "../../../_lib/http";
import { applyHelper } from "../../helper";

export async function POST(request: Request, ctx: RouteContext<"/api/policies/[policyId]/helper">) {
  const body: unknown = await request.json().catch(() => null);
  const help = ruleHelp((body as { text?: unknown } | null)?.text);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help });
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 도와드리기 어려워요. 잠시 후 다시 시도해 주세요.", { help }));
  const { policyId } = await ctx.params;
  return toResponse(await applyHelper(policyId, body, undefined, undefined, session.userId));
}
