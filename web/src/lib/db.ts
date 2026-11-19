import { Pool } from "pg";

// DATABASE_URL: 로컬은 web/.env.local, 배포는 Vercel 환경 변수 (Neon은 -pooler 주소 사용)
// 개발 중 핫 리로드로 연결이 계속 늘어나지 않도록 전역에 하나만 유지
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000, // 서버리스에서 놀고 있는 연결을 오래 붙잡지 않음
  });

if (!globalForDb.pgPool) {
  // Neon이 쉬는 연결을 끊으면 Pool에서 error 이벤트가 난다. 처리하지 않으면 프로세스가 죽으므로 기록만 한다
  db.on("error", (error) => {
    console.error("[db] 유휴 연결 오류", (error as { code?: string }).code ?? "unknown");
  });
}

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = db;
