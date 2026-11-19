-- 변경 SQL: ERD를 기획 v4에 맞춤 (2026-11-20, feat/erd-v4-alignment)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql, 02_seed.sql에 이미 포함되어 있음
-- 여러 번 실행해도 안전. 기존 사용자·체크인·시도·초안 기록은 지우거나 고치지 않음 (칸 추가, 뷰 교체, 콘텐츠 별 1개 추가만)
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261120_erd_v4_alignment.sql
-- 확인: SELECT id, title FROM stars WHERE place_type = 'youth_center';   → 청년센터 앞까지 가 보기 1줄
--       SELECT * FROM v_outside_attempt_rate;  SELECT * FROM v_center_actions;
--
-- 바뀌는 것
--   1. 센터 "앞까지 가 본 별" 시드 추가 (거문고자리 7번째 별, GPS)
--   2. stars.is_outside: 1순위 지표 "앱 밖 활동" 기준. 앱 안에서 하는 청년센터 별(지도·홈페이지 보기)은 제외
--   3. center_events: 청년센터 상세 보기(viewed)·참여했어요(joined) 기록
--   4. star_attempts.parent_attempt_id를 다음 행동(smaller·retry·swap)으로 이어진 시도 전체에 쓰도록 제약 완화, risk 칸 추가
--   5. daily_recommendations.items, rec_date 기본값 한국 날짜
--   6. youth_centers 출처·운영시간·프로그램·예시 구분 칸 (API명세 "DB 변경 요청" 2번)
--   7. 뷰: v_outside_attempt_rate·v_split_success·v_sky_today 수정, v_center_actions·v_next_action_retry_rate 추가

BEGIN;

-- 2. 바깥 별 구분
ALTER TABLE stars ADD COLUMN IF NOT EXISTS is_outside BOOLEAN NOT NULL DEFAULT false;

-- 1. 센터 "앞까지 가 본 별"
UPDATE constellations SET star_count = 7 WHERE id = 3 AND star_count = 6;
INSERT INTO stars (constellation_id, position, title, description, verify_type, place_type, category, is_outside)
VALUES (3, 7, '청년센터 앞까지 가 보기', '들어가지 않아도 괜찮아요. 센터 앞에 도착하면 별을 딸 수 있어요.', 'gps', 'youth_center', 'center', true)
ON CONFLICT (constellation_id, position) DO NOTHING;

UPDATE stars SET is_outside = true
WHERE (constellation_id, position) IN ((3, 1), (3, 2), (3, 3), (3, 4), (3, 6), (3, 7))
  AND NOT is_outside;

-- 3. 청년센터 행동 기록
CREATE TABLE IF NOT EXISTS center_events (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id   INT NOT NULL,
  event       VARCHAR(10) NOT NULL CHECK (event IN ('viewed', 'joined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_center_events      ON center_events (center_id, event);
CREATE INDEX IF NOT EXISTS idx_center_events_user ON center_events (user_id);

-- 4. 시도 기록
--    기존 제약 "이어진 시도면 쪼갠 퀘스트 이름 필수"(이름 없이 만들어져 star_attempts_check)를
--    "쪼갠 퀘스트 이름이 있으면 이어진 시도여야 함"으로 바꿈.
--    지금 API는 custom_title을 쓰지 않아 기존 행은 통과. 혹시 맞지 않는 행이 있으면 지우지 않고 새 행에만 적용(NOT VALID)
ALTER TABLE star_attempts DROP CONSTRAINT IF EXISTS star_attempts_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_custom_title_needs_parent') THEN
    IF EXISTS (SELECT 1 FROM star_attempts WHERE custom_title IS NOT NULL AND parent_attempt_id IS NULL) THEN
      ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_custom_title_needs_parent
        CHECK (custom_title IS NULL OR parent_attempt_id IS NOT NULL) NOT VALID;
    ELSE
      ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_custom_title_needs_parent
        CHECK (custom_title IS NULL OR parent_attempt_id IS NOT NULL);
    END IF;
  END IF;
END $$;
ALTER TABLE star_attempts ADD COLUMN IF NOT EXISTS risk VARCHAR(10) CHECK (risk IN ('normal', 'caution', 'danger'));
CREATE INDEX IF NOT EXISTS idx_attempts_parent ON star_attempts (parent_attempt_id) WHERE parent_attempt_id IS NOT NULL;

-- 5. 오늘의 별 추천
ALTER TABLE daily_recommendations ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE daily_recommendations ALTER COLUMN rec_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date);

-- 6. 청년센터 출처·상세
ALTER TABLE youth_centers
  ADD COLUMN IF NOT EXISTS hours        TEXT,
  ADD COLUMN IF NOT EXISTS programs     JSONB,
  ADD COLUMN IF NOT EXISTS source_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source_url   TEXT,
  ADD COLUMN IF NOT EXISTS basis_date   DATE,
  ADD COLUMN IF NOT EXISTS terms        TEXT,
  ADD COLUMN IF NOT EXISTS is_sample    BOOLEAN NOT NULL DEFAULT false;

-- 7. 뷰 (정의는 db/init/01_schema.sql과 같음)
DROP VIEW IF EXISTS v_sky_today;
CREATE VIEW v_sky_today AS
SELECT u.region_code,
       a.star_id,
       count(DISTINCT a.user_id) AS tried_users
FROM star_attempts a
JOIN users u ON u.id = a.user_id
WHERE u.share_in_sky
  AND a.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')
GROUP BY u.region_code, a.star_id
HAVING count(DISTINCT a.user_id) >= 5;

DROP VIEW IF EXISTS v_split_success;
CREATE VIEW v_split_success AS
SELECT count(*)                                   AS split_attempts,
       count(*) FILTER (WHERE status = 'bright')  AS split_bright,
       round(100.0 * count(*) FILTER (WHERE status = 'bright') / NULLIF(count(*), 0), 1) AS success_rate
FROM star_attempts
WHERE parent_attempt_id IS NOT NULL
  AND custom_title IS NOT NULL;

DROP VIEW IF EXISTS v_next_action_retry_rate;
CREATE VIEW v_next_action_retry_rate AS
SELECT a.next_action,
       count(*) AS chosen,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM star_attempts n
         WHERE n.user_id = a.user_id
           AND (n.parent_attempt_id = a.id
                OR (a.next_action = 'retry' AND n.star_id = a.star_id AND n.created_at > a.created_at))
       )) AS retried,
       round(100.0 * count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM star_attempts n
         WHERE n.user_id = a.user_id
           AND (n.parent_attempt_id = a.id
                OR (a.next_action = 'retry' AND n.star_id = a.star_id AND n.created_at > a.created_at))
       )) / NULLIF(count(*), 0), 1) AS retry_rate
FROM star_attempts a
WHERE a.status = 'dim'
  AND a.next_action IN ('smaller', 'retry', 'swap')
GROUP BY a.next_action;

DROP VIEW IF EXISTS v_outside_attempt_rate;
CREATE VIEW v_outside_attempt_rate AS
WITH tried AS (
  SELECT a.user_id FROM star_attempts a JOIN stars s ON s.id = a.star_id WHERE s.is_outside
  UNION
  SELECT user_id FROM inquiry_drafts WHERE sent_at IS NOT NULL
  UNION
  SELECT user_id FROM center_events WHERE event = 'joined'
)
SELECT (SELECT count(*) FROM users)                                    AS users,
       (SELECT count(*) FROM tried)                                    AS tried_users,
       round(100.0 * (SELECT count(*) FROM tried) / NULLIF((SELECT count(*) FROM users), 0), 1) AS attempt_rate;

DROP VIEW IF EXISTS v_center_actions;
CREATE VIEW v_center_actions AS
SELECT 'viewed' AS action, count(*) AS records, count(DISTINCT user_id) AS users
FROM center_events WHERE event = 'viewed'
UNION ALL
SELECT 'drafted', count(*), count(DISTINCT user_id) FROM inquiry_drafts
UNION ALL
SELECT 'arrived', count(*), count(DISTINCT a.user_id)
FROM star_attempts a JOIN stars s ON s.id = a.star_id
WHERE s.category = 'center' AND s.is_outside AND a.status = 'bright'
UNION ALL
SELECT 'sent', count(*), count(DISTINCT user_id) FROM inquiry_drafts WHERE sent_at IS NOT NULL
UNION ALL
SELECT 'joined', count(*), count(DISTINCT user_id) FROM center_events WHERE event = 'joined';

COMMIT;
