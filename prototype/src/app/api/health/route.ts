// 세팅 확인용: DB 연결과 Gemini 키 설정 여부를 알려줌
import { db } from "@/lib/db";

export async function GET() {
  let dbStatus = "ok";
  let constellations = 0;
  try {
    const { rows } = await db.query<{ count: string }>("SELECT count(*) FROM constellations");
    constellations = Number(rows[0].count);
  } catch (error) {
    const e = error as Error & { code?: string };
    // DB가 꺼져 있으면 message가 비어 있고 code가 ECONNREFUSED로 옴
    dbStatus = `error: ${e.code ?? ""} ${e.message}`.trim();
  }
  return Response.json({
    db: dbStatus,
    constellations,
    gemini: process.env.GEMINI_API_KEY ? "key set" : "no key (기본값으로 동작)",
  });
}
