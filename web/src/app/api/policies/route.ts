// GET /api/policies — 개인 맞춤 정책 추천 (하루 한 번 생성·저장) / ?view=all — 모든 정책 보기 (로직: ./service.ts)
// ?view= recommended(기본) | all. 정책 화면 상단 보기 전환 버튼이 쓴다. 모르는 값이면 400
import type { NextRequest } from "next/server";
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../_lib/http";
import { listPolicies, parseView, recommendPolicies } from "./service";

export async function GET(request: NextRequest) {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired({ help: null });
  if (session.status === "error") return toResponse(fail(503, "LOAD_FAILED", "지금은 정책을 불러오지 못했어요."));
  const view = parseView(request.nextUrl.searchParams.get("view"));
  if (view === null) return toResponse(fail(400, "INVALID", "보기는 recommended 또는 all이에요.", { field: "view" }));
  return toResponse(view === "all" ? await listPolicies(session.userId) : await recommendPolicies(session.userId));
}
