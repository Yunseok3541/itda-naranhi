// POST /api/meteors — 떨어지는 유성 터치 → +1포인트 (같은 유성은 한 번만. 구현: _lib/points.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { catchMeteor } from "../_lib/points";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "지금은 유성을 담지 못했어요."));
  return toResponse(await catchMeteor(session.userId, body));
}
