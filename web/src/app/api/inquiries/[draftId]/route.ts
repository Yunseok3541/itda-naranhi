// PATCH /api/inquiries/{draftId} — 고친 초안 저장, "문의해 봤어요" 직접 기록
import { demoSessionRequired, getDemoUserId } from "@/lib/demo-session";
import { toResponse } from "../../_lib/http";
import { ruleHelpFromText, updateDraft } from "../../_lib/inquiries";

export async function PATCH(request: Request, ctx: RouteContext<"/api/inquiries/[draftId]">) {
  const body: unknown = await request.json().catch(() => null);
  const userId = await getDemoUserId();
  if (userId === null) return demoSessionRequired({ help: ruleHelpFromText((body as { draft?: unknown } | null)?.draft) });
  const { draftId } = await ctx.params;
  return toResponse(await updateDraft(userId, draftId, body));
}
