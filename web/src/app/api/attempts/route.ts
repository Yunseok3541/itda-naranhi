// POST /api/attempts — 별 시도 저장 + AI ④ 응원 + AI ③ 위기 표현 (로직: _lib/attempts.ts)
import { getDemoUserId } from "@/lib/demo-session";
import { createAttempt, ruleHelpFromBody } from "../_lib/attempts";
import { noSession, toResponse } from "../_lib/http";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const userId = await getDemoUserId();
  // 세션이 없어도 회고에 위기 표현이 있으면 안내는 보낸다
  if (userId === null) return noSession(ruleHelpFromBody(body));
  return toResponse(await createAttempt(userId, body));
}
