// AI ② 체크인 → 마음 날씨 갱신 + AI ③ 위험 신호 감지
// 다른 AI 기능(별 추천, 회고 응원)도 이 파일과 같은 구조로 만들면 됨:
//   입력 검증 → (규칙) → generateJson(스키마 + 기본값) → DB 저장 → 응답
import { db } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { HELP_MESSAGE, mergeRisk, ruleRisk, type Risk } from "@/lib/safety";

const WEATHERS = ["sunny", "partly_cloudy", "cloudy", "rainy", "foggy"] as const;
type Weather = (typeof WEATHERS)[number];

type CheckinResult = {
  weather: Weather;
  recommendedStageDelta: -1 | 0;  // 흐린 날에는 한 단계 아래 쉬운 별 추천
  risk: Risk;
};

const schema = {
  type: "object",
  properties: {
    weather: { type: "string", enum: [...WEATHERS] },
    recommendedStageDelta: { type: "integer", enum: [-1, 0] },
    risk: { type: "string", enum: ["normal", "caution", "danger"] },
  },
  required: ["weather", "recommendedStageDelta", "risk"],
};

function isCheckinResult(v: unknown): v is CheckinResult {
  const r = v as CheckinResult;
  return (
    !!r &&
    WEATHERS.includes(r.weather) &&
    (r.recommendedStageDelta === -1 || r.recommendedStageDelta === 0) &&
    ["normal", "caution", "danger"].includes(r.risk)
  );
}

const SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱의 체크인 분석기다.
사용자의 한 줄 일기를 읽고 오늘의 마음 상태를 날씨 하나로 고른다.
- sunny: 기운 있음 / partly_cloudy: 보통 / cloudy: 지침·무기력 / rainy: 우울·슬픔 / foggy: 혼란·불안
- 무기력하거나 힘든 날이면 recommendedStageDelta를 -1로 한다.
- 자해, 자살, 삶을 끝내고 싶다는 뜻이 보이면 risk=danger, 애매하게 위험해 보이면 caution, 그 외 normal.
진단하거나 조언하지 말고, 지정된 JSON만 출력한다.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { userId?: number; text?: string } | null;
  const text = body?.text?.trim();
  if (!body?.userId || !text || text.length > 300) {
    return Response.json({ error: "userId와 300자 이하 text가 필요해요." }, { status: 400 });
  }

  const { data, usedFallback } = await generateJson<CheckinResult>({
    system: SYSTEM,
    prompt: `오늘의 한 줄: ${text}`,
    schema,
    validate: isCheckinResult,
    fallback: { weather: "partly_cloudy", recommendedStageDelta: 0, risk: "normal" },
  });

  // 규칙 결과와 AI 결과 중 더 위험한 쪽을 택함
  const risk = mergeRisk(ruleRisk(text), data.risk);

  await db.query(
    "INSERT INTO checkins (user_id, text, weather, risk) VALUES ($1, $2, $3, $4)",
    [body.userId, text, data.weather, risk],
  );

  return Response.json({
    weather: data.weather,
    recommendedStageDelta: data.recommendedStageDelta,
    risk,
    help: risk === "normal" ? null : HELP_MESSAGE,
    usedFallback,
  });
}
