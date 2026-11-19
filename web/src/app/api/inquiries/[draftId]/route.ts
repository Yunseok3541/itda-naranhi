// PATCH /api/inquiries/{draftId} — 고친 초안 저장, "문의해 봤어요" 직접 기록
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../../_lib/http";
import { ruleHelpFromText, updateDraft } from "../../_lib/inquiries";

export async function PATCH(request: Request, ctx: RouteContext<"/api/inquiries/[draftId]">) {
  const body: unknown = await request.json().catch(() => null);
  const help = ruleHelpFromText((body as { draft?: unknown } | null)?.draft);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help });
  if (session.status === "error") {
    return toResponse(fail(503, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", { help }));
  }
  const { draftId } = await ctx.params;
  return toResponse(await updateDraft(session.userId, draftId, body));
}
