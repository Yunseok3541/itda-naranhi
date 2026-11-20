// GET /api/milestones — 프로필 배지 판정용 사실들 (로직: ./service.ts, 규칙: lib/milestones.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getMilestoneFacts } from "./service";

export async function GET() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 배지를 불러오지 못했어요."));
  return toResponse(await getMilestoneFacts(session.userId));
}
