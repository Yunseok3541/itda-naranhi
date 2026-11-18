# API 명세

> API는 Next.js 앱(`web/src/app/api/`)의 Route Handler로 구현한다 (고민기록 #27).
> 화면은 같은 앱에서 `fetch('/api/...')`로 호출한다. 화면 쪽 내용은 [화면설계.md](화면설계.md)

## API가 맡는 일

- 프론트엔드에 REST API 제공
- DB 읽기·쓰기 (스키마: 루트 `db/init/01_schema.sql`, PostgreSQL 16)
- AI 호출 (Gemini 등): 모든 AI 기능은 서버에서만 호출, API 키는 서버 환경 변수에만
- 공공 API 수집·정책 분류 배치 (온통청년, 복지서비스, 1365, 카카오 로컬)

## 지켜야 할 원칙 (스택과 무관)

1. **AI 출력은 정해진 JSON 스키마로 받고 검증**, 실패하거나 형식이 틀리면 **기본값**으로 응답 → 흐름이 끊기지 않게
2. **사용자 문장(체크인·회고 등)은 모두 위험 판단을 거친다**
   - 규칙(직접 표현 → danger, 간접 표현 → caution)과 AI 판단 중 더 위험한 쪽
   - AI가 실패하면 규칙 + 부정 감정 표현으로 판단해 최소 caution
   - 구현: `web/src/lib/safety.ts` (`assessRisk`)
3. **DB 저장이 실패해도 위험 안내(help)는 반드시 응답**
4. AI에는 이름 등 식별 정보를 보내지 않음, GPS 좌표·이동 경로는 저장하지 않음
5. 오늘의 별 추천은 하루 한 번 생성해 저장 (무료 등급 호출 제한)

## API 목록

### 구현됨

**`POST /api/checkin`** — AI ② 마음 날씨 + AI ③ 위기 표현 안내

```jsonc
// 요청
{ "userId": 1, "text": "오늘 좀 무기력해요", "todayChoice": "home" }  // todayChoice: rest | home | near | out (선택)
// 응답
{
  "checkinId": 12,              // 저장 실패 시 null (프론트는 날씨 고치기 버튼을 숨김)
  "weather": "cloudy",          // sunny | partly_cloudy | cloudy | rainy | foggy (참고 기록)
  "todayChoice": "home",
  "risk": "normal",             // normal | caution | danger
  "help": null,                 // risk가 normal이 아니면 { title, lines[] }
  "usedFallback": false         // AI 대신 기본값을 썼는지
}
```

**`PATCH /api/checkin/weather`** — 마음 날씨 직접 고치기

```jsonc
// 요청
{ "userId": 1, "checkinId": 12, "weather": "partly_cloudy" }
// 응답: 200 { "weather": "partly_cloudy" } / 404 체크인 없음 / 500 저장 실패
```

**`GET /api/health`** — DB 연결·AI 키 상태 확인

### 만들 것 (기획: `docs/기획/아이디어_v4.md`)

| API | 기능 | 비고 |
| --- | ---- | ---- |
| 시작 질문 저장 | 시작 질문 3개 답 → 시작 단계 | `users.start_answers`, `current_stage` |
| 별자리·별 조회 | 단계별 별자리, 별 상태 | 별 상태는 뷰 `v_user_star_status`로 계산 |
| 오늘의 별 추천 (AI ①) | 오늘 선택·부담 상황·기록·회고 → 별 1~3개 + 이유 | `daily_recommendations`, 하루 1회 |
| 별 시도 기록 | "하늘의 별 따기"(bright) / "손 뻗어 보기"(dim), GPS 또는 직접 기록, 회고 | `star_attempts`. 회고에 위험 판단 적용 |
| 시도 후 다음 행동 (AI ①) | 이유 → 더 작게 / 다른 날 / 다른 별 / 마치기 제안 | `stop_reason`, `next_action` |
| 회고 응원 (AI ④) | 시도 결과 + 회고 → 한두 문장 | `star_attempts.cheer`, 실패 시 기본 문구 |
| 주변 장소 | GPS 별의 목표 장소 (카카오 로컬) | 좌표 저장 안 함 |
| 청년센터 조회 | 지도, 센터 상세 | `youth_centers` |
| 정책 추천 (AI ⑤) | 미리 분류해 둔 정책 조회 + 노출·클릭 기록 | `policies`, `policy_events` |
| 문의 문장 초안 (AI ⑥) | 센터 정보 + 궁금한 점 → 초안, 저장 | `inquiry_drafts` |
| 별의 기억 | 별을 누르면 날짜 + 회고 | `star_attempts` 조회 |

## 실행 환경

- DB: 배포는 Neon, 로컬은 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`) 또는 Neon 개발용 DB
- 환경 변수 예시: `web/.env.example`
