// AI ② 체크인 → 마음 날씨 갱신 + AI ③ 위험 신호 감지
// 다른 AI 기능(별 추천, 회고 응원)도 이 파일과 같은 구조로 만들면 됨:
//   입력 검증 → (규칙) → generateJson(스키마 + 기본값) → DB 저장(실패해도 흐름 유지) → 응답
import { db } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { HELP_MESSAGE, assessRisk, type Risk } from "@/lib/safety";
import { WEATHERS, isWeather, type Weather } from "@/lib/weather";

// 마음 날씨는 참고 기록일 뿐, 추천 난이도는 사용자가 고른 todayChoice를 우선한다 (고민기록 #20)
type CheckinResult = {
  weather: Weather;
  risk: Risk;
};

// "오늘은 어떤 활동이 괜찮을까요?" 쉬어 가기 / 집 안 / 집 근처 / 바깥
const TODAY_CHOICES = ["rest", "home", "near", "out"] as const;
type TodayChoice = (typeof TODAY_CHOICES)[number];

const schema = {
  type: "object",
  properties: {
    weather: { type: "string", enum: [...WEATHERS] },
    risk: { type: "string", enum: ["normal", "caution", "danger"] },
  },
  required: ["weather", "risk"],
};

function isCheckinResult(v: unknown): v is CheckinResult {
  const r = v as CheckinResult;
  return !!r && isWeather(r.weather) && ["normal", "caution", "danger"].includes(r.risk);
}

const SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱의 체크인 분석기다.
사용자의 한 줄 일기를 읽고 오늘의 마음 상태에 가까운 날씨 하나를 제안한다. 사용자가 언제든 고칠 수 있는 참고값이다.
- sunny: 기운 있음 / partly_cloudy: 보통 / cloudy: 지침·무기력 / rainy: 우울·슬픔 / foggy: 혼란·불안
- 자해, 자살, 삶을 끝내고 싶다는 뜻이 보이면 risk=danger, 애매하게 위험해 보이면 caution, 그 외 normal.
진단하거나 조언하지 말고, 지정된 JSON만 출력한다.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { userId?: unknown; text?: unknown; todayChoice?: unknown }
    | null;
  const userId = Number(body?.userId);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const todayChoice = TODAY_CHOICES.includes(body?.todayChoice as TodayChoice)
    ? (body?.todayChoice as TodayChoice)
    : null;  // 선택하지 않아도 체크인은 가능
  if (!Number.isInteger(userId) || userId <= 0 || !text || text.length > 300) {
    return Response.json({ error: "userId와 300자 이하 text가 필요해요." }, { status: 400 });
  }

  const { data, usedFallback } = await generateJson<CheckinResult>({
    system: SYSTEM,
    prompt: `오늘의 한 줄: ${text}`,
    schema,
    validate: isCheckinResult,
    fallback: { weather: "partly_cloudy", risk: "normal" },
  });

  // 규칙과 AI 중 더 위험한 쪽. AI가 실패했으면 기본값(normal)을 믿지 않고 규칙 + 부정 표현으로 판단
  const risk = assessRisk(text, usedFallback ? null : data.risk);

  // DB 저장이 실패해도(DB 꺼짐, 없는 사용자 등) 날씨와 위험 안내는 반드시 응답한다
  let checkinId: number | null = null;
  try {
    const result = await db.query<{ id: number }>(
      "INSERT INTO checkins (user_id, text, weather, today_choice, risk) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [userId, text, data.weather, todayChoice, risk],
    );
    checkinId = result.rows[0]?.id ?? null;
  } catch (error) {
    console.error("[checkin] 저장 실패, 응답은 계속 진행", error);
  }

  return Response.json({
    checkinId,  // null이면 저장 실패 (날씨 직접 고치기 버튼은 숨김)
    weather: data.weather,  // 화면에 "AI가 고른 날씨예요. 다르면 바꿔 주세요"와 함께 표시
    todayChoice,
    risk,
    help: risk === "normal" ? null : HELP_MESSAGE,
    usedFallback,
  });
}
