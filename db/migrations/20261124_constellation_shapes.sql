-- 동기화 SQL: 루트 quests.json → 별자리 11개·별 70개·하위 퀘스트 70개
-- ⚠ 자동 생성 파일: 직접 고치지 말고 루트 quests.json을 고친 뒤 web/에서 `node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts`
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/02_seed.sql에 같은 내용이 있음
-- 순서: 기존 별 동기화(20261121_quests_sync.sql)와 프로필 도감(20261121_profile_avatar.sql) 적용 이후
-- ✅ 기록을 지우지 않음: 별 ID(= quest id)가 그대로라 시도·회고·오늘의 추천·설문은 그대로 남음
--   바뀌는 것: 별자리 이름·테마·단계·별 수, 별의 소속 별자리·순서·문구·확인 방식·바깥 여부·focus·tags, 하위 퀘스트 문구
--   지우는 것: quests.json에 없는 별자리 (별이 하나도 없을 때만)와 그 별자리를 가리키는 user_constellations 줄
-- quests.json을 고칠 때마다 다시 생성되고, Neon에서 다시 실행하면 됨. 여러 번 실행해도 결과가 같음 (한 트랜잭션)
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261124_constellation_shapes.sql
-- 확인: SELECT id, stage, name, star_count FROM constellations ORDER BY id;   → 1 카시오페이아자리, 2 돌고래자리, 3 거문고자리, 4 작은곰자리, 5 토끼자리, 6 여우자리, 7 카멜레온자리, 8 백조자리, 9 독수리자리, 10 화가자리, 11 양자리
--       SELECT count(*) FROM stars;  → 70      SELECT count(*) FROM sub_quests;  → 70

BEGIN;

-- 0. 포인트 변경(20261120_points.sql)이 먼저 들어갔는지 확인
DO $$
BEGIN
  IF to_regclass('public.v_star_points') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stars' AND column_name = 'focus') THEN
    RAISE EXCEPTION '20261120_points.sql을 먼저 적용해 주세요 (v_star_points, stars.focus 없음)';
  END IF;
END $$;

-- 기존 40개 구성으로 완성한 도감 친구는 계속 사용할 수 있도록 획득 날짜를 보관한다.
LOCK TABLE star_attempts IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO user_constellations (user_id, constellation_id, started_at, completed_at)
SELECT user_id, constellation_id, acquired_at, acquired_at
FROM v_user_acquired_constellations
WHERE NOT EXISTS (SELECT 1 FROM stars WHERE id = 41)
ON CONFLICT (user_id, constellation_id) DO UPDATE
SET completed_at = LEAST(user_constellations.completed_at, EXCLUDED.completed_at);

CREATE OR REPLACE VIEW v_user_acquired_constellations AS
WITH first_bright AS (
  SELECT user_id, star_id, min(created_at) AS at
  FROM star_attempts
  WHERE status = 'bright'
  GROUP BY user_id, star_id
), totals AS (
  SELECT constellation_id, count(*) AS stars FROM stars GROUP BY constellation_id
), earned AS (
  SELECT f.user_id, s.constellation_id, max(f.at) AS acquired_at
  FROM first_bright f
  JOIN stars s ON s.id = f.star_id
  JOIN totals t ON t.constellation_id = s.constellation_id
  GROUP BY f.user_id, s.constellation_id, t.stars
  HAVING count(*) = t.stars
)
SELECT user_id, constellation_id, min(acquired_at) AS acquired_at
FROM (
  SELECT user_id, constellation_id, acquired_at FROM earned
  UNION ALL
  SELECT user_id, constellation_id, completed_at FROM user_constellations WHERE completed_at IS NOT NULL
) AS acquisitions
GROUP BY user_id, constellation_id;

-- 1. 별자리 (id = 도감 캐릭터 순서)
INSERT INTO constellations (id, stage, name, theme, star_count) VALUES
  (1, 1, '카시오페이아자리', '하루를 여는 작은 습관', 5),
  (2, 1, '돌고래자리', '나를 돌보는 시간', 5),
  (3, 2, '거문고자리', '현관 너머 한 걸음', 6),
  (4, 4, '작은곰자리', '고요히 쉬는 저녁', 7),
  (5, 2, '토끼자리', '마음에 드는 것 하나', 11),
  (6, 2, '여우자리', '눈에 담아 둔 풍경', 5),
  (7, 4, '카멜레온자리', '오늘의 색 발견하기', 5),
  (8, 3, '백조자리', '내 속도로 흘러가는 시간', 9),
  (9, 4, '독수리자리', '바람을 잠깐 느껴 보기', 8),
  (10, 3, '화가자리', '하루에 색 한 방울', 5),
  (11, 1, '양자리', '첫 걸음의 온기', 4)
ON CONFLICT (id) DO UPDATE SET stage = EXCLUDED.stage, name = EXCLUDED.name, theme = EXCLUDED.theme, star_count = EXCLUDED.star_count;

-- 2. 별: 별자리 안 순서(constellation_id, position)가 서로 겹치지 않게 잠깐 음수 순서로 비켜 둔 뒤 덮어씀
UPDATE stars SET position = -id;
INSERT INTO stars (id, constellation_id, position, title, description, verify_type, place_type, category, is_outside, focus, tags) VALUES
  -- 1단계 · 집 안
  (1, 1, 1, '창문 열고 5분 바깥 공기 쐬기', '창문을 열고 바깥 공기를 5분 느껴 봐요. 나가지 않아도 괜찮아요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (22, 1, 2, '방 한 구석 정리하기', '방 전체가 아니라 한 구석만 정리해요. 5분이면 충분해요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (2, 1, 3, '간단한 요리 하나 해 먹기', '라면이나 계란 요리처럼 간단한 것 하나면 충분해요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest', 'learning']::text[]),
  (5, 1, 4, '쓰레기 버리고 오기', '집 앞 분리수거장까지 다녀와요. 한 봉지면 충분해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor', 'rest']::text[]),
  (21, 1, 5, '좋아하는 노래 한 곡 끝까지 듣기', '좋아하는 노래 한 곡을 처음부터 끝까지 들어요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (24, 2, 1, '해 보고 싶은 일 3가지 적어 보기', '크든 작든 해 보고 싶은 일을 세 가지 적어요. 이룰 계획이 없어도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (3, 2, 2, '관심 있는 직업 영상 하나 보기', '궁금했던 직업을 소개하는 영상 하나를 골라 봐요. 끝까지 안 봐도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (23, 2, 3, '무료 온라인 강의 하나 들어 보기', '관심 있는 무료 강의 하나를 들어 봐요. 나눠서 들어도 괜찮아요.', 'self', NULL, 'daily', false, 'work', ARRAY['learning']::text[]),
  (4, 2, 4, '관심사 커뮤니티에 댓글 하나 남기기', '좋아하는 주제의 글에 짧은 댓글을 남겨 봐요. 한 단어여도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (25, 2, 5, '가족이나 친구에게 안부 문자 보내기', '"잘 지내?" 한마디면 충분해요. 답장을 기다리지 않아도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (67, 11, 1, '숨 한 번 편하게 고르기', '내 속도로 한 번 숨을 고르고 있던 자리에 잠깐 머물러 봐요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (68, 11, 2, '지금 마음에 가까운 날씨 고르기', '지금 마음을 날씨로 빗대어 봐요. 떠오르는 날씨가 없어도 괜찮아요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (69, 11, 3, '오늘의 작은 기억 한 줄 남기기', '지금 눈에 들어온 것이나 오늘 남기고 싶은 일을 한 줄로 적어 봐요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (70, 11, 4, '지금 해 본 작은 일 인정해 주기', '여기까지 와 본 나에게 조용히 한마디 해 주세요. 수고했어요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  -- 2단계 · 집 근처 (혼자 외출)
  (6, 3, 1, '편의점에서 간식 사 먹기', '가까운 편의점에서 먹고 싶은 간식 하나를 골라요. 도착하면 별이 켜져요.', 'gps', 'convenience', 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (26, 3, 2, '동네 빵집에서 빵 하나 사 오기', '동네 빵집에서 마음에 드는 빵 하나를 골라요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (27, 3, 3, '동네 마트에서 장 보기', '필요한 것 몇 가지만 사 와요. 목록을 적어 가면 편해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (30, 3, 4, '미용실 예약하고 머리 자르기', '예약은 앱이나 문자로 해도 돼요. 원하는 스타일은 사진으로 보여 줘도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social']::text[]),
  (41, 3, 5, '집 근처 문구점의 진열대 구경하기', '마음에 드는 물건 하나를 찾아봐요. 사지 않고 나와도 충분해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (42, 3, 6, '동네 가게의 영업시간 알아보기', '가 보고 싶은 가게 하나의 영업시간을 확인해요. 오늘 방문하지 않아도 돼요.', 'self', NULL, 'daily', false, 'outing', ARRAY['outdoor']::text[]),
  (10, 5, 1, '가까운 카페에서 음료 한 잔 사 마시기', '가까운 카페에서 음료 한 잔을 주문해요. 포장해서 나와도 괜찮아요.', 'gps', 'cafe', 'daily', true, 'outing', ARRAY['outdoor', 'social']::text[]),
  (11, 5, 2, '동네 도서관에서 책 한 권 펼쳐 보기', '동네 도서관에서 마음 가는 책을 펼쳐 봐요. 몇 쪽만 읽어도 돼요.', 'gps', 'library', 'daily', true, 'outing', ARRAY['learning']::text[]),
  (29, 5, 3, '동네 서점에서 책 구경하기', '서점에 들러 관심 가는 책을 구경해요. 사지 않아도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['learning', 'outdoor']::text[]),
  (47, 5, 4, '좋아하는 향 하나 찾아보기', '차, 비누, 과일처럼 익숙한 것 중에 기분 좋은 향을 골라요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (48, 5, 5, '나만의 취향 목록 만들기', '좋아하는 맛, 소리, 색 중에서 두세 가지를 적어 봐요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (49, 5, 6, '카페 메뉴에서 처음 보는 음료 찾아보기', '메뉴에서 평소 고르지 않는 음료 하나를 봐요. 주문은 자유예요.', 'self', NULL, 'daily', false, 'outing', ARRAY['outdoor']::text[]),
  (50, 5, 7, '도서관에서 제목만 보고 책 한 권 고르기', '평소 관심 없던 서가에서도 제목이 눈에 띄는 책을 찾아봐요.', 'self', NULL, 'daily', true, 'outing', ARRAY['learning']::text[]),
  (51, 5, 8, '좋아하는 영화 장면 하나 다시 보기', '마음에 남았던 장면만 짧게 보고 무엇이 좋았는지 떠올려요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (52, 5, 9, '동네 가게 유리창에서 마음에 드는 것 발견하기', '유리창 너머로 눈에 들어오는 물건 하나를 찾아봐요. 들어가지 않아도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (53, 5, 10, '평소와 다른 차나 간식을 천천히 맛보기', '한 모금이나 한 입만 맛보고 어떤 맛인지 느껴 봐요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (54, 5, 11, '좋아했던 물건에 얽힌 기억 하나 남기기', '오래 쓴 물건이나 사진을 골라 기억나는 순간 한 줄을 적어요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (7, 6, 1, '3000보 걷기', '동네를 걸으며 3000보를 채워요. 나눠서 걸어도 괜찮아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (28, 6, 2, '집 근처 산책로 한 바퀴 돌기', '집 근처 산책로를 천천히 한 바퀴 걸어요. 중간에 돌아와도 괜찮아요.', 'self', NULL, 'daily', true, 'daily', ARRAY['outdoor', 'rest']::text[]),
  (8, 6, 3, '공원 벤치에 10분 앉아 있기', '가까운 공원 벤치에 앉아 10분 쉬어요. 도착하면 별이 켜져요.', 'gps', 'park', 'daily', true, 'daily', ARRAY['outdoor', 'rest']::text[]),
  (9, 6, 4, '동네 산책하며 사진 3장 찍기', '걷다가 눈에 들어온 것을 세 장 남겨 봐요. 잘 찍지 않아도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (55, 6, 5, '평소와 다른 골목에서 표지판 하나 찾기', '익숙한 길에서 한 번만 다른 쪽으로 돌아 눈에 띄는 표지판을 찾아봐요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  -- 3단계 · 조금 먼 곳, 사람 있는 곳
  (12, 8, 1, '버스나 지하철로 한 정거장 가 보기', '한 정거장만 다녀와요. 사람이 많으면 다음 차를 기다려도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (33, 8, 2, '근처 큰 공원이나 낮은 산 다녀오기', '조금 큰 공원이나 낮은 산에 다녀와요. 도착하면 별이 켜져요.', 'gps', 'park', 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (32, 8, 3, '코인노래방에서 노래 한 곡 부르기', '코인노래방에서 좋아하는 노래 한 곡을 불러요. 혼자라서 편해요.', 'self', NULL, 'daily', true, 'daily', ARRAY['rest', 'outdoor']::text[]),
  (13, 8, 4, '영화관에서 혼자 영화 보기', '보고 싶던 영화를 혼자 봐요. 사람이 적은 시간을 골라도 좋아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor', 'rest']::text[]),
  (31, 8, 5, '처음 가 보는 식당에서 혼자 밥 먹기', '처음 가 보는 식당에서 한 끼를 먹어요. 혼자 먹기 편한 곳을 골라도 좋아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (58, 8, 6, '낯선 정류장 주변에서 잠깐 쉬어 보기', '익숙하지 않은 정류장 근처에서 걷다가 편한 곳을 골라 잠깐 쉬어요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor', 'rest']::text[]),
  (59, 8, 7, '한적한 시간에 시장 한 줄 둘러보기', '붐비지 않는 시간에 시장의 가게 한 줄만 구경하고 돌아와요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (60, 8, 8, '조용한 공연이나 상영 시간을 찾아보기', '관심 있는 프로그램에서 관람하기 편할 것 같은 시간 하나를 골라요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest', 'learning']::text[]),
  (61, 8, 9, '버스 정류장에서 주변 소리 세 가지 듣기', '버스를 기다리는 동안 들리는 소리 세 가지를 천천히 찾아봐요.', 'self', NULL, 'daily', true, 'daily', ARRAY['outdoor', 'rest']::text[]),
  (14, 10, 1, '무료 전시나 박물관 관람하기', '무료로 열리는 전시나 박물관을 둘러봐요. 한 전시실만 봐도 충분해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['learning', 'outdoor']::text[]),
  (15, 10, 2, '동네 행사나 플리마켓 구경하기', '동네 행사나 플리마켓을 구경해요. 사지 않고 둘러보기만 해도 돼요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social', 'outdoor']::text[]),
  (35, 10, 3, '관심 있는 직업의 가게나 공방 구경하기', '해 보고 싶은 일과 닮은 가게나 공방을 구경해요. 밖에서 보기만 해도 괜찮아요.', 'self', NULL, 'daily', true, 'work', ARRAY['career', 'outdoor']::text[]),
  (34, 10, 4, '도서관이나 문화센터 무료 강좌 신청하기', '도서관이나 문화센터의 무료 강좌 하나를 신청해요. 온라인으로 신청해도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['learning']::text[]),
  (16, 10, 5, '원데이 클래스 수강하기', '관심 있는 원데이 클래스를 하나 들어요. 구경하는 마음으로 가도 돼요.', 'self', NULL, 'daily', true, 'relation', ARRAY['learning', 'social']::text[]),
  -- 4단계 · 사람·청년센터
  (17, 4, 1, '청년센터 방문해서 둘러보기', '청년센터에 들러 공간을 둘러봐요. 센터 앞에 도착하면 별이 켜져요.', 'gps', 'youth_center', 'center', true, 'relation', ARRAY['social', 'career']::text[]),
  (37, 4, 2, '진로·취업 상담 받아 보기', '청년센터나 고용센터에서 진로·취업 상담을 받아 봐요. 궁금한 것 하나만 물어봐도 돼요.', 'self', NULL, 'center', true, 'work', ARRAY['career']::text[]),
  (18, 4, 3, '청년센터 프로그램 하나 신청하기', '마음에 드는 프로그램 하나를 신청해요. 나중에 취소해도 괜찮아요.', 'self', NULL, 'center', false, 'relation', ARRAY['social', 'learning']::text[]),
  (43, 4, 4, '저녁에 휴대폰 알림 잠시 쉬게 하기', '방해금지 모드를 잠깐 켜고 조용한 시간을 가져요. 필요하면 바로 풀어도 돼요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (44, 4, 5, '내일 아침에 입을 옷 골라 두기', '내일 손이 갈 것 같은 편한 옷을 한 벌 골라 둬요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (45, 4, 6, '작은 조명만 켜고 저녁 보내기', '밝은 불을 잠시 낮추고 눈이 편한 빛 아래 쉬어 봐요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (46, 4, 7, '잠들기 전 나를 칭찬할 일 하나 적기', '오늘의 사소한 행동 하나를 떠올리고 잘했다고 한마디 남겨요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (19, 7, 1, '소모임이나 독서모임 한 번 참여하기', '관심사가 같은 모임에 한 번 나가 봐요. 일찍 나와도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social']::text[]),
  (38, 7, 2, '스터디나 함께 공부하는 모임 참여하기', '함께 공부하는 모임에 한 번 참여해요. 듣기만 해도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['learning', 'social']::text[]),
  (40, 7, 3, '모임에서 만난 사람에게 다시 연락하기', '모임에서 만난 사람에게 짧은 인사를 보내요. 답이 늦어도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (56, 7, 4, '모임에 가져갈 질문 한 가지 준비하기', '요즘 궁금한 점을 한 줄 적어 둬요. 직접 묻지 않아도 준비만으로 충분해요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social', 'learning']::text[]),
  (57, 7, 5, '관심 있는 모임의 다음 일정 알아보기', '다시 만나거나 새 모임에 가고 싶을 때 볼 수 있도록 날짜를 확인해요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (20, 9, 1, '직업 체험 프로그램이나 설명회 참여하기', '궁금한 일을 직접 보고 들을 수 있는 자리에 가 봐요. 듣기만 해도 충분해요.', 'self', NULL, 'daily', true, 'work', ARRAY['career', 'social']::text[]),
  (39, 9, 2, '단기 아르바이트나 일일 체험 지원하기', '짧게 해 볼 수 있는 일 하나에 지원해요. 지원해 본 것 자체가 한 걸음이에요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (36, 9, 3, '봉사활동 한 번 참여하기', '짧은 봉사활동 하나에 참여해요. 혼자 하는 활동부터 골라도 괜찮아요.', 'self', NULL, 'volunteer', true, 'relation', ARRAY['social', 'career']::text[]),
  (62, 9, 4, '일 경험 공고에서 궁금한 업무 한 줄 표시하기', '일 경험 공고 하나에서 어떤 일을 하는지 읽고 궁금한 업무를 표시해요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (63, 9, 5, '기관에 물어볼 참여 조건 하나 적기', '관심 있는 체험이나 봉사에서 시간, 준비물 등 하나를 질문으로 적어 봐요.', 'self', NULL, 'daily', false, 'work', ARRAY['career', 'learning']::text[]),
  (64, 9, 6, '관심 직무에서 쓰이는 도구 하나 알아보기', '도구 이름과 어떤 일에 쓰이는지 짧게 찾아봐요.', 'self', NULL, 'daily', false, 'work', ARRAY['career', 'learning']::text[]),
  (65, 9, 7, '체험 장소까지 가는 길을 미리 살펴보기', '예정된 체험이 없어도 관심 장소의 교통편과 돌아오는 길을 같이 살펴봐요.', 'self', NULL, 'daily', false, 'outing', ARRAY['outdoor', 'career']::text[]),
  (66, 9, 8, '오늘 해 본 일에서 배운 점 한 가지 적기', '체험, 일, 공부 중 작은 일 하나를 골라 다음에도 써 보고 싶은 점을 적어요.', 'self', NULL, 'daily', false, 'work', ARRAY['career', 'learning']::text[])
ON CONFLICT (id) DO UPDATE SET
  constellation_id = EXCLUDED.constellation_id, position = EXCLUDED.position, title = EXCLUDED.title,
  description = EXCLUDED.description, verify_type = EXCLUDED.verify_type, place_type = EXCLUDED.place_type,
  category = EXCLUDED.category, is_outside = EXCLUDED.is_outside, focus = EXCLUDED.focus, tags = EXCLUDED.tags;

-- quests.json에 없는 별이 DB에 남아 있으면 멈춤 (별을 지우면 시도 기록이 깨지므로 자동으로 지우지 않음)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stars WHERE position < 0) THEN
    RAISE EXCEPTION 'quests.json에 없는 별이 DB에 있어요. 그 별을 quests.json에 다시 넣거나 따로 정리해 주세요';
  END IF;
END $$;

-- 3. 하위 퀘스트 (더 작게 해 보기 = easier_title, 하위 퀘스트 ID = 별 ID)
INSERT INTO sub_quests (id, star_id, position, title) VALUES
  (1, 1, 1, '커튼만 열어 두기'),
  (2, 2, 1, '계란 하나 삶아 먹기'),
  (3, 3, 1, '궁금한 직업 이름 3개 검색해 보기'),
  (4, 4, 1, '글 하나 끝까지 읽기'),
  (5, 5, 1, '쓰레기봉투 묶어서 현관에 두기'),
  (6, 6, 1, '편의점 앞까지만 다녀오기'),
  (7, 7, 1, '1000보 걷기'),
  (8, 8, 1, '3분 앉아 있다 오기'),
  (9, 9, 1, '집 앞에서 사진 1장 찍기'),
  (10, 10, 1, '테이크아웃으로 사서 바로 오기'),
  (11, 11, 1, '도서관 운영 시간과 위치 확인하기'),
  (12, 12, 1, '정류장까지만 가 보기'),
  (13, 13, 1, '보고 싶은 영화 시간표 찾아보기'),
  (14, 14, 1, '가까운 전시 정보 하나 찾아보기'),
  (15, 15, 1, '이번 주 동네 행사 일정 찾아보기'),
  (16, 16, 1, '원데이 클래스 하나 찾아서 찜해 두기'),
  (17, 17, 1, '청년센터에 보낼 문의 문장 써 보기'),
  (18, 18, 1, '프로그램 목록 보고 하나 골라 두기'),
  (19, 19, 1, '모임 하나 찾아서 질문 남기기'),
  (20, 20, 1, '일경험 프로그램 공고 하나 읽어 보기'),
  (21, 21, 1, '듣고 싶은 노래 제목 하나 적어 두기'),
  (22, 22, 1, '책상 위 물건 3개 제자리에 두기'),
  (23, 23, 1, '관심 있는 강의 목록 둘러보기'),
  (24, 24, 1, '해 보고 싶은 일 하나만 적어 보기'),
  (25, 25, 1, '보낼 문장만 써 두기'),
  (26, 26, 1, '빵집 앞을 지나가 보기'),
  (27, 27, 1, '마트에서 우유 하나만 사 오기'),
  (28, 28, 1, '산책로 입구까지만 다녀오기'),
  (29, 29, 1, '가까운 서점 위치 찾아보기'),
  (30, 30, 1, '미용실 가격과 예약 방법 찾아보기'),
  (31, 31, 1, '가 보고 싶은 식당 하나 찾아 두기'),
  (32, 32, 1, '부르고 싶은 노래 골라 두기'),
  (33, 33, 1, '공원 입구까지 가 보기'),
  (34, 34, 1, '강좌 일정표 확인하기'),
  (35, 35, 1, '그런 가게나 공방 하나 찾아보기'),
  (36, 36, 1, '1365에서 할 만한 봉사 하나 찾아보기'),
  (37, 37, 1, '상담 프로그램 안내 읽어 보기'),
  (38, 38, 1, '모임 공고 하나 찾아서 저장해 두기'),
  (39, 39, 1, '공고 하나 찾아서 저장해 두기'),
  (40, 40, 1, '보낼 문장만 써 두기'),
  (41, 41, 1, '문구점 앞에서 간판 보기'),
  (42, 42, 1, '가게 이름 하나만 메모하기'),
  (43, 43, 1, '알림 설정 화면만 열기'),
  (44, 44, 1, '윗옷 하나만 꺼내 두기'),
  (45, 45, 1, '조명 하나의 밝기 낮추기'),
  (46, 46, 1, '자신에게 수고했다고 말해 보기'),
  (47, 47, 1, '집에 있는 차나 비누 향 맡아 보기'),
  (48, 48, 1, '좋아하는 것 한 단어 적기'),
  (49, 49, 1, '메뉴판 사진 한 장 열어 보기'),
  (50, 50, 1, '온라인 도서 목록의 제목 세 개 읽기'),
  (51, 51, 1, '좋아하는 영화 제목 하나 떠올리기'),
  (52, 52, 1, '지도에서 가게 사진 하나 보기'),
  (53, 53, 1, '향이나 색부터 살펴보기'),
  (54, 54, 1, '물건 하나 골라 손에 들어 보기'),
  (55, 55, 1, '평소 길에서 표지판 하나 바라보기'),
  (56, 56, 1, '궁금한 단어 하나 메모하기'),
  (57, 57, 1, '모임 공지 한 개 열어 보기'),
  (58, 58, 1, '지도에서 쉴 만한 장소 하나 찾기'),
  (59, 59, 1, '시장 입구 위치만 확인하기'),
  (60, 60, 1, '프로그램 제목 하나만 읽기'),
  (61, 61, 1, '가장 가까이 들리는 소리 하나 알아차리기'),
  (62, 62, 1, '업무 항목의 제목만 읽기'),
  (63, 63, 1, '모집 안내에서 질문거리 한 단어 찾기'),
  (64, 64, 1, '직무 소개에서 도구 이름 하나 읽기'),
  (65, 65, 1, '지도에서 장소 한 곳에 표시 남기기'),
  (66, 66, 1, '배운 점을 한 단어로 적기'),
  (67, 67, 1, '어깨 힘을 잠깐 빼 보기'),
  (68, 68, 1, '떠오르는 날씨 하나 생각해 보기'),
  (69, 69, 1, '오늘 떠오른 단어 하나 적기'),
  (70, 70, 1, '속으로 수고했다고 말해 보기')
ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title;

-- 4. quests.json에 없는 별자리 지우기 (별이 하나도 없는 것만)
DELETE FROM user_constellations WHERE constellation_id NOT IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
DELETE FROM constellations c
WHERE c.id NOT IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) AND NOT EXISTS (SELECT 1 FROM stars s WHERE s.constellation_id = c.id);

-- 5. 번호 이어 붙이기 (새로 만든 DB와 같은 값)
SELECT setval('constellations_id_seq', 11);
SELECT setval('stars_id_seq', 70);
SELECT setval('sub_quests_id_seq', 70);

COMMIT;
