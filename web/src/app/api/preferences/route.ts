// GET /api/preferences — 내 성향 점수 + 필요한 회복 방향 (로직: ./service.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getPreferences } from "./service";

export async function GET() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 정보를 불러오지 못했어요."));
  return toResponse(await getPreferences(session.userId));
}
