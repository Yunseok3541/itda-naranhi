// POST /api/inquiries — AI ⑥ 문의 문장 초안 생성·저장 / GET — 내 초안 목록 (로직: _lib/inquiries.ts)
import type { NextRequest } from "next/server";
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { createDraft, listDrafts, ruleHelpFromText } from "../_lib/inquiries";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const help = ruleHelpFromText((body as { question?: unknown } | null)?.question);
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help });
  // DB 장애로 세션을 확인하지 못하면 "세션 없음"(401)이 아니라 503 → 화면이 데모를 다시 시작시키지 않게
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "지금은 초안을 저장하지 못했어요.", { help }));
  return toResponse(await createDraft(session.userId, body));
}

export async function GET(request: NextRequest) {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 초안을 불러오지 못했어요."));
  return toResponse(await listDrafts(session.userId, request.nextUrl.searchParams.get("centerId")));
}
