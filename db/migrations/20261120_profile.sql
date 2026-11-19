-- 변경 SQL: 프로필 고도화 (2026-11-20, feat/policy-recommend, 기획: docs/기획/프로필.md)
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/01_schema.sql에 포함
-- 여러 번 실행해도 안전. 칸 추가만 하고 기존 기록은 건드리지 않음
-- 적용: Neon 콘솔 → SQL Editor에 붙여넣고 Run (또는 psql "$DATABASE_URL" -f 이 파일)
-- 확인: SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'policy_info';
--
-- 바뀌는 것
--   users.policy_info: 정책 신청 정보 (선택). 시작 질문 ④~⑥은 기존 start_answers(JSONB)에 키만 늘어나므로 변경 없음

ALTER TABLE users ADD COLUMN IF NOT EXISTS policy_info JSONB;
