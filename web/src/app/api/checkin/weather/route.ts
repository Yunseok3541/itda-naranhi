// 마음 날씨 직접 고치기 (AI 한계 대응: AI가 짧은 문장으로 상태를 잘못 읽었을 때)
// AI가 고른 날씨(weather)는 그대로 두고 user_weather에 따로 저장 → "AI 날씨를 고친 비율"을 지표로 볼 수 있음
// 사용자는 데모 세션 쿠키로 정한다. 본문의 userId는 무시하고, 내 체크인이 아니면 없는 것처럼 404
import { db } from "@/lib/db";
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { isWeather } from "@/lib/weather";

export async function PATCH(request: Request) {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  if (session.status === "error") {
    return Response.json({ error: "지금은 저장하지 못했어요." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | { checkinId?: unknown; weather?: unknown }
    | null;
  const checkinId = Number(body?.checkinId);
  const weather = body?.weather;
  if (!Number.isInteger(checkinId) || checkinId <= 0 || !isWeather(weather)) {
    return Response.json({ error: "checkinId와 올바른 weather가 필요해요." }, { status: 400 });
  }

  try {
    const result = await db.query(
      "UPDATE checkins SET user_weather = $1 WHERE id = $2 AND user_id = $3",
      [weather, checkinId, session.userId],
    );
    if (result.rowCount === 0) {
      return Response.json({ error: "체크인을 찾을 수 없어요." }, { status: 404 });
    }
  } catch (error) {
    console.error("[checkin/weather] 저장 실패", (error as { code?: string }).code ?? "unknown");
    return Response.json({ error: "지금은 저장하지 못했어요." }, { status: 500 });
  }

  return Response.json({ weather });
}
