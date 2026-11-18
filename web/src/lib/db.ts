import { Pool } from "pg";

// 개발 중 핫 리로드로 연결이 계속 늘어나지 않도록 전역에 하나만 유지
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForDb.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = db;
