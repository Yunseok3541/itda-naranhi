-- ERDCloud 가져오기(Import)용 DDL (MySQL 문법)
-- COMMENT가 ERDCloud의 논리명(한글 이름)으로 표시됨
-- ※ 확인용 파일. 실제 DB는 db/init/01_schema.sql(PostgreSQL) 기준이며, 스키마를 바꾸면 이 파일도 함께 수정
-- ※ PostgreSQL 전용 기능(CHECK, 배열, 뷰)은 빠져 있음

CREATE TABLE users (
  id             INT          NOT NULL AUTO_INCREMENT COMMENT '사용자 ID',
  nickname       VARCHAR(30)  NOT NULL COMMENT '닉네임',
  level          SMALLINT     NULL     COMMENT '검사 레벨(1~4, 비공개)',
  current_stage  SMALLINT     NOT NULL DEFAULT 1 COMMENT '열린 가장 높은 단계(1~6)',
  region_code    CHAR(5)      NULL     COMMENT '법정 시군구 코드',
  birth_year     SMALLINT     NULL     COMMENT '출생연도',
  share_in_sky   BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '같은 하늘의 별 집계 동의',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입 시각',
  PRIMARY KEY (id)
) COMMENT '사용자';

CREATE TABLE survey_results (
  id          INT       NOT NULL AUTO_INCREMENT COMMENT '검사 결과 ID',
  user_id     INT       NOT NULL COMMENT '사용자 ID',
  answers     JSON      NOT NULL COMMENT '문항별 응답',
  ucla_score  SMALLINT  NOT NULL COMMENT 'UCLA 외로움 점수',
  spin_score  SMALLINT  NOT NULL COMMENT 'Mini-SPIN 점수',
  level       SMALLINT  NOT NULL COMMENT '산출 레벨(1~4)',
  weather     VARCHAR(20) NOT NULL COMMENT '첫 마음 날씨',
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '검사 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id)
) COMMENT '심리 검사 결과';

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
  verify_type       VARCHAR(10)  NOT NULL DEFAULT 'self' COMMENT '인증 방식(self/photo/gps/receipt)',
  category          VARCHAR(10)  NOT NULL DEFAULT 'daily' COMMENT '퀘스트 종류(daily/center/volunteer)',
  PRIMARY KEY (id),
  UNIQUE (constellation_id, position),
  FOREIGN KEY (constellation_id) REFERENCES constellations (id)
) COMMENT '별(퀘스트)';

CREATE TABLE user_constellations (
  user_id           INT      NOT NULL COMMENT '사용자 ID',
  constellation_id  INT      NOT NULL COMMENT '별자리 ID',
  started_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '시작 시각',
  completed_at      DATETIME NULL     COMMENT '완성 시각(도감 등록)',
  PRIMARY KEY (user_id, constellation_id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (constellation_id) REFERENCES constellations (id)
) COMMENT '사용자 별자리(도감)';

CREATE TABLE star_attempts (
  id                 INT          NOT NULL AUTO_INCREMENT COMMENT '시도 ID',
  user_id            INT          NOT NULL COMMENT '사용자 ID',
  star_id            INT          NOT NULL COMMENT '별 ID',
  parent_attempt_id  INT          NULL     COMMENT '실패했던 시도 ID(AI 쪼갠 별)',
  custom_title       VARCHAR(100) NULL     COMMENT 'AI가 쪼갠 퀘스트 이름',
  status             VARCHAR(10)  NOT NULL COMMENT '상태(dim 희미한 별/bright 밝은 별)',
  photo_path         TEXT         NULL     COMMENT '인증 사진 경로',
  reflection         VARCHAR(300) NULL     COMMENT '회고 한 줄',
  cheer              TEXT         NULL     COMMENT 'AI 맞춤 응원',
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '시도 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (star_id) REFERENCES stars (id),
  FOREIGN KEY (parent_attempt_id) REFERENCES star_attempts (id)
) COMMENT '별 시도 기록';

CREATE TABLE checkins (
  id          INT          NOT NULL AUTO_INCREMENT COMMENT '체크인 ID',
  user_id     INT          NOT NULL COMMENT '사용자 ID',
  text        VARCHAR(300) NOT NULL COMMENT '한 줄 일기',
  weather     VARCHAR(20)  NOT NULL COMMENT '마음 날씨',
  risk        VARCHAR(10)  NOT NULL COMMENT '위험도(normal/caution/danger)',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '체크인 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id)
) COMMENT '데일리 체크인';

CREATE TABLE daily_recommendations (
  user_id     INT      NOT NULL COMMENT '사용자 ID',
  rec_date    DATE     NOT NULL COMMENT '추천 날짜',
  star_ids    JSON     NOT NULL COMMENT '추천 별 ID 목록',
  reason      TEXT     NULL     COMMENT '추천 이유',
  checkin_id  INT      NULL     COMMENT '근거 체크인 ID',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성 시각',
  PRIMARY KEY (user_id, rec_date),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (checkin_id) REFERENCES checkins (id)
) COMMENT '오늘의 별 추천';

CREATE TABLE policies (
  id             INT          NOT NULL AUTO_INCREMENT COMMENT '정책 ID',
  source         VARCHAR(20)  NOT NULL COMMENT '출처(youth_policy/welfare)',
  source_id      VARCHAR(100) NOT NULL COMMENT '출처 원본 ID',
  title          TEXT         NOT NULL COMMENT '정책명',
  url            TEXT         NULL     COMMENT '원문 링크',
  region_code    CHAR(5)      NULL     COMMENT '시군구 코드(없으면 전국)',
  age_min        SMALLINT     NULL     COMMENT '최소 나이',
  age_max        SMALLINT     NULL     COMMENT '최대 나이',
  apply_start    DATE         NULL     COMMENT '신청 시작일',
  apply_end      DATE         NULL     COMMENT '신청 마감일',
  raw            JSON         NOT NULL COMMENT '원본 응답',
  summary        TEXT         NULL     COMMENT 'AI 쉬운 말 요약',
  burden         VARCHAR(10)  NULL     COMMENT 'AI 참여 부담(online/phone/visit/group)',
  stage          SMALLINT     NULL     COMMENT 'AI 분류 단계(1~6)',
  relevance      SMALLINT     NULL     COMMENT 'AI 관련도(0~3)',
  classified_at  DATETIME     NULL     COMMENT 'AI 분류 시각',
  PRIMARY KEY (id),
  UNIQUE (source, source_id)
) COMMENT '청년정책·복지서비스';

CREATE TABLE policy_events (
  id          INT         NOT NULL AUTO_INCREMENT COMMENT '이벤트 ID',
  user_id     INT         NOT NULL COMMENT '사용자 ID',
  policy_id   INT         NOT NULL COMMENT '정책 ID',
  event       VARCHAR(10) NOT NULL COMMENT '종류(shown 노출/clicked 원문 클릭)',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '발생 시각',
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (policy_id) REFERENCES policies (id)
) COMMENT '정책 노출·클릭 기록';

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
  PRIMARY KEY (id),
  UNIQUE (source_id)
) COMMENT '청년센터';
