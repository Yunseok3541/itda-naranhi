// GET /api/sky — 밤하늘: 별 상태 + 그날의 기억 (윤석 담당 범위. 구현: _lib/sky.ts)
import { demoSessionRequired, getDemoUserId } from "@/lib/demo-session";
import { toResponse } from "../_lib/http";
import { getSky } from "../_lib/sky";

export async function GET() {
  const userId = await getDemoUserId();
  if (userId === null) return demoSessionRequired({ help: null });
  return toResponse(await getSky(userId));
}
