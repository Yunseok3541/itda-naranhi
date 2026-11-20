-- 변경 SQL: 유성(+1)·데일리 체크인(+100) 포인트 적립 기록 + 총 포인트 뷰에 합산 (feat/meteor-points, 고민기록 #32)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 이미 포함되어 있음
-- 순서: 20261120_points.sql 다음 (v_user_points가 필요). 없으면 처음에 멈추고 아무것도 바꾸지 않음
--       20261121_quests_sync.sql과는 순서 상관없음
-- ✅ 기록을 지우지 않음: 테이블 1개 추가, 뷰 v_user_points의 계산에 유성·체크인 합계를 더하고 칸 3개를 뒤에 덧붙임
--   앞 세 칸(user_id, total_points, bright_stars)은 그대로라 기존 쿼리는 고치지 않아도 됨
--   적용 전에 받은 별 포인트는 그대로. 체크인 포인트는 적용한 뒤 체크인부터 쌓임 (지난 체크인을 소급해 주지 않음)
-- 여러 번 실행해도 결과가 같음. 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않음
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261121_reward_points.sql
-- 확인: SELECT to_regclass('public.point_events');  → point_events
--       SELECT column_name FROM information_schema.columns WHERE table_name = 'v_user_points' ORDER BY ordinal_position;
--       → user_id, total_points, bright_stars, star_points, meteor_points, checkin_points

BEGIN;

-- 0. 포인트 변경(20261120_points.sql)이 먼저 들어갔는지 확인
DO $$
BEGIN
  IF to_regclass('public.v_user_points') IS NULL OR to_regclass('public.v_star_points') IS NULL THEN
    RAISE EXCEPTION '20261120_points.sql을 먼저 적용해 주세요 (v_user_points, v_star_points 없음)';
  END IF;
END $$;

-- 1. 적립 기록 (db/init/01_schema.sql과 같은 정의)
CREATE TABLE IF NOT EXISTS point_events (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       VARCHAR(10) NOT NULL CHECK (source IN ('meteor', 'checkin')),
  ref_key      VARCHAR(40) NOT NULL,
  points       SMALLINT NOT NULL CHECK (points > 0),
  earned_date  DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_point_events_day ON point_events (user_id, source, earned_date);

-- 2. 총 포인트 뷰 (db/init/01_schema.sql과 같은 정의). 앞 세 칸 이름·타입이 같아 CREATE OR REPLACE로 바꿀 수 있음
CREATE OR REPLACE VIEW v_user_points AS
WITH star AS (
  SELECT v.user_id, sum(p.points)::int AS star_points, count(*)::int AS bright_stars
  FROM v_user_star_status v
  JOIN v_star_points p ON p.star_id = v.star_id
  WHERE v.status = 'bright'
  GROUP BY v.user_id
), ev AS (
  SELECT user_id,
         COALESCE(sum(points) FILTER (WHERE source = 'meteor'), 0)::int  AS meteor_points,
         COALESCE(sum(points) FILTER (WHERE source = 'checkin'), 0)::int AS checkin_points
  FROM point_events
  GROUP BY user_id
)
SELECT COALESCE(s.user_id, e.user_id)                                                       AS user_id,
       (COALESCE(s.star_points, 0) + COALESCE(e.meteor_points, 0) + COALESCE(e.checkin_points, 0))::int AS total_points,
       COALESCE(s.bright_stars, 0)::int                                                     AS bright_stars,
       COALESCE(s.star_points, 0)::int                                                      AS star_points,
       COALESCE(e.meteor_points, 0)::int                                                    AS meteor_points,
       COALESCE(e.checkin_points, 0)::int                                                   AS checkin_points
FROM star s
FULL JOIN ev e ON e.user_id = s.user_id;

COMMIT;
