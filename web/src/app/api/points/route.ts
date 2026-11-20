// GET /api/points — 포인트 합계(별 + 유성 + 체크인)와 출처별 내역, 유성 일정 (구현: _lib/points.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getPoints } from "../_lib/points";

export async function GET() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 포인트를 불러오지 못했어요."));
  return toResponse(await getPoints(session.userId));
}
