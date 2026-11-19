// GET /api/centers/{centerId} — 청년센터 상세 (세션 불필요)
import { getCenter } from "../../_lib/centers";
import { toResponse } from "../../_lib/http";

export async function GET(_request: Request, ctx: RouteContext<"/api/centers/[centerId]">) {
  const { centerId } = await ctx.params;
  return toResponse(getCenter(centerId));
}
