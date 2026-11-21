// 세팅 확인용: DB 연결, 데모 세션 테이블, Gemini 키 설정 여부를 알려줌
// 키·DB 주소·오류 원문은 응답에 넣지 않는다 (오류는 코드만)
import { db } from "@/lib/db";
import { HELPER_MODEL } from "@/app/api/policies/helper";
import { ACTIVE_MODEL, AI_PROVIDER, OPENAI_MODEL } from "@/lib/gemini";

export async function GET() {
  let dbStatus = "ok";
  let constellations = 0;
  let demoSessions = "unknown";
  let pointEvents = "unknown";
  let mindCheck = "unknown";
  try {
    const { rows } = await db.query<{ count: string; sessions: string | null; points: string | null; mind_ready: boolean }>(
      `SELECT (SELECT count(*) FROM constellations) AS count, to_regclass('public.demo_sessions')::text AS sessions,
              to_regclass('public.point_events')::text AS points,
              (SELECT count(*) = 4 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'survey_results' AND is_nullable = 'YES'
                 AND column_name IN ('ucla_score', 'spin_score', 'lsns_score', 'who5_score')) AS mind_ready`,
    );
    constellations = Number(rows[0].count);
    demoSessions = rows[0].sessions
      ? "ready"
      : "missing (db/migrations/20261119_demo_sessions.sql 적용 필요)";
    // 유성·체크인 포인트 적립 기록 (없으면 유성 API는 500, 체크인은 포인트만 null로 응답)
    pointEvents = rows[0].points ? "ready" : "missing (db/migrations/20261121_reward_points.sql 적용 필요)";
    mindCheck = rows[0].mind_ready ? "ready" : "missing (db/migrations/20261124_mind_check.sql 적용 필요)";
  } catch (error) {
    const e = error as Error & { code?: string };
    // DB가 꺼져 있으면 code가 ECONNREFUSED, 주소 설정이 없으면 code 없이 옴
    dbStatus = `error: ${e.code ?? "unknown"}`;
    console.error("[health] DB 확인 실패", e.code ?? "unknown");
  }
  return Response.json({
    db: dbStatus,
    constellations,
    demoSessions,
    pointEvents,
    mindCheck,
    // AI 제공자: gemini(배포, 무료) / openai(개발·시연, GMS). 키 값은 넣지 않고 있는지만
    aiProvider: AI_PROVIDER,
    aiModel: ACTIVE_MODEL,
    aiKey: (AI_PROVIDER === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY) ? "key set" : "no key (기본값으로 동작)",
    gemini: process.env.GEMINI_API_KEY ? "key set" : "no key (기본값으로 동작)",
    geminiModel: process.env.GEMINI_MODEL ?? "(기본값)",
    // 신청 도우미 챗봇 모델 (키가 없으면 AI 버튼은 기본 문장, 응답 aiStatus = no_key)
    helperModel: AI_PROVIDER === "openai" ? OPENAI_MODEL : HELPER_MODEL,
  });
}
