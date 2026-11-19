// GET /api/centers?region=11440 — 청년센터 목록 (세션 불필요, 로직: _lib/centers.ts)
import type { NextRequest } from "next/server";
import { listCenters } from "../_lib/centers";
import { toResponse } from "../_lib/http";

export async function GET(request: NextRequest) {
  return toResponse(listCenters(request.nextUrl.searchParams.get("region")));
}
