// POST /api/attempts — 별 시도 저장 (윤석 담당 범위. 구현: _lib/attempts.ts, 회고 처리: @/lib/reflection)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { createAttempt, ruleHelpFromBody } from "../_lib/attempts";
import { fail, toResponse } from "../_lib/http";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: ruleHelpFromBody(body) });
  if (session.status === "error") {
    return toResponse(fail(503, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", {
      help: ruleHelpFromBody(body),
    }));
  }
  return toResponse(await createAttempt(session.userId, body));
}
