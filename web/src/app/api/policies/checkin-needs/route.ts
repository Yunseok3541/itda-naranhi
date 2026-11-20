// DELETE /api/policies/checkin-needs — 정책 추천에 오늘 체크인을 참고하지 않기 (고민기록 #47, 로직: ../service.ts clearCheckinNeeds)
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { fail, toResponse } from "../../_lib/http";
import { clearCheckinNeeds } from "../service";

export async function DELETE() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") return toResponse(fail(503, "SAVE_FAILED", "지금은 바꾸지 못했어요. 잠시 후 다시 시도해 주세요."));
  return toResponse(await clearCheckinNeeds(session.userId));
}
