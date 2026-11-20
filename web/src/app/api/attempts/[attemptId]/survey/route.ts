// POST /api/attempts/{attemptId}/survey — 퀘스트 후 설문 저장 (선택, 건너뛰기 가능. 로직: _lib/survey.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../../../_lib/http";
import { saveSurvey } from "../../../_lib/survey";

export async function POST(request: Request, ctx: RouteContext<"/api/attempts/[attemptId]/survey">) {
  const body: unknown = await request.json().catch(() => null);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "지금은 저장하지 못했어요. 고른 답은 화면에 그대로 있어요."));
  const { attemptId } = await ctx.params;
  return toResponse(await saveSurvey(session.userId, attemptId, body));
}
