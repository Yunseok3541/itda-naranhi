// POST /api/recommendations — AI ① 오늘의 별 추천 (담당 고은비, 로직: ./service.ts, 명세: docs/API명세.md)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { recommend } from "./service";

export async function POST(request: Request) {
  // 사용자는 세션 쿠키로만 정한다. DB 장애로 세션을 확인하지 못하면 "세션 없음"이 아니라 500
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") return toResponse(fail(500, "LOAD_FAILED", "지금은 추천을 불러오지 못했어요."));
  const body: unknown = await request.json().catch(() => null);
  return toResponse(await recommend(session.userId, body));
}
