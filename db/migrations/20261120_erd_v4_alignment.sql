-- 변경 SQL: ERD를 기획 v4에 맞춤 (2026-11-20, feat/erd-v4-alignment)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql, 02_seed.sql에 이미 포함되어 있음
-- 여러 번 실행해도 안전. 사용자·체크인·시도·초안 기록은 지우거나 내용을 고치지 않음 (칸·테이블 추가, 제약·뷰 교체, 콘텐츠 시드만)
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261120_erd_v4_alignment.sql
-- 확인: SELECT id, title FROM stars WHERE place_type = 'youth_center';   → 청년센터 앞까지 가 보기 1줄
--       SELECT count(*) FROM sub_quests;                                  → 8
--       SELECT * FROM v_outside_attempt_rate;  SELECT * FROM v_center_actions;
--
-- 바뀌는 것
--   1. 센터 "앞까지 가 본 별" 시드 추가 (거문고자리 7번째 별, GPS)
--   2. stars.is_outside: 1순위 지표 "앱 밖 활동" 기준. 앱 안에서 하는 청년센터 별(지도·홈페이지 보기)은 제외
--      3-1 "쓰레기 버리고 오기" 확인 방식 photo → self (v4: 바깥은 GPS 기본, 사진은 선택)
--   3. sub_quests: 더 작게 해 보기용 하위 퀘스트 목록 (AI는 이 안에서만 고름)
--   4. center_events: 청년센터 상세 보기(viewed)·참여했어요(joined) 기록
--   5. star_attempts: AI 제안(suggested_action), 고른 대상(next_sub_quest_id·next_star_id), 하위 퀘스트 시도(sub_quest_id), risk
--      custom_title은 하위 퀘스트로 한 시도에만. 원래 시도를 지워도 이어진 시도는 남음(ON DELETE SET NULL)
--   6. daily_recommendations.items, rec_date 기본값 한국 날짜, 체크인을 지워도 추천은 남음(ON DELETE SET NULL)
--   7. youth_centers 출처·운영시간·프로그램·예시 구분 칸 (API명세 "DB 변경 요청" 2번)
--   8. 뷰: v_outside_attempt_rate(분모 = 실제로 시작한 사용자)·v_split_success·v_sky_today 수정,
--      v_center_actions·v_next_action_retry_rate 추가, v4에서 빠진 v_center_quest_rate 삭제

BEGIN;

-- 2. 바깥 별 구분, 사진 확인 별 정리
ALTER TABLE stars ADD COLUMN IF NOT EXISTS is_outside BOOLEAN NOT NULL DEFAULT false;
UPDATE stars SET verify_type = 'self' WHERE constellation_id = 3 AND position = 1 AND verify_type = 'photo';

-- 1. 센터 "앞까지 가 본 별"
UPDATE constellations SET star_count = 7 WHERE id = 3 AND star_count = 6;
INSERT INTO stars (constellation_id, position, title, description, verify_type, place_type, category, is_outside)
VALUES (3, 7, '청년센터 앞까지 가 보기', '들어가지 않아도 괜찮아요. 센터 앞에 도착하면 별을 딸 수 있어요.', 'gps', 'youth_center', 'center', true)
ON CONFLICT (constellation_id, position) DO NOTHING;

UPDATE stars SET is_outside = true
WHERE (constellation_id, position) IN ((3, 1), (3, 2), (3, 3), (3, 4), (3, 6), (3, 7))
  AND NOT is_outside;

-- 3. 하위 퀘스트
CREATE TABLE IF NOT EXISTS sub_quests (
  id        SERIAL PRIMARY KEY,
  star_id   INT NOT NULL REFERENCES stars(id) ON DELETE CASCADE,
  position  SMALLINT NOT NULL,
  title     VARCHAR(100) NOT NULL,
  UNIQUE (star_id, position),
  UNIQUE (id, star_id)
);
INSERT INTO sub_quests (star_id, position, title)
SELECT s.id, v.sub_position, v.title
FROM (VALUES
  (3, 1, 1, '쓰레기를 현관 앞까지만 옮겨 두기'),
  (3, 2, 1, '현관문 열고 1분만 서 있기'),
  (3, 3, 1, '현관문 열고 복도 끝까지만 가 보기'),
  (3, 4, 1, '계단 세 칸만 내려갔다 오기'),
  (3, 6, 1, '사람 적은 시간에 편의점 앞까지만 가 보기'),
  (3, 6, 2, '편의점 가는 길 절반까지만 걸어 보기'),
  (3, 7, 1, '센터 건물이 보이는 곳까지만 가 보기'),
  (3, 7, 2, '지도에서 센터까지 가는 길 미리 보기')
) AS v(constellation_id, star_position, sub_position, title)
JOIN stars s ON s.constellation_id = v.constellation_id AND s.position = v.star_position
ON CONFLICT (star_id, position) DO NOTHING;

-- 4. 청년센터 행동 기록
CREATE TABLE IF NOT EXISTS center_events (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id   INT NOT NULL,
  event       VARCHAR(10) NOT NULL CHECK (event IN ('viewed', 'joined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_center_events      ON center_events (center_id, event);
CREATE INDEX IF NOT EXISTS idx_center_events_user ON center_events (user_id);

-- 5. 시도 기록
ALTER TABLE star_attempts
  ADD COLUMN IF NOT EXISTS sub_quest_id      INT,
  ADD COLUMN IF NOT EXISTS suggested_action  VARCHAR(10) CHECK (suggested_action IN ('smaller', 'retry', 'swap', 'stop')),
  ADD COLUMN IF NOT EXISTS next_sub_quest_id INT,
  ADD COLUMN IF NOT EXISTS next_star_id      INT REFERENCES stars(id),
  ADD COLUMN IF NOT EXISTS risk              VARCHAR(10) CHECK (risk IN ('normal', 'caution', 'danger'));

-- 이어진 시도: 원래 시도를 지워도 남도록
ALTER TABLE star_attempts DROP CONSTRAINT IF EXISTS star_attempts_parent_attempt_id_fkey;
ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_parent_attempt_id_fkey
  FOREIGN KEY (parent_attempt_id) REFERENCES star_attempts(id) ON DELETE SET NULL;

-- 예전 제약 "이어진 시도면 쪼갠 퀘스트 이름 필수"(이름 없이 만들어져 star_attempts_check)를 없애고
-- "하위 퀘스트 이름은 하위 퀘스트로 한 시도에만"으로 바꿈.
-- 지금 API는 custom_title을 쓰지 않아 기존 행은 통과. 혹시 맞지 않는 행이 있으면 지우지 않고 새 행에만 적용(NOT VALID)
ALTER TABLE star_attempts DROP CONSTRAINT IF EXISTS star_attempts_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_sub_quest_fkey') THEN
    ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_sub_quest_fkey
      FOREIGN KEY (sub_quest_id, star_id) REFERENCES sub_quests (id, star_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_next_sub_quest_fkey') THEN
    ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_next_sub_quest_fkey
      FOREIGN KEY (next_sub_quest_id, star_id) REFERENCES sub_quests (id, star_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_custom_title_needs_sub_quest') THEN
    IF EXISTS (SELECT 1 FROM star_attempts WHERE custom_title IS NOT NULL AND sub_quest_id IS NULL) THEN
      ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_custom_title_needs_sub_quest
        CHECK (custom_title IS NULL OR sub_quest_id IS NOT NULL) NOT VALID;
    ELSE
      ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_custom_title_needs_sub_quest
        CHECK (custom_title IS NULL OR sub_quest_id IS NOT NULL);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'star_attempts_next_target_check') THEN
    ALTER TABLE star_attempts ADD CONSTRAINT star_attempts_next_target_check CHECK (
      (next_sub_quest_id IS NULL OR next_action = 'smaller') AND (next_star_id IS NULL OR next_action = 'swap'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_attempts_parent    ON star_attempts (parent_attempt_id) WHERE parent_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attempts_sub_quest ON star_attempts (sub_quest_id) WHERE sub_quest_id IS NOT NULL;

-- 6. 오늘의 별 추천
ALTER TABLE daily_recommendations ADD COLUMN IF NOT EXISTS items JSONB;
ALTER TABLE daily_recommendations ALTER COLUMN rec_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date);
ALTER TABLE daily_recommendations DROP CONSTRAINT IF EXISTS daily_recommendations_checkin_id_fkey;
ALTER TABLE daily_recommendations ADD CONSTRAINT daily_recommendations_checkin_id_fkey
  FOREIGN KEY (checkin_id) REFERENCES checkins(id) ON DELETE SET NULL;

-- 7. 청년센터 출처·상세
ALTER TABLE youth_centers
  ADD COLUMN IF NOT EXISTS hours        TEXT,
  ADD COLUMN IF NOT EXISTS programs     JSONB,
  ADD COLUMN IF NOT EXISTS source_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source_url   TEXT,
  ADD COLUMN IF NOT EXISTS basis_date   DATE,
  ADD COLUMN IF NOT EXISTS terms        TEXT,
  ADD COLUMN IF NOT EXISTS is_sample    BOOLEAN NOT NULL DEFAULT false;

-- 8. 뷰 (정의는 db/init/01_schema.sql과 같음)
DROP VIEW IF EXISTS v_center_quest_rate;

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
WHERE sub_quest_id IS NOT NULL;

DROP VIEW IF EXISTS v_next_action_retry_rate;
CREATE VIEW v_next_action_retry_rate AS
WITH chosen AS (
  SELECT a.next_action,
         CASE WHEN a.suggested_action IS NULL THEN NULL ELSE a.next_action = a.suggested_action END AS followed_ai,
         EXISTS (
           SELECT 1 FROM star_attempts n
           WHERE n.user_id = a.user_id
             AND (n.parent_attempt_id = a.id
                  OR (n.created_at > a.created_at AND (
                        (a.next_action = 'retry'   AND n.star_id = a.star_id)
                     OR (a.next_action = 'smaller' AND n.sub_quest_id = a.next_sub_quest_id)
                     OR (a.next_action = 'swap'    AND n.star_id = a.next_star_id))))
         ) AS retried
  FROM star_attempts a
  WHERE a.status = 'dim'
    AND a.next_action IN ('smaller', 'retry', 'swap')
)
SELECT next_action,
       followed_ai,
       count(*)                                                        AS chosen,
       count(*) FILTER (WHERE retried)                                 AS retried,
       round(100.0 * count(*) FILTER (WHERE retried) / NULLIF(count(*), 0), 1) AS retry_rate
FROM chosen
GROUP BY next_action, followed_ai;

DROP VIEW IF EXISTS v_outside_attempt_rate;
CREATE VIEW v_outside_attempt_rate AS
WITH tried AS (
  SELECT a.user_id FROM star_attempts a JOIN stars s ON s.id = a.star_id WHERE s.is_outside
  UNION
  SELECT user_id FROM inquiry_drafts WHERE sent_at IS NOT NULL
  UNION
  SELECT user_id FROM center_events WHERE event = 'joined'
), started AS (
  SELECT id AS user_id FROM users WHERE start_answers IS NOT NULL
  UNION SELECT user_id FROM checkins
  UNION SELECT user_id FROM star_attempts
  UNION SELECT user_id FROM inquiry_drafts
  UNION SELECT user_id FROM center_events
)
SELECT (SELECT count(*) FROM started)                                  AS users,
       (SELECT count(*) FROM tried)                                    AS tried_users,
       round(100.0 * (SELECT count(*) FROM tried) / NULLIF((SELECT count(*) FROM started), 0), 1) AS attempt_rate;

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
