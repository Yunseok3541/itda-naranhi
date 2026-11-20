-- 변경 SQL: 프로필 이미지(획득한 별자리의 캐릭터) 저장 칸 + 획득 별자리 뷰 (feat/profile-avatar, 고민기록 #40)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 이미 포함되어 있음
-- 순서: 다른 변경 SQL과 상관없음 (users·constellations·stars·star_attempts만 씀)
-- ✅ 기록을 지우지 않음: users에 칸 1개(NULL = 기본 캐릭터) + 외래키, 뷰 1개 추가
--   새 DB와 다른 점: users 칸 순서만 (ADD COLUMN이라 맨 뒤). 새 DB도 맨 뒤에 두어 같게 맞춤
-- 여러 번 실행해도 결과가 같음. 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않음
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261121_profile_avatar.sql
-- 확인: SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'avatar_constellation_id';  → 1줄
--       SELECT to_regclass('public.v_user_acquired_constellations');  → v_user_acquired_constellations

BEGIN;

-- 1. 프로필 이미지 칸 (db/init/01_schema.sql과 같은 정의, 같은 제약 이름)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_constellation_id INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_avatar_constellation_id_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_avatar_constellation_id_fkey
      FOREIGN KEY (avatar_constellation_id) REFERENCES constellations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. 획득 별자리 뷰 (db/init/01_schema.sql과 같은 정의)
CREATE OR REPLACE VIEW v_user_acquired_constellations AS
WITH first_bright AS (
  SELECT user_id, star_id, min(created_at) AS at
  FROM star_attempts
  WHERE status = 'bright'
  GROUP BY user_id, star_id
), totals AS (
  SELECT constellation_id, count(*) AS stars FROM stars GROUP BY constellation_id
)
SELECT f.user_id,
       s.constellation_id,
       max(f.at) AS acquired_at
FROM first_bright f
JOIN stars s  ON s.id = f.star_id
JOIN totals t ON t.constellation_id = s.constellation_id
GROUP BY f.user_id, s.constellation_id, t.stars
HAVING count(*) = t.stars;

COMMIT;
