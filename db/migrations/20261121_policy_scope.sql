-- 변경 SQL: 정책 수집 범위 확대 (2026-11-21, feat/policy-scope, 고민기록 #35)
-- 대상: 운영 DB(팀 공용 Neon). 새 DB는 db/init/01_schema.sql에 포함. 여러 번 실행해도 안전, 기존 행은 기본값 false
-- 신청 기간 코드 0057003(의미 확인 전) 정책 중 신청 방법이 있고 사업 기간이 끝나지 않은 것을 "기간 불명확"으로 넣기 위한 칸
ALTER TABLE policies ADD COLUMN IF NOT EXISTS apply_unclear BOOLEAN NOT NULL DEFAULT false;
