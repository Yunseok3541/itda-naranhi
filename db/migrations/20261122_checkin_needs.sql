-- 변경 SQL: 체크인에서 읽은 "오늘 필요한 것" (2026-11-22, feat/checkin-policy-link, 고민기록 #47)
-- 대상: 운영 DB(팀 공용 Neon). 새 DB는 db/init/01_schema.sql에 포함. 여러 번 실행해도 안전, 기존 행은 NULL(= 참고할 것 없음)
-- 값: money_job | health | family | people (정책 추천 시작 질문 ⑥과 같은 말). 위험(danger) 체크인은 항상 빈 배열
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS needs TEXT[];
