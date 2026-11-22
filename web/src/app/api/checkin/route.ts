// AI ② 체크인 → 마음 날씨 갱신 + AI ③ 위험 신호 감지 + 오늘 필요한 것(정책 추천 참고, 고민기록 #47)
// 다른 AI 기능(별 추천, 회고 응원)도 이 파일과 같은 구조로 만들면 됨:
//   입력 검증 → (규칙) → generateJson(스키마 + 기본값) → DB 저장(실패해도 흐름 유지) → 응답
import { db } from "@/lib/db";
import { demoSessionRequired, lookupDemoSession } from "@/lib/demo-session";
import { analyzeCheckin, NEED_LABEL } from "@/lib/checkin-ai";
import { HELP_MESSAGE, assessRisk } from "@/lib/safety";
import { awardCheckinPoints } from "../_lib/points";
import { todayKst } from "../_lib/http";

// 마음 날씨는 참고 기록일 뿐, 추천 난이도는 사용자가 고른 todayChoice를 우선한다 (고민기록 #20)
// 지시문·응답 형식은 @/lib/checkin-ai (위험 감지 평가와 같은 지시문을 쓰려고 옮김, 고민기록 #47)

// "오늘은 어떤 활동이 괜찮을까요?" 쉬어 가기 / 집 안 / 집 근처 / 바깥
const TODAY_CHOICES = ["rest", "home", "near", "out"] as const;
type TodayChoice = (typeof TODAY_CHOICES)[number];

export async function GET() {
  const session = await lookupDemoSession();
  if (session.status === "none") return demoSessionRequired();
  const headers = { "Cache-Control": "private, no-store" };
  const unavailable = () => Response.json({ error: "한 줄 기록을 불러오지 못했어요." }, { status: 503, headers });
  if (session.status === "error") return unavailable();
  try {
    const { rows } = await db.query(
      `SELECT id, text, COALESCE(user_weather, weather) AS weather, created_at AS date
       FROM checkins WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
      [session.userId],
    );
    return Response.json({ checkins: rows }, { headers });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  // 사용자는 요청 본문이 아니라 데모 세션 쿠키로 정한다.
  // 예전 클라이언트가 userId를 보내도 무시한다 (다른 사람 이름으로 저장할 수 없음)
  const body = (await request.json().catch(() => null)) as
    | { text?: unknown; todayChoice?: unknown }
    | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const todayChoice = TODAY_CHOICES.includes(body?.todayChoice as TodayChoice)
    ? (body?.todayChoice as TodayChoice)
    : null;  // 선택하지 않아도 체크인은 가능

  const session = await lookupDemoSession();
  if (session.status === "none") {
    // 세션이 없어도 위기 표현이면 도움받을 곳은 알려 준다 (규칙만 사용, AI 호출·저장 없음)
    const ruleOnly = text ? assessRisk(text, null) : "normal";
    return demoSessionRequired(ruleOnly === "normal" ? undefined : { risk: ruleOnly, help: HELP_MESSAGE });
  }
  // session.status === "error"(DB 장애)이면 저장만 건너뛰고 날씨·위험 안내는 그대로 응답한다
  const userId = session.status === "ok" ? session.userId : null;

  if (!text || text.length > 300) {
    return Response.json({ error: "300자 이하 text가 필요해요." }, { status: 400 });
  }

  const ai = await analyzeCheckin(text);
  const { usedFallback, modelVersion } = ai;
  const data = { weather: ai.weather };

  // 규칙과 AI 중 더 위험한 쪽. AI가 실패했으면 기본값(normal)을 믿지 않고 규칙 + 부정 표현으로 판단
  const risk = assessRisk(text, usedFallback ? null : ai.aiRisk);
  // 오늘 필요한 것 → 정책 추천에 참고 (고민기록 #47). 위험하면 정책을 내밀지 않음
  const needs = risk === "danger" ? [] : ai.needs;

  // DB 저장이 실패해도(DB 꺼짐, 세션 확인 실패 등) 날씨와 위험 안내는 반드시 응답한다
  let checkinId: number | null = null;
  if (userId !== null) {
    try {
      const result = await db.query<{ id: number }>(
        "INSERT INTO checkins (user_id, text, weather, today_choice, risk, needs) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [userId, text, data.weather, todayChoice, risk, needs],
      );
      checkinId = result.rows[0]?.id ?? null;
      // 필요한 것이 생겼으면 오늘 저장된 정책 추천을 지워 다음에 열 때 새로 만들게 (하루 한 번 저장이라 그대로 두면 반영 안 됨)
      if (needs.length) {
        await db.query("DELETE FROM policy_recommendations WHERE user_id = $1 AND rec_date = $2::date", [userId, todayKst()])
          .catch((error) => console.error("[checkin] 오늘 정책 추천 비우기 실패", (error as { code?: string }).code ?? "unknown"));
      }
    } catch (error) {
      console.error("[checkin] 저장 실패, 응답은 계속 진행", (error as { code?: string }).code ?? "unknown");
    }
  }

  // 데일리 체크인 포인트 (+100, 한국 날짜 기준 하루 한 번, 고민기록 #32). 체크인이 저장됐을 때만 준다
  // 체크인과 따로 저장하므로 포인트 저장이 실패해도(예: 변경 SQL 적용 전) 체크인 응답은 그대로 나간다 → 이때 null
  let points: { pointsEarned: number; totalPoints: number } | null = null;
  if (userId !== null && checkinId !== null) {
    try {
      points = await awardCheckinPoints(userId);
    } catch (error) {
      console.error("[checkin] 포인트 저장 실패, 응답은 계속 진행", (error as { code?: string }).code ?? "unknown");
    }
  }

  return Response.json({
    checkinId,  // null이면 저장 실패 (날씨 직접 고치기 버튼은 숨김)
    weather: data.weather,  // 화면에 "AI가 고른 날씨예요. 다르면 바꿔 주세요"와 함께 표시
    todayChoice,
    risk,
    // 오늘 필요한 것 (정책 추천에 참고, 고민기록 #47). 위험하면 빈 배열
    needs: needs.map((n) => ({ key: n, label: NEED_LABEL[n] })),
    pointsEarned: points?.pointsEarned ?? null,  // 오늘 첫 체크인이면 100, 이미 받았으면 0, 저장 실패면 null
    totalPoints: points?.totalPoints ?? null,    // 이 체크인까지 포함한 총 포인트 (별 + 유성 + 체크인), 저장 실패면 null
    help: risk === "normal" ? null : HELP_MESSAGE,
    usedFallback,
    modelVersion,  // 실제로 응답한 모델 버전 (기본값을 썼으면 null). 검증 기록용, 화면에서 쓰지 않음
  });
}
