-- 변경 SQL: 개인 맞춤 정책 추천 (2026-11-20, feat/policy-recommend, 기획: docs/기획/정책추천.md)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 포함
-- 여러 번 실행해도 안전. policies는 아직 비어 있어 기존 데이터에 영향 없음
-- 적용: Neon 콘솔 → SQL Editor에 붙여넣고 Run (또는 psql "$DATABASE_URL" -f 이 파일)
-- 확인: SELECT to_regclass('public.policy_recommendations'), to_regclass('public.policy_syncs');

BEGIN;

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS apply_always      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS apply_method      TEXT,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fetched_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS difficulty_note   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS actionable        BOOLEAN,
  ADD COLUMN IF NOT EXISTS tags              TEXT[];

CREATE TABLE IF NOT EXISTS policy_recommendations (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_date    DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  policy_ids  INT[] NOT NULL,
  items       JSONB NOT NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rec_date)
);

CREATE TABLE IF NOT EXISTS policy_syncs (
  id          SERIAL PRIMARY KEY,
  source      VARCHAR(20) NOT NULL,
  region_code CHAR(5),
  fetched     INT NOT NULL DEFAULT 0,
  kept        INT NOT NULL DEFAULT 0,
  inserted    INT NOT NULL DEFAULT 0,
  updated     INT NOT NULL DEFAULT 0,
  classified  INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_policies_open ON policies (apply_end) WHERE classified_at IS NOT NULL;

COMMIT;
