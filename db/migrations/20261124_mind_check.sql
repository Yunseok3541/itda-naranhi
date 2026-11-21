-- 변경 SQL: 마음 짚기 (UCLA 3문항 + LSNS-6 + WHO-5, 고민기록 #56·#57)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 이미 포함되어 있음
-- 순서: 다른 변경 SQL과 상관없음 (survey_results만 씀)
-- ✅ 기록을 지우지 않음: 칸 2개 추가 + 기존 점수 칸의 NOT NULL만 풂 (묶음을 건너뛰면 그 점수는 NULL)
--   spin_score는 더 쓰지 않지만 예전 기록이 있을 수 있어 지우지 않음
-- 여러 번 실행해도 결과가 같음. 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않음
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261124_mind_check.sql
-- 확인: SELECT column_name, is_nullable FROM information_schema.columns
--         WHERE table_name = 'survey_results' AND column_name IN ('ucla_score','spin_score','lsns_score','who5_score') ORDER BY 1;
--       → 4줄, 모두 YES

BEGIN;

ALTER TABLE survey_results ALTER COLUMN ucla_score DROP NOT NULL;
ALTER TABLE survey_results ALTER COLUMN spin_score DROP NOT NULL;
ALTER TABLE survey_results ADD COLUMN IF NOT EXISTS lsns_score SMALLINT;
ALTER TABLE survey_results ADD COLUMN IF NOT EXISTS who5_score SMALLINT;

-- 최근 기록을 빨리 찾기 (사용자별 최근 2개만 읽음)
CREATE INDEX IF NOT EXISTS survey_results_user_created_idx ON survey_results (user_id, created_at DESC);

COMMIT;
