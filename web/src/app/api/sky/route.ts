// GET /api/sky — 밤하늘: 별 상태 + 그날의 기억 (윤석 담당 범위. 구현: _lib/sky.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getSky } from "../_lib/sky";

export async function GET() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") {
    return toResponse(fail(503, "LOAD_FAILED", "지금은 밤하늘을 불러오지 못했어요."));
  }
  return toResponse(await getSky(session.userId));
}
