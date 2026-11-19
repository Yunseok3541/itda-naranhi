// GET /api/profile — 내 시작 질문 답·정책 신청 정보 / PUT /api/profile — 보낸 칸만 저장 (로직: ./service.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { getProfile, saveProfile } from "./service";

async function sessionUser() {
  const session = await lookupDemoSession();
  if (session.status === "none") return { response: demoSessionRequired() };
  if (session.status === "error") return { response: toResponse(fail(503, "LOAD_FAILED", "지금은 정보를 불러오지 못했어요.")) };
  return { userId: session.userId };
}

export async function GET() {
  const s = await sessionUser();
  if ("response" in s) return s.response;
  return toResponse(await getProfile(s.userId));
}

export async function PUT(request: Request) {
  const s = await sessionUser();
  if ("response" in s) return s.response;
  const body = await request.json().catch(() => null);
  return toResponse(await saveProfile(s.userId, body));
}
