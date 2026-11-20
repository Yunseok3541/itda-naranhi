-- ERDCloud 가져오기(Import)용 DDL (MySQL 문법)
-- COMMENT가 ERDCloud의 논리명(한글 이름)으로 표시됨
-- ※ 확인용 파일. 실제 DB는 db/init/01_schema.sql(PostgreSQL) 기준이며, 스키마를 바꾸면 이 파일도 함께 수정
-- ※ 운영 DB 변경 이력: db/migrations/ (20261121_reward_points.sql, 20261121_profile_avatar.sql)
-- ※ PostgreSQL 전용 기능(CHECK, 배열, 뷰)은 빠져 있음

CREATE TABLE users (
  id             INT          NOT NULL AUTO_INCREMENT COMMENT '사용자 ID',
  nickname       VARCHAR(30)  NOT NULL COMMENT '닉네임',
  start_answers  JSON         NULL     COMMENT '시작 질문 답(활동 범위·부담 상황·혼자/함께·기댈 사람·생활 형태·필요한 것, 모두 선택)',
  current_stage  SMALLINT     NOT NULL DEFAULT 1 COMMENT '추천 기준 단계(1~6)',
  region_code    CHAR(5)      NULL     COMMENT '법정 시군구 코드',
  birth_year     SMALLINT     NULL     COMMENT '출생연도(선택)',
  policy_info    JSON         NULL     COMMENT '정책 신청 정보(취업·학력·결혼·연소득·해당 상황, 선택, AI 미전송)',
  share_in_sky   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '같은 하늘의 별 집계 동의',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입 시각',
  avatar_constellation_id INT NULL COMMENT '프로필 이미지 별자리 ID(획득한 별자리만, NULL = 기본 캐릭터. 외래키 constellations.id는 PostgreSQL 스키마에만)',
  PRIMARY KEY (id)
) COMMENT '사용자';

CREATE TABLE demo_sessions (
  token_hash    CHAR(64)  NOT NULL COMMENT '쿠키 토큰 SHA-256 해시',
  user_id       INT       NOT NULL COMMENT '사용자 ID',
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  last_seen_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '마지막 사용 시각',
  PRIMARY KEY (token_hash),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '데모 세션';

CREATE TABLE survey_results (
  id          INT       NOT NULL AUTO_INCREMENT COMMENT '검사 결과 ID',
  user_id     INT       NOT NULL COMMENT '사용자 ID',
  answers     JSON      NOT NULL COMMENT '문항별 응답',
  ucla_score  SMALLINT  NOT NULL COMMENT 'UCLA 외로움 점수',
  spin_score  SMALLINT  NOT NULL COMMENT 'Mini-SPIN 점수',
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '점검 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '선택형 마음 점검';

CREATE TABLE constellations (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '별자리 ID',
  stage       SMALLINT     NOT NULL COMMENT '단계(숨겨진 난이도 1~6)',
  name        VARCHAR(50)  NOT NULL COMMENT '별자리 이름',
  theme       VARCHAR(100) NULL     COMMENT '테마',
  star_count  SMALLINT     NOT NULL COMMENT '별 개수',
  PRIMARY KEY (id)
) COMMENT '별자리';

CREATE TABLE stars (
  id                INT          NOT NULL AUTO_INCREMENT COMMENT '별(퀘스트) ID',
  constellation_id  INT          NOT NULL COMMENT '별자리 ID',
  position          SMALLINT     NOT NULL COMMENT '별자리 안 순서',
  title             VARCHAR(100) NOT NULL COMMENT '퀘스트 이름',
  description       TEXT         NULL     COMMENT '퀘스트 설명',
  verify_type       VARCHAR(10)  NOT NULL DEFAULT 'self' COMMENT '기본 확인 방식(self/photo/gps)',
  place_type        VARCHAR(20)  NULL     COMMENT 'GPS 목표 장소 종류',
  category          VARCHAR(10)  NOT NULL DEFAULT 'daily' COMMENT '퀘스트 종류(daily/center/volunteer)',
  is_outside        BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '집 밖 활동 여부(1순위 지표 기준)',
  focus             VARCHAR(10)  NOT NULL DEFAULT 'daily' COMMENT '회복 방향(daily/outing/relation/work)',
  tags              JSON         NOT NULL COMMENT '활동 성향 태그(outdoor/social/career/learning/rest)',
  PRIMARY KEY (id),
  UNIQUE (constellation_id, position),
  FOREIGN KEY (constellation_id) REFERENCES constellations (id) ON DELETE CASCADE
) COMMENT '별(퀘스트)';

CREATE TABLE sub_quests (
  id        INT          NOT NULL AUTO_INCREMENT COMMENT '하위 퀘스트 ID',
  star_id   INT          NOT NULL COMMENT '원래 별 ID',
  position  SMALLINT     NOT NULL COMMENT '순서',
  title     VARCHAR(100) NOT NULL COMMENT '더 작게 해 보기 퀘스트',
  PRIMARY KEY (id),
  UNIQUE (star_id, position),
  UNIQUE (id, star_id),
  FOREIGN KEY (star_id) REFERENCES stars (id) ON DELETE CASCADE
) COMMENT '하위 퀘스트(더 작게 해 보기 목록)';

CREATE TABLE user_constellations (
  user_id           INT      NOT NULL COMMENT '사용자 ID',
  constellation_id  INT      NOT NULL COMMENT '별자리 ID',
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '시작 시각',
  completed_at      DATETIME NULL     COMMENT '완성 시각(도감 등록)',
  PRIMARY KEY (user_id, constellation_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (constellation_id) REFERENCES constellations (id)
) COMMENT '사용자 별자리(도감)';

CREATE TABLE star_attempts (
  id                 INT          NOT NULL AUTO_INCREMENT COMMENT '시도 ID',
  user_id            INT          NOT NULL COMMENT '사용자 ID',
  star_id            INT          NOT NULL COMMENT '별 ID',
  parent_attempt_id  INT          NULL     COMMENT '이어진 원래 시도 ID(더 작게·다른 날·다른 별)',
  sub_quest_id       INT          NULL     COMMENT '하위 퀘스트로 한 시도',
  custom_title       VARCHAR(100) NULL     COMMENT '하위 퀘스트 이름 사본',
  status             VARCHAR(10)  NOT NULL COMMENT '상태(dim 희미한 별/bright 밝은 별)',
  verify_method      VARCHAR(10)  NOT NULL DEFAULT 'self' COMMENT '실제 확인 방식(self/photo/gps)',
  place_id           VARCHAR(30)  NULL     COMMENT '도착 확인 장소 ID(카카오, 센터는 center:ID)',
  place_name         VARCHAR(100) NULL     COMMENT '도착 확인 장소명',
  photo_path         TEXT         NULL     COMMENT '사진 경로(선택)',
  reflection         VARCHAR(300) NULL     COMMENT '회고 한 줄',
  cheer              TEXT         NULL     COMMENT 'AI 맞춤 응원',
  stop_reason        VARCHAR(20)  NULL     COMMENT '손 뻗어 보기 이유',
  next_action        VARCHAR(10)  NULL     COMMENT '사용자가 고른 다음 행동(smaller/retry/swap/stop)',
  suggested_action   VARCHAR(10)  NULL     COMMENT 'AI가 제안한 다음 행동',
  next_sub_quest_id  INT          NULL     COMMENT '더 작게 해 보기로 고른 하위 퀘스트',
  next_star_id       INT          NULL     COMMENT '다른 별로 바꾸기로 고른 별',
  risk               VARCHAR(10)  NULL     COMMENT '회고 위험도(normal/caution/danger)',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '시도 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (star_id) REFERENCES stars (id),
  FOREIGN KEY (parent_attempt_id) REFERENCES star_attempts (id) ON DELETE SET NULL,
  FOREIGN KEY (sub_quest_id, star_id) REFERENCES sub_quests (id, star_id),
  FOREIGN KEY (next_sub_quest_id, star_id) REFERENCES sub_quests (id, star_id),
  FOREIGN KEY (next_star_id) REFERENCES stars (id)
) COMMENT '별 시도 기록';

CREATE TABLE checkins (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '체크인 ID',
  user_id     INT          NOT NULL COMMENT '사용자 ID',
  text        VARCHAR(300) NOT NULL COMMENT '한 줄 일기',
  weather     VARCHAR(20)  NOT NULL COMMENT 'AI가 고른 마음 날씨',
  user_weather VARCHAR(20) NULL COMMENT '사용자가 고친 마음 날씨',
  today_choice VARCHAR(10) NULL COMMENT '오늘의 선택(rest/home/near/out)',
  risk        VARCHAR(10)  NOT NULL COMMENT '위험도(normal/caution/danger)',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '체크인 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '데일리 체크인';

CREATE TABLE daily_recommendations (
  user_id     INT      NOT NULL COMMENT '사용자 ID',
  rec_date    DATE     NOT NULL COMMENT '추천 날짜(한국 시간)',
  star_ids    JSON     NOT NULL COMMENT '추천 별 ID 목록',
  reason      TEXT     NULL     COMMENT '추천 이유',
  items       JSON     NULL     COMMENT '별마다 추천 이유',
  checkin_id  INT      NULL     COMMENT '근거 체크인 ID',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  PRIMARY KEY (user_id, rec_date),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (checkin_id) REFERENCES checkins (id) ON DELETE SET NULL
) COMMENT '오늘의 별 추천';

CREATE TABLE policies (
  id             INT          NOT NULL AUTO_INCREMENT COMMENT '정책 ID',
  source         VARCHAR(20)  NOT NULL COMMENT '출처(youth_policy/welfare)',
  source_id      VARCHAR(100) NOT NULL COMMENT '출처 원본 ID',
  title          TEXT         NOT NULL COMMENT '정책명',
  url            TEXT         NULL     COMMENT '원문 링크',
  region_code    CHAR(5)      NULL     COMMENT '대상 지역(없으면 전국, NN000은 시도 전체)',
  age_min        SMALLINT     NULL     COMMENT '최소 나이',
  age_max        SMALLINT     NULL     COMMENT '최대 나이',
  apply_start    DATE         NULL     COMMENT '신청 시작일',
  apply_end      DATE         NULL     COMMENT '신청 마감일',
  apply_always   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '상시 모집',
  apply_unclear  BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '신청 기간 불명확(원문 확인)',
  category       VARCHAR(30)  NULL     COMMENT '원문 분야',
  apply_method   TEXT         NULL     COMMENT '원문 신청 방법',
  raw            JSON         NOT NULL COMMENT '원본 응답',
  source_updated_at DATETIME  NULL     COMMENT '원문 수정 시각',
  fetched_at     DATETIME     NULL     COMMENT '마지막 수집 시각',
  actionable     BOOLEAN      NULL     COMMENT 'AI 개인이 신청·이용 가능한지',
  summary        TEXT         NULL     COMMENT 'AI 쉬운 말 요약',
  burden         VARCHAR(10)  NULL     COMMENT 'AI 참여 부담(online/phone/visit/group)',
  stage          SMALLINT     NULL     COMMENT 'AI 참여 난이도(1~6, 별 단계와 같은 눈금)',
  difficulty_note VARCHAR(200) NULL    COMMENT '난이도 이유',
  relevance      SMALLINT     NULL     COMMENT 'AI 관련도(0~3)',
  tags           JSON         NULL     COMMENT 'AI 분야 태그',
  classified_at  DATETIME     NULL     COMMENT 'AI 분류 시각',
  PRIMARY KEY (id),
  UNIQUE (source, source_id)
) COMMENT '청년정책·복지서비스';

CREATE TABLE policy_recommendations (
  user_id       INT      NOT NULL COMMENT '사용자 ID',
  rec_date      DATE     NOT NULL COMMENT '추천 날짜(한국 시간)',
  policy_ids    JSON     NOT NULL COMMENT '추천 정책 ID 목록',
  items         JSON     NOT NULL COMMENT '정책마다 추천 이유',
  used_fallback BOOLEAN  NOT NULL DEFAULT FALSE COMMENT 'AI 대신 규칙 순서 사용',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  PRIMARY KEY (user_id, rec_date),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '정책 추천(하루 한 번)';

CREATE TABLE policy_syncs (
  id          INT      NOT NULL AUTO_INCREMENT COMMENT '수집 ID',
  source      VARCHAR(20) NOT NULL COMMENT '출처',
  region_code CHAR(5)  NULL     COMMENT '수집 지역',
  fetched     INT      NOT NULL DEFAULT 0 COMMENT '받은 수',
  kept        INT      NOT NULL DEFAULT 0 COMMENT '시연 범위로 남긴 수',
  inserted    INT      NOT NULL DEFAULT 0 COMMENT '새 정책 수',
  updated     INT      NOT NULL DEFAULT 0 COMMENT '바뀐 정책 수',
  classified  INT      NOT NULL DEFAULT 0 COMMENT 'AI 분류 수',
  started_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '시작 시각',
  finished_at DATETIME NULL     COMMENT '끝난 시각',
  PRIMARY KEY (id)
) COMMENT '정책 수집 기록';

CREATE TABLE policy_events (
  id          INT         NOT NULL AUTO_INCREMENT COMMENT '이벤트 ID',
  user_id     INT         NOT NULL COMMENT '사용자 ID',
  policy_id   INT         NOT NULL COMMENT '정책 ID',
  event       VARCHAR(10) NOT NULL COMMENT '종류(shown 노출/clicked 원문 클릭)',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발생 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (policy_id) REFERENCES policies (id) ON DELETE CASCADE
) COMMENT '정책 노출·클릭 기록';

CREATE TABLE inquiry_drafts (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '초안 ID',
  user_id     INT          NOT NULL COMMENT '사용자 ID',
  center_id   INT          NULL     COMMENT '청년센터 ID',
  question    VARCHAR(300) NULL     COMMENT '궁금한 점',
  draft       TEXT         NOT NULL COMMENT '문의 문장 초안',
  sent_at     DATETIME     NULL     COMMENT '문의했다고 기록한 시각',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '작성 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '문의 문장 초안';

CREATE TABLE youth_centers (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '청년센터 ID',
  source_id    VARCHAR(100) NULL     COMMENT '출처 원본 ID',
  name         VARCHAR(100) NOT NULL COMMENT '센터명',
  address      TEXT         NULL     COMMENT '주소',
  phone        VARCHAR(30)  NULL     COMMENT '전화번호',
  url          TEXT         NULL     COMMENT '홈페이지',
  region_code  CHAR(5)      NULL     COMMENT '시군구 코드',
  lat          DOUBLE       NULL     COMMENT '위도',
  lng          DOUBLE       NULL     COMMENT '경도',
  hours        TEXT         NULL     COMMENT '운영시간(확인된 값만)',
  programs     JSON         NULL     COMMENT '프로그램 목록·요약',
  source_name  VARCHAR(100) NULL     COMMENT '출처 데이터셋',
  source_url   TEXT         NULL     COMMENT '출처 주소',
  basis_date   DATE         NULL     COMMENT '데이터 기준일',
  terms        TEXT         NULL     COMMENT '이용 조건',
  is_sample    BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '시연용 가상 센터',
  PRIMARY KEY (id),
  UNIQUE (source_id)
) COMMENT '청년센터';

CREATE TABLE center_events (
  id          INT         NOT NULL AUTO_INCREMENT COMMENT '이벤트 ID',
  user_id     INT         NOT NULL COMMENT '사용자 ID',
  center_id   INT         NOT NULL COMMENT '청년센터 ID',
  event       VARCHAR(10) NOT NULL COMMENT '종류(viewed 상세 보기/joined 참여했어요)',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발생 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '청년센터 행동 기록';

CREATE TABLE point_events (
  id           INT          NOT NULL AUTO_INCREMENT COMMENT '적립 ID',
  user_id      INT          NOT NULL COMMENT '사용자 ID',
  source       VARCHAR(10)  NOT NULL COMMENT '출처(meteor 유성/checkin 데일리 체크인)',
  ref_key      VARCHAR(40)  NOT NULL COMMENT '중복 방지 키(유성 번호 또는 한국 날짜)',
  points       SMALLINT     NOT NULL COMMENT '받은 포인트(유성 1, 체크인 100)',
  earned_date  DATE         NOT NULL COMMENT '받은 날(한국 날짜, 유성 하루 한도 집계)',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '적립 시각',
  PRIMARY KEY (id),
  UNIQUE (user_id, source, ref_key),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) COMMENT '포인트 적립 기록(유성·체크인)';
