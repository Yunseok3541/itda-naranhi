-- 변경 SQL: 별자리 10개·별 30개로 콘텐츠 교체 + 포인트 뷰 추가 (2026-11-19, feat/points, 고민기록 #28)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql·02_seed.sql에 이미 포함되어 있음
-- ⚠ 되돌릴 수 없음: 별 내용과 ID가 바뀌므로 별을 가리키는 진행 기록을 모두 비운다
--   비우는 것: star_attempts(시도·회고), daily_recommendations(오늘의 추천), user_constellations
--   남는 것: users, demo_sessions, checkins, inquiry_drafts, policies 등 별과 무관한 데이터
--   → 실행 전에 팀에 알리고, 시연 직전에는 실행하지 않는다
-- 여러 번 실행해도 결과가 같음 (매번 같은 상태로 초기화). 전체가 한 트랜잭션이라 중간에 실패하면 아무것도 바뀌지 않음
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261119_points.sql
-- 확인: SELECT stage, count(*) AS constellations, sum(star_count) AS stars FROM constellations GROUP BY stage ORDER BY stage;
--       → 1|1|3, 2|3|6, 3|3|9, 4|3|12 이 나오면 적용 완료.  SELECT to_regclass('public.v_user_points'); → v_user_points

BEGIN;

-- 1. 진행 기록과 기존 콘텐츠 비우기 (ID도 1부터 다시 → 새로 만든 DB와 같은 별 ID)
TRUNCATE daily_recommendations, star_attempts, user_constellations, stars, constellations RESTART IDENTITY;

-- 2. 새 콘텐츠 (db/init/02_seed.sql과 같은 내용)
INSERT INTO constellations (id, stage, name, theme, star_count) VALUES
  (1,  1, '독수리자리',       '방 안에서 여는 하루',       3),
  (2,  2, '카시오페이아자리', '하루를 여는 작은 습관',     2),
  (3,  2, '돌고래자리',       '나를 돌보는 바깥 공기',     2),
  (4,  2, '북쪽왕관자리',     '현관 너머 한 걸음',         2),
  (5,  3, '백조자리',         '동네 한 바퀴',              3),
  (6,  3, '작은곰자리',       '나만의 작은 외출',          3),
  (7,  3, '오리온자리',       '바깥 소식에 귀 기울이기',   3),
  (8,  4, '거문고자리',       '사람 곁으로, 천천히',       4),
  (9,  4, '페가수스자리',     '새로운 걸 배워 보는 날',    4),
  (10, 4, '목동자리',         '함께하는 시간',             4);

SELECT setval('constellations_id_seq', 10);

-- verify_type: 집 안·집 앞은 self(쓰레기는 photo), 장소 도착은 gps + place_type (카카오 로컬로 가장 가까운 장소 제안)
-- category: 청년센터 단계별 퀘스트 = center, 봉사 = volunteer, 나머지 daily
INSERT INTO stars (constellation_id, position, title, description, verify_type, place_type, category) VALUES
  -- 1단계 · 집 안
  (1, 1, '창문 열고 하늘 보기', '창문을 열고 하늘을 잠깐 바라봐요. 1분이면 충분해요.', 'self', NULL, 'daily'),
  (1, 2, '물 한 잔 마시기', '천천히 물 한 잔을 마셔요. 오늘 몸에게 건네는 첫인사예요.', 'self', NULL, 'daily'),
  (1, 3, '5분 스트레칭하기', '몸을 천천히 늘려봐요. 끝까지 못 해도 괜찮아요.', 'self', NULL, 'daily'),

  -- 2단계 · 현관·집 앞
  (2, 1, '현관문 열고 바깥 공기 마시기', '현관문을 열고 바깥 공기를 한 번 들이마셔요. 나가지 않아도 돼요.', 'self', NULL, 'daily'),
  (2, 2, '우편함 확인하기', '우편함까지 다녀와요. 열어 보기만 해도 충분해요.', 'self', NULL, 'daily'),
  (3, 1, '집 앞 계단 한 층 오르내리기', '계단을 한 층만 오르내려요. 천천히 걸어도 괜찮아요.', 'self', NULL, 'daily'),
  (3, 2, '집 앞에서 햇빛 1분 쬐기', '집 앞에 서서 햇빛을 1분 느껴봐요. 흐린 날은 바람도 좋아요.', 'self', NULL, 'daily'),
  (4, 1, '쓰레기 버리고 오기', '집 앞 분리수거장까지 다녀와요. 한 봉지면 충분해요.', 'photo', NULL, 'daily'),
  (4, 2, '현관 앞 5분 서 있기', '현관 밖에서 5분만 머물러요. 힘들면 언제든 들어와도 돼요.', 'self', NULL, 'daily'),

  -- 3단계 · 동네
  (5, 1, '3000보 걷기', '동네를 걸으며 3000보를 채워요. 나눠서 걸어도 괜찮아요.', 'self', NULL, 'daily'),
  (5, 2, '근처 공원 벤치에 10분 앉아 있기', '가까운 공원 벤치에 앉아 10분 쉬어요. 도착하면 별이 켜져요.', 'gps', 'park', 'daily'),
  (5, 3, '편의점에서 음료 하나 사 오기', '가까운 편의점에서 마실 것 하나를 골라요. 도착하면 별이 켜져요.', 'gps', 'convenience', 'daily'),
  (6, 1, '근처 카페에서 커피 사 마시기', '가까운 카페에서 음료 한 잔을 주문해요. 포장해서 나와도 괜찮아요.', 'gps', 'cafe', 'daily'),
  (6, 2, '도서관에서 책 한 권 펼쳐 보기', '동네 도서관에서 마음 가는 책을 펼쳐 봐요. 몇 쪽만 읽어도 돼요.', 'gps', 'library', 'daily'),
  (6, 3, '노래 들으며 15분 산책하기', '좋아하는 노래를 들으며 15분 걸어요. 길을 정하지 않아도 돼요.', 'self', NULL, 'daily'),
  (7, 1, '청년센터 홈페이지에서 프로그램 둘러보기', '어떤 프로그램이 있는지 구경만 해요. 신청하지 않아도 괜찮아요.', 'self', NULL, 'center'),
  (7, 2, '동네 게시판·소식지 읽어 보기', '아파트 게시판이나 동네 소식지를 읽어 봐요. 하나만 읽어도 충분해요.', 'self', NULL, 'daily'),
  (7, 3, '버스 한 정거장 타 보기', '버스를 타고 한 정거장만 다녀와요. 사람이 많으면 다음 차를 기다려도 돼요.', 'self', NULL, 'daily'),

  -- 4단계 · 프로그램·사람
  (8, 1, '지도에서 내 주변 청년센터 찾아보기', '가지 않아도 괜찮아요. 어디에 있는지 위치만 확인해요.', 'self', NULL, 'center'),
  (8, 2, '청년센터 앞까지 가 보기', '들어가지 않아도 괜찮아요. 건물 앞까지만 가 봐요. 도착하면 별이 켜져요.', 'gps', 'youth_center', 'center'),
  (8, 3, '청년센터에 문의해 보기', '궁금한 걸 하나만 물어봐요. 문의 문장 초안을 함께 준비할 수 있어요.', 'self', NULL, 'center'),
  (8, 4, '청년센터 프로그램 하나 신청해 보기', '마음에 드는 프로그램 하나를 신청해요. 나중에 취소해도 괜찮아요.', 'self', NULL, 'center'),
  (9, 1, '원데이 클래스 듣기', '관심 있는 원데이 클래스를 하나 들어요. 구경하는 마음으로 가도 돼요.', 'self', NULL, 'daily'),
  (9, 2, '온라인 강의 하나 끝까지 듣기', '짧은 온라인 강의 하나를 끝까지 들어요. 나눠서 들어도 괜찮아요.', 'self', NULL, 'daily'),
  (9, 3, '서점에서 관심 분야 책 구경하기', '서점에 들러 관심 가는 책을 구경해요. 사지 않아도 돼요.', 'self', NULL, 'daily'),
  (9, 4, '도서관 강좌·독서 모임 알아보기', '동네 도서관의 강좌나 독서 모임 일정을 찾아봐요. 알아보기만 해도 충분해요.', 'self', NULL, 'daily'),
  (10, 1, '1365에서 봉사활동 찾아보기', '1365 자원봉사포털에서 해 볼 만한 봉사를 찾아봐요. 신청은 나중에 해도 돼요.', 'self', NULL, 'volunteer'),
  (10, 2, '봉사활동 하루 참여하기', '짧은 봉사활동 하나에 참여해요. 혼자 하는 활동부터 골라도 괜찮아요.', 'self', NULL, 'volunteer'),
  (10, 3, '가게 점원에게 먼저 인사하기', '가게에 들어가며 "안녕하세요" 한마디를 건네요. 작은 목소리여도 괜찮아요.', 'self', NULL, 'daily'),
  (10, 4, '소모임 한 번 나가 보기', '관심사가 같은 소모임에 한 번 나가 봐요. 일찍 나와도 괜찮아요.', 'self', NULL, 'daily');

-- 3. 포인트 뷰 (db/init/01_schema.sql과 같은 정의)
CREATE OR REPLACE VIEW v_star_points AS
SELECT s.id AS star_id,
       c.stage * 10 AS points
FROM stars s
JOIN constellations c ON c.id = s.constellation_id;

CREATE OR REPLACE VIEW v_user_points AS
SELECT v.user_id,
       sum(p.points)::int AS total_points,
       count(*)::int      AS bright_stars
FROM v_user_star_status v
JOIN v_star_points p ON p.star_id = v.star_id
WHERE v.status = 'bright'
GROUP BY v.user_id;

COMMIT;
