// POST /api/attempts — 별 시도 저장 (윤석 담당 범위. 구현: _lib/attempts.ts, 회고 처리: @/lib/reflection)
import { demoSessionRequired, getDemoUserId } from "@/lib/demo-session";
import { createAttempt, ruleHelpFromBody } from "../_lib/attempts";
import { toResponse } from "../_lib/http";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const userId = await getDemoUserId();
  // 세션이 없어도 회고에 위기 표현이 있으면 안내는 보낸다 (규칙만, AI 호출·저장 없음)
  if (userId === null) return demoSessionRequired({ help: ruleHelpFromBody(body) });
  return toResponse(await createAttempt(userId, body));
}
