// GET /api/profile/avatar — 별자리별 획득 여부 + 지금 프로필 이미지
// PUT /api/profile/avatar — 프로필 이미지 바꾸기 (획득한 별자리만. 로직: ./service.ts)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../../_lib/http";
import { getAvatar, saveAvatar } from "./service";

async function sessionUser(failCode: "LOAD_FAILED" | "SAVE_FAILED") {
  const session = await lookupDemoSession();
  if (session.status === "none") return { response: demoSessionRequired() };
  if (session.status === "error") {
    return { response: toResponse(fail(503, failCode, failCode === "LOAD_FAILED" ? "지금은 별자리 목록을 불러오지 못했어요." : "지금은 프로필 이미지를 바꾸지 못했어요.")) };
  }
  return { userId: session.userId };
}

export async function GET() {
  const s = await sessionUser("LOAD_FAILED");
  if ("response" in s) return s.response;
  return toResponse(await getAvatar(s.userId));
}

export async function PUT(request: Request) {
  const s = await sessionUser("SAVE_FAILED");
  if ("response" in s) return s.response;
  const body = await request.json().catch(() => null);
  return toResponse(await saveAvatar(s.userId, body));
}
