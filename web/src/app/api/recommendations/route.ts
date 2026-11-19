// POST /api/recommendations — AI ① 오늘의 별 추천 (로직: _lib/recommendations.ts, 명세: docs/API명세.md)
import { getDemoUserId } from "@/lib/demo-session";
import { noSession, toResponse } from "../_lib/http";
import { recommend } from "../_lib/recommendations";

export async function POST(request: Request) {
  const userId = await getDemoUserId();
  if (userId === null) return noSession();
  const body: unknown = await request.json().catch(() => null);
  return toResponse(await recommend(userId, body));
}
