// POST /api/inquiries — AI ⑥ 문의 문장 초안 생성·저장 / GET — 내 초안 목록 (로직: _lib/inquiries.ts)
import type { NextRequest } from "next/server";
import { getDemoUserId } from "@/lib/demo-session";
import { noSession, toResponse } from "../_lib/http";
import { createDraft, listDrafts, ruleHelpFromText } from "../_lib/inquiries";

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const userId = await getDemoUserId();
  if (userId === null) return noSession(ruleHelpFromText((body as { question?: unknown } | null)?.question));
  return toResponse(await createDraft(userId, body));
}

export async function GET(request: NextRequest) {
  const userId = await getDemoUserId();
  if (userId === null) return noSession();
  return toResponse(await listDrafts(userId, request.nextUrl.searchParams.get("centerId")));
}
