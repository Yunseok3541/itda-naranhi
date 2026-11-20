// POST /api/policies/{policyId}/feedback — "나랑 안 맞아요" (피드백 루프 입구, 로직: ../../service.ts, 루프: @/lib/policy-feedback-loop)
// 요청 { reason: region|eligibility|not_needed|too_hard|other, text?: 200자 이하 }
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { ruleHelp } from "@/lib/safety";
import { fail, toResponse } from "../../../_lib/http";
import { submitFeedback } from "../../service";

export async function POST(request: Request, ctx: RouteContext<"/api/policies/[policyId]/feedback">) {
  const body: unknown = await request.json().catch(() => null);
  const help = ruleHelp((body as { text?: unknown } | null)?.text);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help });
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "지금은 저장하지 못했어요. 잠시 후 다시 알려 주세요.", { help }));
  const { policyId } = await ctx.params;
  return toResponse(await submitFeedback(session.userId, policyId, body));
}
