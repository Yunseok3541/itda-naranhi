// 세팅 확인용: DB 연결, 데모 세션 테이블, Gemini 키 설정 여부를 알려줌
// 키·DB 주소·오류 원문은 응답에 넣지 않는다 (오류는 코드만)
import { db } from "@/lib/db";

export async function GET() {
  let dbStatus = "ok";
  let constellations = 0;
  let demoSessions = "unknown";
  try {
    const { rows } = await db.query<{ count: string; sessions: string | null }>(
      "SELECT (SELECT count(*) FROM constellations) AS count, to_regclass('public.demo_sessions')::text AS sessions",
    );
    constellations = Number(rows[0].count);
    demoSessions = rows[0].sessions
      ? "ready"
      : "missing (db/migrations/20261119_demo_sessions.sql 적용 필요)";
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
    gemini: process.env.GEMINI_API_KEY ? "key set" : "no key (기본값으로 동작)",
    geminiModel: process.env.GEMINI_MODEL ?? "(기본값)",
  });
}
