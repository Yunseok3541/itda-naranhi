// GET /api/sky — 밤하늘: 별 상태 + 그날의 기억 (로직: _lib/sky.ts)
import { getDemoUserId } from "@/lib/demo-session";
import { noSession, toResponse } from "../_lib/http";
import { getSky } from "../_lib/sky";

export async function GET() {
  const userId = await getDemoUserId();
  if (userId === null) return noSession();
  return toResponse(await getSky(userId));
}
