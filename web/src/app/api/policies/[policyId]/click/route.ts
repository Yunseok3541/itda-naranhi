// POST /api/policies/{policyId}/click — 원문 열기 기록 ("정보 확인" 지표). 응답 { url }
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../../../_lib/http";
import { recordClick } from "../../service";

export async function POST(_request: Request, ctx: RouteContext<"/api/policies/[policyId]/click">) {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "기록하지 못했어요. 원문은 그대로 열 수 있어요."));
  const { policyId } = await ctx.params;
  return toResponse(await recordClick(session.userId, policyId));
}
