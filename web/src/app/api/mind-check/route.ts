// GET /api/mind-check — 최근 마음 짚기 결과 / POST /api/mind-check — 답 저장 후 결과 (로직: ./service.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getMindCheck, saveMindCheck } from "./service";

async function sessionUser() {
  const session = await lookupDemoSession();
  if (session.status === "none") return { response: demoSessionRequired() };
  if (session.status === "error") return { response: toResponse(fail(503, "LOAD_FAILED", "지금은 정보를 불러오지 못했어요.")) };
  return { userId: session.userId };
}

export async function GET() {
  const s = await sessionUser();
  if ("response" in s) return s.response;
  return toResponse(await getMindCheck(s.userId));
}

export async function POST(request: Request) {
  const s = await sessionUser();
  if ("response" in s) return s.response;
  const body = await request.json().catch(() => null);
  return toResponse(await saveMindCheck(s.userId, body));
}
