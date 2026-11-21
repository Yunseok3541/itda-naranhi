-- 별자리 사회화 퀘스트 프로토타입 스키마 (PostgreSQL 16)
-- 설계 이유는 docs/기술스택.md "DB 설계" 참고

------------------------------------------------------------
-- 1. 사용자와 마음 점검
------------------------------------------------------------

-- 사용자 (프로토타입은 로그인 없이 닉네임만)
-- 시작 단계는 심리검사 점수가 아니라 시작 질문 3개의 답으로 정함 (고민기록 #20)
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  nickname       VARCHAR(30) NOT NULL,
  -- 시작 질문 답 (모두 선택, null = 답하지 않음. 기획: docs/기획/프로필.md)
  -- {"range":"home","burden":["people"],"with":"alone","support":"unsure","living":"family","needs":["health"]}
  -- 유형 이름(고립형·은둔형 등)은 저장하지 않음. 답 그대로 두고 추천할 때만 읽음
  start_answers  JSONB,
  current_stage  SMALLINT NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 6),  -- 추천 기준 단계 (한 단계 위까지는 사용자가 직접 열 수 있음)
  region_code    CHAR(5),                                          -- 법정 시군구 코드 (정책 필터, 같은 하늘의 별)
  birth_year     SMALLINT,                                         -- 정책 나이 조건 필터 (선택)
  -- 정책 신청 정보 (선택, 자격 규칙에만 쓰고 AI에 보내지 않음. 전부 지우면 NULL)
  -- {"job":"unemployed","school":"high_grad","married":"single","income":"under_2000","special":[]}
  policy_info    JSONB,
  share_in_sky   BOOLEAN NOT NULL DEFAULT false,                   -- 같은 하늘의 별 집계 포함 동의
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 프로필 이미지 = 획득한(별을 모두 딴) 별자리의 도감 캐릭터. NULL = 기본 캐릭터 (고민기록 #40)
  -- 외래키는 constellations를 만든 뒤 아래에서 건다. 획득 여부는 API가 v_user_acquired_constellations로 확인
  avatar_constellation_id INT
);

-- 데모 세션 (로그인 없이 브라우저마다 가상 사용자 1명)
-- 쿠키에는 무작위 토큰을 넣고, DB에는 토큰의 SHA-256 해시만 저장 (DB가 유출돼도 쿠키를 만들 수 없음)
-- 사용자를 지우면 세션도 함께 삭제
CREATE TABLE demo_sessions (
  token_hash    CHAR(64) PRIMARY KEY,   -- sha256(쿠키 토큰) hex
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 선택형 마음 점검 (단축형 UCLA 3문항 + Mini-SPIN 3문항)
-- 레벨·위험 판정에는 쓰지 않고, 원하는 사용자만 4주마다 응답해 변화 추이를 보는 용도 (효과 측정 지표)
CREATE TABLE survey_results (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers     JSONB NOT NULL,           -- {"ucla":[1,2,3], "spin":[0,2,4]}
  ucla_score  SMALLINT NOT NULL,
  spin_score  SMALLINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

------------------------------------------------------------
-- 2. 별자리와 별 (미리 정의된 콘텐츠)
------------------------------------------------------------

CREATE TABLE constellations (
  id          SERIAL PRIMARY KEY,
  stage       SMALLINT NOT NULL CHECK (stage BETWEEN 1 AND 6),     -- 단계 = 숨겨진 난이도 (포인트 = stage × 10, v_star_points)
  name        VARCHAR(50) NOT NULL,
  theme       VARCHAR(100),
  star_count  SMALLINT NOT NULL
);

-- 프로필 이미지 별자리 (users는 constellations보다 먼저 만들어서 여기서 건다). 별자리가 없어지면 기본 캐릭터로
ALTER TABLE users ADD CONSTRAINT users_avatar_constellation_id_fkey
  FOREIGN KEY (avatar_constellation_id) REFERENCES constellations(id) ON DELETE SET NULL;

-- 별 = 퀘스트
CREATE TABLE stars (
  id                SERIAL PRIMARY KEY,
  constellation_id  INT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  position          SMALLINT NOT NULL,
  title             VARCHAR(100) NOT NULL,
  description       TEXT,
  -- 기본 확인 방식: 집 안은 self, 바깥 퀘스트는 gps(도착 확인). gps를 못 쓰면 언제든 self로 대체
  verify_type       VARCHAR(10) NOT NULL DEFAULT 'self'
                    CHECK (verify_type IN ('self', 'photo', 'gps')),
  -- GPS 별의 목표 장소 종류 (카카오 로컬 검색에 사용): park, library, convenience, cafe, youth_center 등
  place_type        VARCHAR(20),
  -- 퀘스트 종류: 일상 / 청년센터 단계별 퀘스트 / 봉사 (청년센터 행동별 기록 수 지표용)
  category          VARCHAR(10) NOT NULL DEFAULT 'daily'
                    CHECK (category IN ('daily', 'center', 'volunteer')),
  -- 집 문 밖에서 하는 활동인지 (1순위 지표 "앱 밖 활동"의 기준). 청년센터 별이어도 앱 안에서 하는 것(지도·홈페이지 보기)은 false
  is_outside        BOOLEAN NOT NULL DEFAULT false,
  -- 회복 방향과 활동 성향 (원본: 루트 quests.json의 focuses·tags, 고민기록 #31). 정책 추천·추천 이유에 쓸 수 있음
  focus             VARCHAR(10) NOT NULL DEFAULT 'daily'
                    CHECK (focus IN ('daily', 'outing', 'relation', 'work')),
  tags              TEXT[] NOT NULL DEFAULT '{}'
                    CHECK (tags <@ ARRAY['outdoor', 'social', 'career', 'learning', 'rest']::text[]),
  UNIQUE (constellation_id, position)
);

-- 더 작게 해 보기용 하위 퀘스트 (미리 정한 목록. AI는 이 안에서만 고름, 아이디어_v4 6장)
-- 별자리 화면에 별로 나오지 않음. 하위 퀘스트를 해내면 원래 별이 밝아짐
-- 다른 별로 바꾸기는 같은 단계의 별에서 고르므로 따로 목록을 두지 않음
CREATE TABLE sub_quests (
  id        SERIAL PRIMARY KEY,
  star_id   INT NOT NULL REFERENCES stars(id) ON DELETE CASCADE,
  position  SMALLINT NOT NULL,
  title     VARCHAR(100) NOT NULL,
  UNIQUE (star_id, position),
  UNIQUE (id, star_id)                  -- 시도 기록이 "그 별의" 하위 퀘스트만 가리키게 하는 복합 외래키용
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
-- 손 뻗어 보기(dim) 뒤 다음 행동 (보조 지표 "다시 시도한 비율", 고민기록 #24, #25)
--   dim 시도 줄에: suggested_action(AI 제안) / next_action(사용자 선택) / 고른 대상(next_sub_quest_id 또는 next_star_id)
--     → 실제로 다시 시도하기 전에도 "다음에 할 작은 별"이 남음
--   이어진 시도 줄에: parent_attempt_id = 원래 시도
--     더 작게 해 보기(smaller): star_id는 원래 별 + sub_quest_id(하위 퀘스트), custom_title은 그 이름 사본 → 완료하면 원래 별이 밝아짐
--     다른 날 그대로 하기(retry): 같은 별
--     다른 별로 바꾸기(swap): star_id는 새 별
--   원래 시도를 지워도 이어진 시도는 남음 (ON DELETE SET NULL, 기획 7장 "언제든 기록 삭제")
CREATE TABLE star_attempts (
  id                 SERIAL PRIMARY KEY,
  user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  star_id            INT NOT NULL REFERENCES stars(id),
  parent_attempt_id  INT REFERENCES star_attempts(id) ON DELETE SET NULL,
  sub_quest_id       INT,               -- 하위 퀘스트로 한 시도 (그 별의 하위 퀘스트만, 아래 복합 외래키)
  custom_title       VARCHAR(100),      -- 하위 퀘스트 이름 사본 (콘텐츠가 바뀌어도 그날의 기억은 그대로)
  status             VARCHAR(10) NOT NULL CHECK (status IN ('dim', 'bright')),
  -- 실제로 확인한 방식 (GPS 별이어도 위치를 못 쓰면 self로 기록, 불이익 없음)
  verify_method      VARCHAR(10) NOT NULL DEFAULT 'self' CHECK (verify_method IN ('self', 'photo', 'gps')),
  -- GPS 도착 확인한 장소. 좌표·이동 경로는 저장하지 않음 (개인정보 원칙)
  place_id           VARCHAR(30),       -- 카카오 장소 ID. 청년센터 별이면 'center:{센터 ID}'
  place_name         VARCHAR(100),
  photo_path         TEXT,              -- 선택 (기록용)
  reflection         VARCHAR(300),      -- 회고 한 줄 (별을 누르면 날짜와 함께 "그날의 기억"으로 표시)
  -- 손 뻗어 보기(dim)일 때: 이유 선택과 사용자가 고른 다음 행동 (고민기록 #24, #25)
  -- 이유: 사람 많음 / 날씨·상황 / 몸·마음 / 시간 / 나랑 안 맞음 / 비용 / 기타
  -- 다음 행동: 더 작게(smaller) / 다른 날 그대로(retry) / 다른 별로 바꾸기(swap) / 여기서 마치기(stop)
  stop_reason        VARCHAR(20) CHECK (stop_reason IN ('crowded', 'weather', 'tired', 'no_time', 'not_for_me', 'cost', 'other')),
  next_action        VARCHAR(10) CHECK (next_action IN ('smaller', 'retry', 'swap', 'stop')),
  suggested_action   VARCHAR(10) CHECK (suggested_action IN ('smaller', 'retry', 'swap', 'stop')),  -- AI ① 제안 (따랐는지 = next_action과 같은지)
  next_sub_quest_id  INT,               -- smaller를 골랐을 때 할 하위 퀘스트 (이 별의 하위 퀘스트만)
  next_star_id       INT REFERENCES stars(id),  -- swap을 골랐을 때 바꿀 별 (같은 단계에서 고르는 것은 API가 확인)
  cheer              TEXT,              -- AI ④ 맞춤 응원
  risk               VARCHAR(10) CHECK (risk IN ('normal', 'caution', 'danger')),  -- 회고 위험도 (AI ③, 안내가 나간 횟수 집계용)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT star_attempts_sub_quest_fkey      FOREIGN KEY (sub_quest_id, star_id) REFERENCES sub_quests (id, star_id),
  CONSTRAINT star_attempts_next_sub_quest_fkey FOREIGN KEY (next_sub_quest_id, star_id) REFERENCES sub_quests (id, star_id),
  -- 하위 퀘스트 이름은 하위 퀘스트로 한 시도에만
  CONSTRAINT star_attempts_custom_title_needs_sub_quest CHECK (custom_title IS NULL OR sub_quest_id IS NOT NULL),
  -- 고른 대상은 고른 행동과 맞아야 함
  CONSTRAINT star_attempts_next_target_check CHECK (
    (next_sub_quest_id IS NULL OR next_action = 'smaller') AND (next_star_id IS NULL OR next_action = 'swap'))
);

-- 데일리 체크인 (AI ② 마음 날씨, AI ③ 위험 감지)
CREATE TABLE checkins (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text        VARCHAR(300) NOT NULL,
  weather     VARCHAR(20) NOT NULL,     -- AI가 고른 날씨
  user_weather VARCHAR(20),             -- 사용자가 직접 고친 날씨 (NULL이면 AI 날씨 사용)
  -- "오늘은 어떤 활동이 괜찮을까요?" 사용자의 선택. 추천 난이도는 날씨가 아니라 이 값을 우선 (고민기록 #20)
  today_choice VARCHAR(10) CHECK (today_choice IN ('rest', 'home', 'near', 'out')),
  risk        VARCHAR(10) NOT NULL CHECK (risk IN ('normal', 'caution', 'danger')),
  -- 한 줄에서 AI가 읽은 오늘 필요한 것 (money_job·health·family·people), 정책 추천에 참고 (고민기록 #47). 위험이면 빈 배열
  needs       TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI ① 오늘의 별 추천 결과 (하루 한 번만 생성해 저장)
-- 새로고침할 때마다 Gemini를 부르지 않게 해서 무료 등급 호출 제한을 아끼고, 추천이 바뀌지 않게 함
-- 날짜는 한국 시간 기준 (DB 서버 시간대가 GMT라 CURRENT_DATE를 쓰면 오전 9시에 날짜가 바뀜)
CREATE TABLE daily_recommendations (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_date    DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  star_ids    INT[] NOT NULL,
  reason      TEXT,                     -- 추천 이유 한 줄
  items       JSONB,                    -- 별마다 다른 추천 이유 [{"starId","reason"}]
  checkin_id  INT REFERENCES checkins(id) ON DELETE SET NULL,  -- 체크인을 지워도 추천은 남음
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rec_date)
);

-- 별 말고 다른 곳에서 받은 포인트 적립 기록 (고민기록 #32)
-- 별 포인트는 지금처럼 뷰(v_star_points)로 계산하고, 여기에는 유성(+1)과 데일리 체크인(+100)만 쌓는다
-- 중복 지급 방지는 UNIQUE (user_id, source, ref_key) 하나로 한다
--   meteor : ref_key = 유성 번호 (서버 시각 기준 METEOR_INTERVAL_SECONDS마다 1개, web/src/lib/points.ts)
--   checkin: ref_key = 한국 날짜 'YYYY-MM-DD' (하루 한 번)
-- 점수는 받은 시점의 값을 그대로 저장 (규칙 숫자를 바꿔도 이미 받은 포인트는 그대로)
CREATE TABLE point_events (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       VARCHAR(10) NOT NULL CHECK (source IN ('meteor', 'checkin')),
  ref_key      VARCHAR(40) NOT NULL,
  points       SMALLINT NOT NULL CHECK (points > 0),
  earned_date  DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),  -- 한국 날짜 (유성 하루 한도 집계용)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, ref_key)
);

------------------------------------------------------------
-- 4. 공공 데이터 (미리 수집·분류해 저장)
------------------------------------------------------------

-- 청년정책 + 복지서비스 (AI ⑤ 분류 결과 포함, 기획: docs/기획/정책추천.md)
-- 수집: web/scripts/sync-policies.mts (시연 지역만). 바뀐 정책은 source_updated_at으로 판별해 그 정책만 다시 분류
CREATE TABLE policies (
  id             SERIAL PRIMARY KEY,
  source         VARCHAR(20) NOT NULL CHECK (source IN ('youth_policy', 'welfare')),
  source_id      VARCHAR(100) NOT NULL,
  title          TEXT NOT NULL,
  url            TEXT,
  -- 대상 지역: NULL = 전국(중앙부처), 'NN000' = 시도 전체(예: 11000 서울), 그 밖 = 시군구
  region_code    CHAR(5),
  age_min        SMALLINT,
  age_max        SMALLINT,
  apply_start    DATE,
  apply_end      DATE,                  -- 지난 정책은 노출하지 않음
  apply_always   BOOLEAN NOT NULL DEFAULT false,  -- 상시 모집 (apply_end 없음)
  apply_unclear  BOOLEAN NOT NULL DEFAULT false,  -- 신청 기간 코드 0057003: 신청 방법은 있지만 기간 불명확 → "원문에서 확인"
  category       VARCHAR(30),           -- 원문 분야 (예: 주거, 일자리, 금융·복지·문화)
  apply_method   TEXT,                  -- 원문 신청 방법
  raw            JSONB NOT NULL,        -- 원본 응답 (재분류용)
  source_updated_at TIMESTAMPTZ,        -- 원문 수정 시각. 바뀌면 다시 분류
  fetched_at     TIMESTAMPTZ,           -- 마지막으로 수집에서 본 시각
  -- 아래는 AI 분류 결과 (분류 전이면 추천하지 않음)
  actionable     BOOLEAN,               -- 개인이 직접 신청·이용할 수 있는 정책인지 (실태조사·시스템 구축 같은 정부 사업은 false → 보여 주지 않음)
  summary        TEXT,                  -- 쉬운 말 요약 (원문 링크와 함께 표시, 원문에 없는 숫자는 쓰지 않음)
  burden         VARCHAR(10) CHECK (burden IN ('online', 'phone', 'visit', 'group')),  -- 가장 부담 큰 신청·참여 방식
  -- 참여 난이도 = 별 단계와 같은 눈금 (users.current_stage와 비교)
  --   1 집에서 온라인으로 끝 / 2 온라인 + 문자·메일 연락 / 3 혼자 한 번 방문
  --   4 기관 이용·여러 번 방문 / 5 전화·상담·면접 등 짧은 대화 / 6 집단 프로그램·정기 참여
  stage          SMALLINT CHECK (stage BETWEEN 1 AND 6),
  difficulty_note VARCHAR(200),         -- 난이도 이유 한 줄
  relevance      SMALLINT CHECK (relevance BETWEEN 0 AND 3),  -- 고립·은둔 청년에게 도움이 되는 정도
  tags           TEXT[],                -- 분야 태그 (생활비, 주거, 일자리, 배움, 마음건강, 문화·여가, 사람과 함께, 건강, 금융)
  classified_at  TIMESTAMPTZ,
  UNIQUE (source, source_id)
);

-- 정책 추천 결과 (하루 한 번 생성해 저장, 오늘의 별 추천과 같은 방식)
-- 새로고침할 때마다 AI를 부르지 않음 → 사용자당 하루 최대 1번 호출
CREATE TABLE policy_recommendations (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_date    DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  policy_ids  INT[] NOT NULL,
  items       JSONB NOT NULL,           -- [{"policyId","reason"}]
  used_fallback BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rec_date)
);

-- 정책 수집 기록 (화면·발표의 "정책 정보 기준 시각", 새로 들어온·바뀐 정책 수)
CREATE TABLE policy_syncs (
  id          SERIAL PRIMARY KEY,
  source      VARCHAR(20) NOT NULL,
  region_code CHAR(5),
  fetched     INT NOT NULL DEFAULT 0,   -- API에서 받은 수
  kept        INT NOT NULL DEFAULT 0,   -- 시연 범위로 남긴 수
  inserted    INT NOT NULL DEFAULT 0,
  updated     INT NOT NULL DEFAULT 0,
  classified  INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- 정책 피드백 루프 (고민기록 #38): 사용자 피드백 → 판정 → 검증 → 승인 → 반영
-- 사용자에게는 피드백 즉시 그 정책을 다시 추천하지 않음 (루프를 기다리지 않음). 루프는 모든 사용자의 데이터를 고칠 때만
CREATE TABLE policy_feedback (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id    INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  reason       VARCHAR(20) NOT NULL CHECK (reason IN ('region', 'eligibility', 'not_needed', 'too_hard', 'other')),
  text         VARCHAR(200),             -- 직접 쓴 한 줄 (선택)
  -- 루프 상태: pending 판정 대기 / personal 개인 조정만 (데이터 수정 대상 아님) / no_basis 근거 없음으로 끝 / requested 수정 요청 생성됨
  loop_status  VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (loop_status IN ('pending', 'personal', 'no_basis', 'requested')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_policy_feedback_user ON policy_feedback (user_id, policy_id);
CREATE INDEX idx_policy_feedback_pending ON policy_feedback (loop_status) WHERE loop_status = 'pending';

-- 수정 요청: 고칠 수 있는 칸은 정해 둔 목록만. 단계마다 판단 메모와 모델을 남김
CREATE TABLE policy_correction_requests (
  id              SERIAL PRIMARY KEY,
  feedback_id     INT REFERENCES policy_feedback(id) ON DELETE SET NULL,
  policy_id       INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  field           VARCHAR(20) NOT NULL CHECK (field IN ('region_code', 'actionable', 'burden', 'stage', 'age_min', 'age_max')),
  current_value   TEXT,
  proposed_value  TEXT NOT NULL,
  evidence        TEXT NOT NULL,           -- 판정 에이전트가 원문에서 옮긴 근거 구절
  -- proposed 판정 → returned 검증에서 한 번 돌려보냄 → verified 검증 통과 → applied 승인·반영 / rejected 반려
  status          VARCHAR(10) NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'returned', 'verified', 'applied', 'rejected')),
  attempts        SMALLINT NOT NULL DEFAULT 1,
  judge_note      TEXT,
  verify_note     TEXT,
  review_note     TEXT,
  models          JSONB,                   -- {"judge": "...", "verify": "rules|...", "review": "..."}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_correction_status ON policy_correction_requests (status);

-- 반영 기록: 바꾸기 전·후 값 (되돌리기용)
CREATE TABLE policy_correction_log (
  id            SERIAL PRIMARY KEY,
  request_id    INT REFERENCES policy_correction_requests(id) ON DELETE SET NULL,
  policy_id     INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  field         VARCHAR(20) NOT NULL,
  before_value  TEXT,
  after_value   TEXT,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_at   TIMESTAMPTZ
);

-- 문의 문장 초안 (AI ⑥). 초안만 저장해도 됨. 실제로 문의했는지는 사용자가 직접 기록(sent_at)
CREATE TABLE inquiry_drafts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id   INT,                      -- youth_centers.id (공공 데이터라 외래키 없음)
  question    VARCHAR(300),             -- 사용자가 궁금한 점
  draft       TEXT NOT NULL,            -- AI 초안 (사용자가 고친 최종본으로 덮어씀)
  sent_at     TIMESTAMPTZ,              -- "문의해 봤어요" 직접 기록 시각
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
  lng          DOUBLE PRECISION,
  hours        TEXT,                    -- 운영시간. 확인된 값만, 없으면 NULL (꾸며내지 않음)
  programs     JSONB,                   -- [{"title","summary"}] (AI ⑤ 요약)
  -- 출처 표시 (실데이터는 모두 채움)
  source_name  VARCHAR(100),            -- 예: 한국고용정보원_온통청년_청년센터
  source_url   TEXT,
  basis_date   DATE,                    -- 데이터 기준일(수집일)
  terms        TEXT,                    -- 이용 조건 (예: 이용허락범위 제한 없음)
  is_sample    BOOLEAN NOT NULL DEFAULT false  -- 시연용 가상 센터 (화면에 "예시 데이터예요")
);

-- 청년센터 행동 기록 (보조 지표 "청년센터 행동별 기록 수", 1순위 지표의 참여 기록)
-- 문의 문장 준비 = inquiry_drafts, 문의 기록 = inquiry_drafts.sent_at, 앞까지 가 본 별 = star_attempts
-- 여기에는 상세 보기(viewed)와 사용자가 직접 남긴 "참여했어요"(joined)만 기록
CREATE TABLE center_events (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center_id   INT NOT NULL,             -- youth_centers.id (예시 센터 9000번대가 코드에 있어 외래키 없음, inquiry_drafts와 같음)
  event       VARCHAR(10) NOT NULL CHECK (event IN ('viewed', 'joined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE INDEX idx_demo_sessions_user  ON demo_sessions (user_id);
CREATE INDEX idx_attempts_user_time  ON star_attempts (user_id, created_at DESC);
CREATE INDEX idx_attempts_star_time  ON star_attempts (star_id, created_at);
CREATE INDEX idx_checkins_user_time  ON checkins (user_id, created_at DESC);
CREATE INDEX idx_policies_stage      ON policies (stage, region_code);
CREATE INDEX idx_policies_open       ON policies (apply_end) WHERE classified_at IS NOT NULL;
CREATE INDEX idx_centers_region      ON youth_centers (region_code);
CREATE INDEX idx_policy_events       ON policy_events (policy_id, event);
CREATE INDEX idx_center_events       ON center_events (center_id, event);
CREATE INDEX idx_center_events_user  ON center_events (user_id);
CREATE INDEX idx_attempts_parent     ON star_attempts (parent_attempt_id) WHERE parent_attempt_id IS NOT NULL;
CREATE INDEX idx_attempts_sub_quest  ON star_attempts (sub_quest_id) WHERE sub_quest_id IS NOT NULL;
CREATE INDEX idx_point_events_day    ON point_events (user_id, source, earned_date);

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

-- 포인트 규칙: 별 하나의 점수 = 그 별자리 난이도(stage) × 10 (고민기록 #31). 규칙은 이 뷰 한 곳에만 둔다
CREATE VIEW v_star_points AS
SELECT s.id AS star_id,
       c.stage * 10 AS points
FROM stars s
JOIN constellations c ON c.id = s.constellation_id;

-- 사용자별 총 포인트 = 별 포인트 + 유성 포인트 + 체크인 포인트 (고민기록 #31, #32)
-- 별: 밝힌(bright) 별마다 한 번만 더함. v_user_star_status가 (사용자, 별)당 한 줄이라
--     같은 별을 다시 완료하거나 하위 퀘스트(더 작게 해 보기)로 밝혀도 중복 적립되지 않음. dim은 0점, 감점 없음
-- 유성·체크인: point_events 합계 (UNIQUE로 중복 적립 없음)
-- 포인트가 하나도 없는 사용자는 행이 없음 (0으로 처리). 앞 세 칸(user_id, total_points, bright_stars)은 처음 정의와 같음
CREATE VIEW v_user_points AS
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

CREATE TABLE IF NOT EXISTS shop_purchases (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  paid integer NOT NULL CHECK (paid > 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  equipped boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, item_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_one_equipped ON shop_purchases(user_id) WHERE equipped;

CREATE OR REPLACE VIEW v_user_balance AS
SELECT p.user_id, p.total_points - COALESCE(s.spent, 0)::int AS total_points,
       p.bright_stars, p.star_points, p.meteor_points, p.checkin_points
FROM v_user_points p
LEFT JOIN (SELECT user_id, sum(paid) AS spent FROM shop_purchases GROUP BY user_id) s USING (user_id);

-- 사용자가 획득한 별자리: 그 별자리의 별을 모두 한 번 이상 땄음(bright) (도감·프로필 이미지, 고민기록 #40)
-- 화면 lib/constellations.ts의 getCompletedConstellationIds와 같은 기준. 별 수는 star_count가 아니라 실제 stars 행으로 센다
-- acquired_at = 마지막 별을 처음 딴 시각 (= 별자리를 완성한 순간). 다시 따거나 dim은 영향 없음
CREATE VIEW v_user_acquired_constellations AS
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

-- 같은 하늘의 별: 오늘(한국 시간) 별마다 시도한 사람 수 (동의한 사용자만, 구 단위, 5명 미만은 숨김)
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

-- 발표 지표: 하위 퀘스트(더 작게 해 보기)의 완료율
CREATE VIEW v_split_success AS
SELECT count(*)                                   AS split_attempts,
       count(*) FILTER (WHERE status = 'bright')  AS split_bright,
       round(100.0 * count(*) FILTER (WHERE status = 'bright') / NULLIF(count(*), 0), 1) AS success_rate
FROM star_attempts
WHERE sub_quest_id IS NOT NULL;

-- 보조 지표 (AI 효과): 손 뻗어 보기 뒤 다음 행동을 고르고 다시 시도한 비율 (다음 행동별, AI 제안을 따랐는지별)
-- followed_ai: true = AI 제안(suggested_action)과 같은 행동을 고름, false = 다른 행동을 고름, NULL = 제안 기록 없음
-- 다시 시도 = 이어진 시도(parent_attempt_id)가 있거나, 고른 대상을 나중에 시도함
--   (retry: 같은 별, smaller: 고른 하위 퀘스트, swap: 고른 별)
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

-- 발표 지표: 추천 정책 정보 확인 비율 (추천을 본 사용자 중 원문을 연 비율)
-- ※ 원문을 열어 본 것이지 신청·참여한 것이 아님. 발표에서도 "정보 확인"으로만 설명
CREATE VIEW v_policy_click_rate AS
SELECT count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'shown')   AS shown_pairs,
       count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'clicked') AS clicked_pairs,
       round(100.0 * count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'clicked')
             / NULLIF(count(DISTINCT (user_id, policy_id)) FILTER (WHERE event = 'shown'), 0), 1) AS click_rate
FROM policy_events;

-- AI 한계 지표: 사용자가 AI 마음 날씨를 조정한 비율
-- ※ "AI 정확도"가 아님 (고치지 않았다고 AI가 맞았다는 뜻은 아님). 체크인마다 user_weather 한 칸이라 여러 번 고쳐도 한 번만 집계
CREATE VIEW v_weather_correction_rate AS
SELECT count(*)                                                       AS checkins,
       count(*) FILTER (WHERE user_weather IS NOT NULL AND user_weather <> weather) AS corrected,
       round(100.0 * count(*) FILTER (WHERE user_weather IS NOT NULL AND user_weather <> weather)
             / NULLIF(count(*), 0), 1)                                AS correction_rate
FROM checkins;

-- 1순위 지표: 앱 밖 활동을 시도한 사용자 비율 (아이디어_v4 8장, 고민기록 #25)
-- 앱 밖 활동 = 바깥 별(is_outside, 센터 "앞까지 가 본 별" 포함) 시도 / 문의 기록(sent_at) / 참여 기록(joined)
-- 손 뻗어 보기(dim)도 시도로 셈. 지도·홈페이지 보기 같은 앱 안 청년센터 별은 세지 않음
-- 분모 = 실제로 시작한 사용자 (시작 질문 답 또는 체크인·시도·초안·센터 기록이 하나라도 있음)
--   데모 시작만 누르고 아무것도 안 한 브라우저는 세지 않음
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

-- 보조 지표 (지원 연결): 청년센터 행동별 기록 수. 순서를 강제하지 않으므로 퍼널이 아니라 행동별로 집계
-- viewed 상세 보기 / drafted 문의 문장 준비 / arrived 앞까지 가 본 별 / sent 문의 기록 / joined 참여 기록
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
