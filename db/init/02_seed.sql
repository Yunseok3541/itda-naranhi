-- 별자리 12개 · 별 40개 (원본: 루트 quests.json, 규칙: docs/고민기록.md #31)
-- ⚠ 자동 생성 파일: 직접 고치지 말고 루트 quests.json을 고친 뒤 web/에서 `node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts`
-- 난이도 = constellations.stage (1단계 3개, 2단계 3개, 3단계 3개, 4단계 3개). 별자리 이름은 단계 안에서 랜덤으로 한 번 뽑아 고정
-- 추천 범위는 기존 규칙: gps 별 = 바깥, stage 1 = 집 안, stage 2 이상 = 집 근처 (api/recommendations/service.ts scopeOf)
-- 포인트: 별을 처음 밝히면 그 별자리 난이도 × 10 (뷰 v_star_points). 별자리 합계 = 난이도 × 10 × 별 수
-- 운영 DB(Neon) 교체는 db/migrations/20261120_points.sql (같은 스크립트가 함께 만듦)

INSERT INTO constellations (id, stage, name, theme, star_count) VALUES
  (1, 1, '안드로메다자리', '나를 돌보는 하루', 4),
  (2, 1, '카시오페이아자리', '해 보고 싶은 일 떠올리기', 3),
  (3, 1, '작은곰자리', '바깥과 사람에게 한 뼘', 3),
  (4, 2, '북쪽왕관자리', '동네 한 바퀴', 4),
  (5, 2, '거문고자리', '동네 가게 들르기', 4),
  (6, 2, '독수리자리', '잠깐 머무는 곳', 3),
  (7, 3, '페가수스자리', '조금 멀리 가 보기', 4),
  (8, 3, '목동자리', '혼자서도 즐거운 시간', 3),
  (9, 3, '백조자리', '배우고 구경하기', 3),
  (10, 4, '돌고래자리', '청년센터와 가까워지기', 3),
  (11, 4, '오리온자리', '사람 곁으로, 천천히', 3),
  (12, 4, '큰곰자리', '일과 나눔 경험하기', 3);

SELECT setval('constellations_id_seq', 12);

-- 별 ID = quests.json의 quest id. verify_type 기본 self, gps면 place_type(카카오로 가장 가까운 장소 제안)
-- category: 청년센터 단계별 퀘스트 = center, 봉사 = volunteer, 나머지 daily
-- is_outside: 집 문 밖에서 하는 별 (1순위 지표 "앱 밖 활동")
INSERT INTO stars (id, constellation_id, position, title, description, verify_type, place_type, category, is_outside, focus, tags) VALUES
  -- 1단계 · 집 안
  (1, 1, 1, '창문 열고 5분 바깥 공기 쐬기', '창문을 열고 바깥 공기를 5분 느껴 봐요. 나가지 않아도 괜찮아요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (21, 1, 2, '좋아하는 노래 한 곡 끝까지 듣기', '좋아하는 노래 한 곡을 처음부터 끝까지 들어요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (22, 1, 3, '방 한 구석 정리하기', '방 전체가 아니라 한 구석만 정리해요. 5분이면 충분해요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest']::text[]),
  (2, 1, 4, '간단한 요리 하나 해 먹기', '라면이나 계란 요리처럼 간단한 것 하나면 충분해요.', 'self', NULL, 'daily', false, 'daily', ARRAY['rest', 'learning']::text[]),
  (3, 2, 1, '관심 있는 직업 영상 하나 보기', '궁금했던 직업을 소개하는 영상 하나를 골라 봐요. 끝까지 안 봐도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (24, 2, 2, '해 보고 싶은 일 3가지 적어 보기', '크든 작든 해 보고 싶은 일을 세 가지 적어요. 이룰 계획이 없어도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (23, 2, 3, '무료 온라인 강의 하나 들어 보기', '관심 있는 무료 강의 하나를 들어 봐요. 나눠서 들어도 괜찮아요.', 'self', NULL, 'daily', false, 'work', ARRAY['learning']::text[]),
  (5, 3, 1, '쓰레기 버리고 오기', '집 앞 분리수거장까지 다녀와요. 한 봉지면 충분해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor', 'rest']::text[]),
  (4, 3, 2, '관심사 커뮤니티에 댓글 하나 남기기', '좋아하는 주제의 글에 짧은 댓글을 남겨 봐요. 한 단어여도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (25, 3, 3, '가족이나 친구에게 안부 문자 보내기', '"잘 지내?" 한마디면 충분해요. 답장을 기다리지 않아도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  -- 2단계 · 집 근처 (혼자 외출)
  (7, 4, 1, '3000보 걷기', '동네를 걸으며 3000보를 채워요. 나눠서 걸어도 괜찮아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (28, 4, 2, '집 근처 산책로 한 바퀴 돌기', '집 근처 산책로를 천천히 한 바퀴 걸어요. 중간에 돌아와도 괜찮아요.', 'self', NULL, 'daily', true, 'daily', ARRAY['outdoor', 'rest']::text[]),
  (8, 4, 3, '공원 벤치에 10분 앉아 있기', '가까운 공원 벤치에 앉아 10분 쉬어요. 도착하면 별이 켜져요.', 'gps', 'park', 'daily', true, 'daily', ARRAY['outdoor', 'rest']::text[]),
  (9, 4, 4, '동네 산책하며 사진 3장 찍기', '걷다가 눈에 들어온 것을 세 장 남겨 봐요. 잘 찍지 않아도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (6, 5, 1, '편의점에서 간식 사 먹기', '가까운 편의점에서 먹고 싶은 간식 하나를 골라요. 도착하면 별이 켜져요.', 'gps', 'convenience', 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (26, 5, 2, '동네 빵집에서 빵 하나 사 오기', '동네 빵집에서 마음에 드는 빵 하나를 골라요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (27, 5, 3, '동네 마트에서 장 보기', '필요한 것 몇 가지만 사 와요. 목록을 적어 가면 편해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (30, 5, 4, '미용실 예약하고 머리 자르기', '예약은 앱이나 문자로 해도 돼요. 원하는 스타일은 사진으로 보여 줘도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social']::text[]),
  (10, 6, 1, '가까운 카페에서 음료 한 잔 사 마시기', '가까운 카페에서 음료 한 잔을 주문해요. 포장해서 나와도 괜찮아요.', 'gps', 'cafe', 'daily', true, 'outing', ARRAY['outdoor', 'social']::text[]),
  (11, 6, 2, '동네 도서관에서 책 한 권 펼쳐 보기', '동네 도서관에서 마음 가는 책을 펼쳐 봐요. 몇 쪽만 읽어도 돼요.', 'gps', 'library', 'daily', true, 'outing', ARRAY['learning']::text[]),
  (29, 6, 3, '동네 서점에서 책 구경하기', '서점에 들러 관심 가는 책을 구경해요. 사지 않아도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['learning', 'outdoor']::text[]),
  -- 3단계 · 조금 먼 곳, 사람 있는 곳
  (12, 7, 1, '버스나 지하철로 한 정거장 가 보기', '한 정거장만 다녀와요. 사람이 많으면 다음 차를 기다려도 돼요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (33, 7, 2, '근처 큰 공원이나 낮은 산 다녀오기', '조금 큰 공원이나 낮은 산에 다녀와요. 도착하면 별이 켜져요.', 'gps', 'park', 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (14, 7, 3, '무료 전시나 박물관 관람하기', '무료로 열리는 전시나 박물관을 둘러봐요. 한 전시실만 봐도 충분해요.', 'self', NULL, 'daily', true, 'outing', ARRAY['learning', 'outdoor']::text[]),
  (15, 7, 4, '동네 행사나 플리마켓 구경하기', '동네 행사나 플리마켓을 구경해요. 사지 않고 둘러보기만 해도 돼요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social', 'outdoor']::text[]),
  (32, 8, 1, '코인노래방에서 노래 한 곡 부르기', '코인노래방에서 좋아하는 노래 한 곡을 불러요. 혼자라서 편해요.', 'self', NULL, 'daily', true, 'daily', ARRAY['rest', 'outdoor']::text[]),
  (13, 8, 2, '영화관에서 혼자 영화 보기', '보고 싶던 영화를 혼자 봐요. 사람이 적은 시간을 골라도 좋아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor', 'rest']::text[]),
  (31, 8, 3, '처음 가 보는 식당에서 혼자 밥 먹기', '처음 가 보는 식당에서 한 끼를 먹어요. 혼자 먹기 편한 곳을 골라도 좋아요.', 'self', NULL, 'daily', true, 'outing', ARRAY['outdoor']::text[]),
  (35, 9, 1, '관심 있는 직업의 가게나 공방 구경하기', '해 보고 싶은 일과 닮은 가게나 공방을 구경해요. 밖에서 보기만 해도 괜찮아요.', 'self', NULL, 'daily', true, 'work', ARRAY['career', 'outdoor']::text[]),
  (34, 9, 2, '도서관이나 문화센터 무료 강좌 신청하기', '도서관이나 문화센터의 무료 강좌 하나를 신청해요. 온라인으로 신청해도 돼요.', 'self', NULL, 'daily', false, 'work', ARRAY['learning']::text[]),
  (16, 9, 3, '원데이 클래스 수강하기', '관심 있는 원데이 클래스를 하나 들어요. 구경하는 마음으로 가도 돼요.', 'self', NULL, 'daily', true, 'relation', ARRAY['learning', 'social']::text[]),
  -- 4단계 · 사람·청년센터
  (17, 10, 1, '청년센터 방문해서 둘러보기', '청년센터에 들러 공간을 둘러봐요. 센터 앞에 도착하면 별이 켜져요.', 'gps', 'youth_center', 'center', true, 'relation', ARRAY['social', 'career']::text[]),
  (37, 10, 2, '진로·취업 상담 받아 보기', '청년센터나 고용센터에서 진로·취업 상담을 받아 봐요. 궁금한 것 하나만 물어봐도 돼요.', 'self', NULL, 'center', true, 'work', ARRAY['career']::text[]),
  (18, 10, 3, '청년센터 프로그램 하나 신청하기', '마음에 드는 프로그램 하나를 신청해요. 나중에 취소해도 괜찮아요.', 'self', NULL, 'center', false, 'relation', ARRAY['social', 'learning']::text[]),
  (19, 11, 1, '소모임이나 독서모임 한 번 참여하기', '관심사가 같은 모임에 한 번 나가 봐요. 일찍 나와도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['social']::text[]),
  (38, 11, 2, '스터디나 함께 공부하는 모임 참여하기', '함께 공부하는 모임에 한 번 참여해요. 듣기만 해도 괜찮아요.', 'self', NULL, 'daily', true, 'relation', ARRAY['learning', 'social']::text[]),
  (40, 11, 3, '모임에서 만난 사람에게 다시 연락하기', '모임에서 만난 사람에게 짧은 인사를 보내요. 답이 늦어도 괜찮아요.', 'self', NULL, 'daily', false, 'relation', ARRAY['social']::text[]),
  (20, 12, 1, '직업 체험 프로그램이나 설명회 참여하기', '궁금한 일을 직접 보고 들을 수 있는 자리에 가 봐요. 듣기만 해도 충분해요.', 'self', NULL, 'daily', true, 'work', ARRAY['career', 'social']::text[]),
  (39, 12, 2, '단기 아르바이트나 일일 체험 지원하기', '짧게 해 볼 수 있는 일 하나에 지원해요. 지원해 본 것 자체가 한 걸음이에요.', 'self', NULL, 'daily', false, 'work', ARRAY['career']::text[]),
  (36, 12, 3, '봉사활동 한 번 참여하기', '짧은 봉사활동 하나에 참여해요. 혼자 하는 활동부터 골라도 괜찮아요.', 'self', NULL, 'volunteer', true, 'relation', ARRAY['social', 'career']::text[]);

SELECT setval('stars_id_seq', 40);

-- 더 작게 해 보기용 하위 퀘스트 = quests.json의 easier_title (별마다 1개, 하위 퀘스트 ID = 별 ID)
-- AI ①은 이 목록 안에서만 고름
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
  (40, 40, 1, '보낼 문장만 써 두기');

SELECT setval('sub_quests_id_seq', 40);

-- 사용자는 시드로 만들지 않음 (users.id = 1 고정 사용 금지)
-- 데모 사용자는 POST /api/demo/session 이 브라우저마다 새로 만든다 (web/src/lib/demo-session.ts)
--   새 사용자 초기값: 닉네임 '데모 사용자', current_stage 1, region_code '11440'(데모 지역 서울 마포구)
--   체크인·별 시도·회고는 비어 있는 상태로 시작 (다른 사람 기록을 복제하지 않음)
-- 별자리·별은 모든 사용자가 함께 쓰는 콘텐츠라 위에서 한 번만 넣는다
