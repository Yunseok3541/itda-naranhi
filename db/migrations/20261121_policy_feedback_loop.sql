-- 변경 SQL: 정책 피드백 루프 테이블 (2026-11-21, feat/policy-scope). 여러 번 실행해도 안전, 기존 데이터 영향 없음
BEGIN;
-- 정책 피드백 루프 (고민기록 #38): 사용자 피드백 → 판정 → 검증 → 승인 → 반영
-- 사용자에게는 피드백 즉시 그 정책을 다시 추천하지 않음 (루프를 기다리지 않음). 루프는 모든 사용자의 데이터를 고칠 때만
CREATE TABLE IF NOT EXISTS policy_feedback (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id    INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  reason       VARCHAR(20) NOT NULL CHECK (reason IN ('region', 'eligibility', 'not_needed', 'too_hard', 'other')),
  text         VARCHAR(200),             -- 직접 쓴 한 줄 (선택)
  -- 루프 상태: pending 판정 대기 / personal 개인 조정만 (데이터 수정 대상 아님) / no_basis 근거 없음으로 끝 / requested 수정 요청 생성됨
  loop_status  VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (loop_status IN ('pending', 'personal', 'no_basis', 'requested')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_policy_feedback_user ON policy_feedback (user_id, policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_feedback_pending ON policy_feedback (loop_status) WHERE loop_status = 'pending';

-- 수정 요청: 고칠 수 있는 칸은 정해 둔 목록만. 단계마다 판단 메모와 모델을 남김
CREATE TABLE IF NOT EXISTS policy_correction_requests (
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
CREATE INDEX IF NOT EXISTS idx_correction_status ON policy_correction_requests (status);

-- 반영 기록: 바꾸기 전·후 값 (되돌리기용)
CREATE TABLE IF NOT EXISTS policy_correction_log (
  id            SERIAL PRIMARY KEY,
  request_id    INT REFERENCES policy_correction_requests(id) ON DELETE SET NULL,
  policy_id     INT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  field         VARCHAR(20) NOT NULL,
  before_value  TEXT,
  after_value   TEXT,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_at   TIMESTAMPTZ
);
COMMIT;
