// GET /api/policies — 개인 맞춤 정책 추천 (하루 한 번 생성·저장) / ?view=all — 모든 정책 보기 (로직: ./service.ts)
import type { NextRequest } from "next/server";
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { listPolicies, recommendPolicies } from "./service";

export async function GET(request: NextRequest) {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 정책을 불러오지 못했어요."));
  const all = request.nextUrl.searchParams.get("view") === "all";
  return toResponse(all ? await listPolicies(session.userId) : await recommendPolicies(session.userId));
}
