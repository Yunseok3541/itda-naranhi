-- 변경 SQL: 데모 세션 테이블 추가 (2026-11-19, feat/demo-platform)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 이미 포함되어 있음
-- 여러 번 실행해도 안전 (IF NOT EXISTS). 기존 테이블·데이터는 건드리지 않음
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261119_demo_sessions.sql
-- 확인: SELECT to_regclass('public.demo_sessions');  → demo_sessions 이 나오면 적용 완료 (/api/health 의 demoSessions 도 "ready")

CREATE TABLE IF NOT EXISTS demo_sessions (
  token_hash    CHAR(64) PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_sessions_user ON demo_sessions (user_id);
