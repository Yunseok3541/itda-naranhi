-- 변경 SQL: 퀘스트 후 설문 칸 (2026-11-20, feat/survey-preference, 고민기록 #32)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 포함
-- 순서: 20261120_points.sql 다음 (파일 이름 순서). star_attempts 칸 추가만 하므로 앞 변경과 겹치지 않음
-- 여러 번 실행해도 안전. 칸·제약 추가만 하고 기존 기록은 지우거나 고치지 않음 (기존 시도는 설문 없음 = NULL)
-- 적용: Neon 콘솔 → SQL Editor에 붙여넣고 Run (또는 psql "$DATABASE_URL" -f 이 파일)
-- 확인: SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'star_attempts' AND column_name IN ('satisfaction', 'achievement', 'surveyed_at');   → 3줄
--       SELECT conname FROM pg_constraint WHERE conname = 'star_attempts_survey_check';                         → 1줄
--
-- 바뀌는 것
--   star_attempts.satisfaction (만족도 1~5), achievement (성취감 1~5), surveyed_at (설문 저장 시각). 모두 선택
--   제약: 설문 값이 하나라도 있을 때만 surveyed_at이 있음

BEGIN;

-- 칸이 이미 있으면 CHECK까지 통째로 건너뜀 → 제약이 두 번 생기지 않음
ALTER TABLE star_attempts
  ADD COLUMN IF NOT EXISTS satisfaction SMALLINT CHECK (satisfaction BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS achievement  SMALLINT CHECK (achievement BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS surveyed_at  TIMESTAMPTZ;

-- 이름 있는 표 제약은 IF NOT EXISTS가 없어서 있는지 먼저 확인
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_survey_check') THEN
    ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_survey_check
      CHECK ((surveyed_at IS NULL) = (satisfaction IS NULL AND achievement IS NULL));
  END IF;
END $$;

COMMIT;
