-- 별자리 사회화 퀘스트 프로토타입 스키마 (PostgreSQL 16)
-- 설계 이유는 상위 폴더의 기술스택.md "DB 설계" 참고

------------------------------------------------------------
-- 1. 사용자와 검사
------------------------------------------------------------

-- 사용자 (프로토타입은 로그인 없이 닉네임만)
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  nickname       VARCHAR(30) NOT NULL,
  level          SMALLINT CHECK (level BETWEEN 1 AND 4),          -- 검사 결과 Lv.1~4 (화면에 노출하지 않음)
  current_stage  SMALLINT NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 6),  -- 열린 가장 높은 단계
  region_code    CHAR(5),                                          -- 법정 시군구 코드 (정책 필터, 같은 하늘의 별)
  birth_year     SMALLINT,                                         -- 정책 나이 조건 필터
  share_in_sky   BOOLEAN NOT NULL DEFAULT false,                   -- 같은 하늘의 별 집계 포함 동의
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 심리 검사 결과 (단축형 UCLA 3문항 + Mini-SPIN 3문항)
CREATE TABLE survey_results (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL,           -- {"ucla":[1,2,3], "spin":[0,2,4]}
  ucla_score  SMALLINT NOT NULL,
  spin_score  SMALLINT NOT NULL,
  level       SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  weather     VARCHAR(20) NOT NULL,     -- 첫 마음 날씨
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 2. 별자리와 별 (미리 정의된 콘텐츠)
------------------------------------------------------------

CREATE TABLE constellations (
  id          SERIAL PRIMARY KEY,
  stage       SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 6),     -- 단계 = 숨겨진 난이도
  name        VARCHAR(50) NOT NULL,
  theme       VARCHAR(100),
  star_count  SMALLINT NOT NULL
);

-- 별 = 퀘스트
CREATE TABLE stars (
  id                SERIAL PRIMARY KEY,
  constellation_id  INT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  position          SMALLINT NOT NULL,
  title             VARCHAR(100) NOT NULL,
  description       TEXT,
  verify_type       VARCHAR(10) NOT NULL DEFAULT 'self'
                    CHECK (verify_type IN ('self', 'photo', 'gps', 'receipt')),
  -- 퀘스트 종류: 일상 / 청년센터 단계별 퀘스트 / 봉사 (청년센터 퀘스트 완료율 지표용)
  category          VARCHAR(10) NOT NULL DEFAULT 'daily'
                    CHECK (category IN ('daily', 'center', 'volunteer')),
  UNIQUE (constellation_id, position)
);

------------------------------------------------------------
-- 3. 사용자의 진행 기록
------------------------------------------------------------

-- 사용자가 고른 별자리 (완성 시 도감 등록)
CREATE TABLE user_constellations (
  user_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  constellation_id  INT NOT NULL REFERENCES constellations(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  PRIMARY KEY (user_id, constellation_id)
);

-- 별 시도 기록: 시도할 때마다 한 줄 (희미한 별 = dim, 밝은 별 = bright)
-- AI가 쪼갠 별: star_id는 원래 별, custom_title에 쪼갠 퀘스트, parent_attempt_id에 실패했던 시도
--   → 쪼갠 별을 완료하면 원래 별이 밝아짐
CREATE TABLE star_attempts (
  id                 SERIAL PRIMARY KEY,
  user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  star_id            INT NOT NULL REFERENCES stars(id),
  parent_attempt_id  INT REFERENCES star_attempts(id),
  custom_title       VARCHAR(100),
  status             VARCHAR(10) NOT NULL CHECK (status IN ('dim', 'bright')),
  photo_path         TEXT,
  reflection         VARCHAR(300),      -- 회고 한 줄
  cheer              TEXT,              -- AI ④ 맞춤 응원
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (parent_attempt_id IS NULL OR custom_title IS NOT NULL)
);

-- 데일리 체크인 (AI ② 마음 날씨, AI ③ 위험 감지)
CREATE TABLE checkins (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        VARCHAR(300) NOT NULL,
  weather     VARCHAR(20) NOT NULL,
  risk        VARCHAR(10) NOT NULL CHECK (risk IN ('normal', 'caution', 'danger')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI ① 오늘의 별 추천 결과 (하루 한 번만 생성해 저장)
-- 새로고침할 때마다 Gemini를 부르지 않게 해서 무료 등급 호출 제한을 아끼고, 추천이 바뀌지 않게 함
CREATE TABLE daily_recommendations (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  star_ids    INT[] NOT NULL,
  reason      TEXT,                     -- 추천 이유 한 줄
  checkin_id  INT REFERENCES checkins(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rec_date)
);

------------------------------------------------------------
-- 4. 공공 데이터 (미리 수집·분류해 저장)
------------------------------------------------------------

-- 청년정책 + 복지서비스 (AI ⑤ 분류 결과 포함)
CREATE TABLE policies (
  id             SERIAL PRIMARY KEY,
  source         VARCHAR(20) NOT NULL CHECK (source IN ('youth_policy', 'welfare')),
  source_id      VARCHAR(100) NOT NULL,
  title          TEXT NOT NULL,
  url            TEXT,
  region_code    CHAR(5),               -- NULL이면 전국
  age_min        SMALLINT,
  age_max        SMALLINT,
  apply_start    DATE,
  apply_end      DATE,                  -- 지난 정책은 노출하지 않음
  raw            JSONB NOT NULL,        -- 원본 응답 (재분류용)
  -- 아래는 AI 분류 결과
  summary        TEXT,                  -- 쉬운 말 요약 (원문 링크와 함께 표시)
  burden         VARCHAR(10) CHECK (burden IN ('online', 'phone', 'visit', 'group')),
  stage          SMALLINT CHECK (stage BETWEEN 1 AND 6),
  relevance      SMALLINT CHECK (relevance BETWEEN 0 AND 3),
  classified_at  TIMESTAMPTZ,
  UNIQUE (source, source_id)
);

-- 청년센터 (지도, 청년센터 단계별 퀘스트)
CREATE TABLE youth_centers (
  id           SERIAL PRIMARY KEY,
  source_id    VARCHAR(100) UNIQUE,
  name         VARCHAR(100) NOT NULL,
  address      TEXT,
  phone        VARCHAR(30),
  url          TEXT,
  region_code  CHAR(5),
  lat          DOUBLE PRECISION,        -- 카카오 주소 검색으로 한 번 변환해 저장
  lng          DOUBLE PRECISION
);

-- 추천 정책 노출·원문 클릭 기록 ("추천 정책 원문 확인 비율" 지표용)
CREATE TABLE policy_events (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id   INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  event       VARCHAR(10) NOT NULL CHECK (event IN ('shown', 'clicked')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 5. 인덱스
------------------------------------------------------------

CREATE INDEX idx_attempts_user_time  ON star_attempts (user_id, created_at DESC);
CREATE INDEX idx_attempts_star_time  ON star_attempts (star_id, created_at);
CREATE INDEX idx_checkins_user_time  ON checkins (user_id, created_at DESC);
CREATE INDEX idx_policies_stage      ON policies (stage, region_code);
CREATE INDEX idx_centers_region      ON youth_centers (region_code);
CREATE INDEX idx_policy_events       ON policy_events (policy_id, event);

------------------------------------------------------------
-- 6. 뷰 (화면과 발표 지표에서 바로 쓰는 조회)
------------------------------------------------------------

-- 사용자별 별 상태: 한 번이라도 완료하면 bright, 시도만 했으면 dim (기록이 없으면 꺼진 별)
CREATE VIEW v_user_star_status AS
SELECT user_id,
       star_id,
       CASE WHEN bool_or(status = 'bright') THEN 'bright' ELSE 'dim' END AS status,
       count(*) AS attempts
FROM star_attempts
GROUP BY user_id, star_id;

-- 같은 하늘의 별: 오늘 별마다 시도한 사람 수 (동의한 사용자만, 구 단위, 5명 미만은 숨김)
CREATE VIEW v_sky_today AS
SELECT u.region_code,
       a.star_id,
       count(DISTINCT a.user_id) AS tried_users
FROM star_attempts a
JOIN users u ON u.id = a.user_id
WHERE u.share_in_sky
  AND a.created_at >= CURRENT_DATE
GROUP BY u.region_code, a.star_id
HAVING count(DISTINCT a.user_id) >= 5;

-- 발표 지표: AI가 쪼갠 별의 완료율
CREATE VIEW v_split_success AS
SELECT count(*)                                   AS split_attempts,
       count(*) FILTER (WHERE status = 'bright')  AS split_bright,
       round(100.0 * count(*) FILTER (WHERE status = 'bright') / NULLIF(count(*), 0), 1) AS success_rate
FROM star_attempts
WHERE parent_attempt_id IS NOT NULL;

-- 발표 지표: 추천 정책 원문 확인 비율 (추천을 본 사용자 중 원문을 연 사용자 비율)
CREATE VIEW v_policy_click_rate AS
SELECT count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'shown')   AS shown_pairs,
       count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'clicked') AS clicked_pairs,
       round(100.0 * count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'clicked')
             / NULLIF(count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'shown'), 0), 1) AS click_rate
FROM policy_events;

-- 발표 지표: 청년센터 퀘스트 완료율 (실제 지원으로의 연결)
CREATE VIEW v_center_quest_rate AS
SELECT count(DISTINCT (a.user_id, a.star_id))                                   AS tried_pairs,
       count(DISTINCT (a.user_id, a.star_id)) FILTER (WHERE a.status = 'bright') AS bright_pairs,
       round(100.0 * count(DISTINCT (a.user_id, a.star_id)) FILTER (WHERE a.status = 'bright')
             / NULLIF(count(DISTINCT (a.user_id, a.star_id)), 0), 1)             AS completion_rate
FROM star_attempts a
JOIN stars s ON s.id = a.star_id
WHERE s.category = 'center';
