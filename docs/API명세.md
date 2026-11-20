# API 명세

> API는 Next.js 앱(`web/src/app/api/`)의 Route Handler로 구현한다 (고민기록 #27).
> 화면은 같은 앱에서 `fetch('/api/...')`로 호출한다. 화면 쪽 내용은 [화면설계.md](화면설계.md), 문구는 [기능 완료 기준](기획/기능완료기준과_콘텐츠.md), 세션 사용법은 [web/README.md](../web/README.md) "데모 세션"
> 마지막 갱신: 2026-11-20 (유성 터치 +1·데일리 체크인 +100 포인트: `POST /api/meteors`, `GET /api/points`, 체크인 응답 `pointsEarned`·`totalPoints`, 총점에 합산. Neon 변경 SQL `20261121_reward_points.sql`. 담당 고은비, 브랜치 `feat/meteor-points`)
> 마지막 갱신: 2026-11-20 (프로필 이미지: 획득한 별자리만 고르는 `GET·PUT /api/profile/avatar`, 오류 코드 `NOT_ACQUIRED`, Neon 변경 SQL `20261121_profile_avatar.sql` / 데모 시작 질문을 질문별 페이지로 바꿀 때의 저장 계약 확인. 담당 고은비, 브랜치 `feat/profile-avatar`)
> 이전 갱신: 2026-11-20 오후 (별자리를 도감 캐릭터 10개로 맞춤, Neon 동기화 SQL `20261121_quests_sync.sql`. 담당 고은비, 브랜치 `feat/points`)
> 이전 갱신: 2026-11-19 18시 (포인트: 시도 저장 `pointsEarned`·`totalPoints`, 밤하늘 `totalPoints`·별 `points`, 시드를 루트 `quests.json` 기준 별자리 12개·별 40개로 교체, 별 `focus`·`tags` 칸. 담당 고은비, 브랜치 `feat/points`)
> 이전 갱신: 2026-11-19 13시 (청년센터·문의 초안 화면 연결 계약, 초안 `sent` 칸, 문의 API 세션 장애 503, 실데이터 전환 계획, AI 실호출 기록)
>
> ⚠ **`feat/points`부터 시드가 바뀌어 별 ID와 별자리가 달라졌다** (별 1~40 = `quests.json`의 quest id, **별자리 1~10 = 도감 캐릭터 순서**, 고민기록 #31). 아래 응답 예시 중 "실제 응답"이라고 적힌 것은 이전 시드(별 16개)로 받은 기록이라 ID·별자리 이름이 지금과 다르다. 형식은 그대로다.
> 화면 영향: `mobile-flow.tsx`의 GPS(도착 확인) 안내는 별 ID 대신 밤하늘 응답의 `verifyType === "gps"`로 판단한다 (`lib/mobile-data.ts`의 `isGpsStar`, 예시 모드만 예시 목록의 16·17). 새 시드의 GPS 별은 6·8·10·11·17·33. 예시 모드의 별 제목 17개는 새 콘텐츠와 다르다.
> 화면 담당이 맞출 것 (별자리 = 도감 10개): DB 별자리 ID 1~10이 `catalog/characters.ts` 순서·이름·테마와 같다. ① `lib/constellations.ts`의 `activityConstellations`를 1~10으로 늘리기(이름·테마는 characters.ts와 같음) ② `characters.ts`의 `hasActivity`를 10명 모두 true ③ `lib/sky-constellations.ts`의 하늘 모양을 별 수에 맞춰 추가 — 1 카시오페이아 5·2 돌고래 5는 지금 모양 그대로 맞음, 3 거문고 4·4 작은곰 3·5 토끼 3·6 여우 4·7 카멜레온 3·8 백조 5·9 독수리 3·10 화가 5. 모양이 없으면 기본 호 모양으로 그려져 깨지지는 않는다.

## 담당과 구현 위치

| API·모듈 | 담당 | 구현 위치 | 상태 |
| -------- | ---- | --------- | ---- |
| 데모 세션 `POST /api/demo/session`, `getDemoUserId()` | 윤석 | `api/demo/session/`, `lib/demo-session.ts` | 구현 (`feat/demo-platform`) |
| 체크인 `POST /api/checkin`, `PATCH /api/checkin/weather` | 윤석 | `api/checkin/` | 세션 연결 (`feat/demo-platform`) |
| **오늘의 별 추천 `POST /api/recommendations`** (AI ①) | **고은비** | `api/recommendations/route.ts`, `service.ts` | 구현·검증 |
| **회고 처리 함수 `processReflection()`** (AI ④ + ③) | **고은비** | `lib/reflection.ts` | 구현·검증. 시도 저장 API가 호출 |
| Gemini 공통 호출 `generateJson()` | 고은비 | `lib/gemini.ts` | 10초 제한, 실제 응답 모델 버전 반환 |
| 시도 저장 `POST /api/attempts` | 윤석 | `api/attempts/route.ts`, `api/_lib/attempts.ts` | ⚠ 고은비가 먼저 구현해 둠 → 윤석이 이어받을지 PR에서 결정 |
| 밤하늘 `GET /api/sky` | 윤석 | `api/sky/route.ts`, `api/_lib/sky.ts` | ⚠ 고은비가 먼저 구현해 둠 → 위와 같음 |
| 청년센터 `GET /api/centers`, `/api/centers/{id}` | 고은비 | `api/centers/`, `api/_lib/centers*.ts` | 가상 센터 1곳으로 HTTP 검증 완료. 실데이터는 인증키 대기 |
| 문의 초안 `POST·GET /api/inquiries`, `PATCH /api/inquiries/{id}` (AI ⑥) | 고은비 | `api/inquiries/`, `api/_lib/inquiries.ts` | 생성·수정·재조회·보냄 기록 HTTP 검증 완료 |
| 유성 포인트 `POST /api/meteors`, 포인트 합계 `GET /api/points`, 체크인 +100 | 고은비 | `api/meteors/`, `api/points/`, `api/_lib/points.ts`, 규칙 숫자 `lib/points.ts` | 구현·검증 (`feat/meteor-points`). 화면 연결은 화면 담당 |
| 프로필 이미지 `GET·PUT /api/profile/avatar` | 고은비 | `api/profile/avatar/` | 구현·검증 (`feat/profile-avatar`). 화면 연결은 화면 담당 |

- `api/_lib/http.ts`는 새 API가 함께 쓰는 응답 형식·날짜 도우미다 (밑줄 폴더라 라우트가 되지 않음).
- 위기 표현 규칙 `lib/safety.ts`는 공용이다. 고은비가 AI 출력 검사(`isSafeAiText`)와 규칙 안내(`ruleHelp`)를 추가했다.

## API가 맡는 일

- 프론트엔드에 REST API 제공
- DB 읽기·쓰기 (스키마: 루트 `db/init/01_schema.sql`, PostgreSQL)
- AI 호출 (Gemini): 모든 AI 기능은 서버에서만 호출, API 키는 서버 환경 변수에만
- 공공 API 수집·정책 분류 배치 (온통청년, 복지서비스, 1365, 카카오 로컬)

## 지켜야 할 원칙 (스택과 무관)

1. **AI 출력은 정해진 JSON 스키마로 받고 검증**, 실패하거나 형식이 틀리면 **기본값**으로 응답 → 흐름이 끊기지 않게
2. **사용자 문장(체크인·회고·문의 질문)은 모두 위험 판단을 거친다**
   - 규칙(직접 표현 → danger, 간접 표현 → caution)과 AI 판단 중 더 위험한 쪽
   - AI가 실패하면 규칙 + 부정 감정 표현으로 판단해 최소 caution
   - 구현: `web/src/lib/safety.ts` (`assessRisk`)
3. **DB 저장이 실패해도 위험 안내(help)는 반드시 응답**. 단, 저장 실패를 성공(2xx)으로 보내지 않는다
4. AI에는 이름·사용자 ID·지역 등 식별 정보를 보내지 않음, GPS 좌표·이동 경로는 저장하지 않음
5. 오늘의 별 추천은 하루 한 번 생성해 저장 (무료 등급 호출 제한). 날짜는 **한국 시간** 기준

---

## 공통 규칙

### 세션

- 사용자는 **서버 쿠키**(`naranhi_demo`, HttpOnly)로 판단한다. 요청 본문·쿼리에 `userId`를 넣지 않는다 (보내도 무시).
- 화면은 데모 시작 때 `POST /api/demo/session`을 한 번 부른다 → `{ "ready": true }`. 이후 같은 출처 `fetch`에 쿠키가 자동으로 붙는다.
- 서버는 `@/lib/demo-session`의 `getDemoUserId()`(세션 없음·확인 실패면 `null`)를 쓴다. 추천 API는 DB 장애와 세션 없음을 나누려고 `lookupDemoSession()`을 쓴다.
- 세션이 없으면 모든 사용자별 API가 같은 401을 돌려준다 (윤석 `demoSessionRequired()`).

```jsonc
// 401
{ "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
```

### 오류 응답 형식

모든 오류는 같은 모양이다. 화면은 `code`로 분기하고 `error`는 그대로 보여 줘도 되는 문장이다.

```jsonc
{ "error": "별을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

| HTTP | code | 언제 | 프론트 처리 |
| ---- | ---- | ---- | ----------- |
| 400 | `INVALID` | 필드 누락·허용값 아님·길이 초과 | 입력 유지, `error` 문구 표시. 입력을 고치게 함 |
| 401 | `NO_SESSION` | 세션 쿠키 없음·만료 | 입력을 지우지 말고 `POST /api/demo/session`을 다시 부르거나 데모 시작 화면으로 |
| 404 | `NOT_FOUND` | 없는 ID, **다른 세션의 기록** (존재 여부를 알려주지 않으려고 404로 통일) | "찾을 수 없어요" 안내 후 이전 화면으로 |
| 403 | `NOT_ACQUIRED` | 아직 획득하지 않은(별을 모두 따지 않은) 별자리를 프로필 이미지로 고름 | 그 별자리를 고를 수 없게 막고 `error` 문구 표시. 지금 이미지는 그대로 |
| 500 | `SAVE_FAILED` | DB 저장 실패 | "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요." + **다시 저장하기**. 입력 유지 |
| 500 | `LOAD_FAILED` | DB 조회 실패 | 다시 불러오기 버튼 |
| 503 | `SAVE_FAILED` / `LOAD_FAILED` | 시도 저장·밤하늘 조회 전에 DB 장애로 세션을 확인하지 못함 | 입력을 유지하고 같은 요청을 재시도한다. `help`가 있으면 표시한다. |

- **`help`가 `null`이 아니면 상태 코드와 관계없이 항상 안내를 띄운다** (`{ title, lines[] }`). 400·401·404·500 응답에도 들어올 수 있다.
  - ⚠ 프론트 `web/src/lib/mobile-data.ts`의 `request()`는 2xx가 아니면 `error`만 담아 예외를 던져서 오류 응답의 `help`가 사라진다. 시도 저장 실패(500)·세션 없음(401)에서도 안내가 보이도록 `help`를 함께 넘겨야 한다 (재희).
- 2xx 응답만 성공이다. 500 응답에 들어 있는 값(예: 문의 초안)은 저장되지 않은 것이다.

### 검증용 필드

- 새로 만든 추천·시도·초안 응답에는 `modelVersion`(실제 응답한 모델 버전, 기본값을 썼으면 `null`)이 붙는다. 검증 기록용이라 화면에서는 쓰지 않는다.

### 날짜

- 모든 `date`는 한국 시간 기준 `YYYY-MM-DD` 문자열이다. 화면은 그대로 "11월 19일"처럼 바꿔 쓴다.
  - ⚠ `new Date("2026-11-19").toLocaleString()`은 "오전 9:00:00" 같은 없는 시각을 붙인다. 문자열을 나눠 월·일만 쓰기 (재희).

---

## API 목록

### 1. 체크인 (윤석, 세션 연결)

**`POST /api/checkin`** — AI ② 마음 날씨 + AI ③ 위기 표현 안내

```jsonc
// 요청 (userId 없음)
{ "text": "오늘 좀 무기력해요", "todayChoice": "home" }  // todayChoice: rest | home | near | out (선택)
// 200
{
  "checkinId": 12,              // 저장 실패 시 null (프론트는 날씨 고치기 버튼과 추천 진행을 보류)
  "weather": "cloudy",          // sunny | partly_cloudy | cloudy | rainy | foggy (참고 기록)
  "todayChoice": "home",
  "risk": "normal",             // normal | caution | danger
  "pointsEarned": 100,          // feat/meteor-points 추가. 오늘(한국 날짜) 첫 체크인이면 100, 이미 받았으면 0, 저장 실패면 null
  "totalPoints": 100,           // feat/meteor-points 추가. 이 체크인까지 포함한 총 포인트 (별 + 유성 + 체크인), 저장 실패면 null
  "help": null,                 // risk가 normal이 아니면 { title, lines[] }
  "usedFallback": false,        // AI 대신 기본값을 썼는지
  "modelVersion": "gemini-3.5-flash-lite"   // 실제 응답한 모델 버전, 기본값이면 null (검증용, 화면에서 쓰지 않음)
}
// 401 세션 없음 (위기 표현이면 help 포함)
```

- **데일리 체크인 포인트 (고민기록 #32):** 체크인이 저장됐을 때(`checkinId`가 있을 때)만, 한국 날짜 기준 하루 한 번 +100. 같은 날 다시 체크인하면 0. 위험도와 관계없이 준다.
  - 포인트는 체크인과 따로 저장한다. 포인트 저장만 실패하면(예: Neon에 변경 SQL 적용 전) 체크인 응답은 그대로 나가고 `pointsEarned`·`totalPoints`만 `null`이다.
  - 화면: `pointsEarned > 0`일 때만 "+100" 피드백을 띄운다. `0`·`null`이면 아무것도 띄우지 않는다.

**`PATCH /api/checkin/weather`** — 마음 날씨 직접 고치기

```jsonc
// 요청
{ "checkinId": 12, "weather": "partly_cloudy" }
// 응답: 200 { "weather": "partly_cloudy" } / 401 / 404 체크인 없음(남의 체크인 포함) / 500 저장 실패
```

**`GET /api/health`** — DB 연결·세션 테이블·AI 키·모델 상태 확인

### 2. 오늘의 별 추천 — `POST /api/recommendations` (AI ①, 고은비)

```jsonc
// 요청
{ "checkinId": 12 }
```

**정상 (AI 추천)** — 2026-11-19 실제 응답 (`gemini-3.5-flash-lite`, 오늘 선택 "집 근처")

```jsonc
// 200
{
  "items": [
    {
      "starId": 11,
      "title": "쓰레기 버리고 오기",
      "reason": "집 근처까지 갈 수 있다고 하셨으니 가볍게 다녀오기 좋아요.",
      // ↑ 계약 필드 starId·title·reason. 아래는 별 수행 화면용 추가 정보
      "description": "집 앞 분리수거장까지 다녀와요.",
      "constellationName": "거문고자리",
      "verifyType": "self"           // self | photo | gps (gps면 별 수행 화면에서 도착 확인 버튼)
    },
    {
      "starId": 13, "title": "우편함 확인하기", "reason": "우편함을 확인하며 가볍게 바깥 공기를 마셔볼 수 있어요.",
      "description": "우편함까지 다녀와요.", "constellationName": "거문고자리", "verifyType": "self"
    }
  ],
  "usedFallback": false,   // true면 이유 옆에 "준비해 둔 별에서 골랐어요." 표시
  "reused": false,         // 오늘 저장된 추천을 사용해 AI 호출을 건너뛴 경우 true
  "todayChoice": "near",   // 현재 체크인의 활동 범위
  "modelVersion": "gemini-3.5-flash-lite"
}
```

**쉬어 가기 (빈 추천)** — 오늘 선택이 `rest`인 체크인

```jsonc
// 200
{ "items": [], "usedFallback": false, "reused": false, "todayChoice": "rest" }
```

**기본값 (AI 실패·빈 응답·형식 오류·모두 후보 밖)** — 실제 후보 앞에서 최대 3개 + 범위별 기본 이유

```jsonc
// 200 (키 없이 실행한 실제 응답)
{
  "items": [
    { "starId": 11, "title": "쓰레기 버리고 오기", "reason": "집 근처가 괜찮다고 해서 현관 가까이에서 해 볼 수 있는 별이에요.",
      "description": "집 앞 분리수거장까지 다녀와요.", "constellationName": "거문고자리", "verifyType": "self" },
    { "starId": 12, "title": "현관 앞 5분 서 있기", "reason": "집 근처가 괜찮다고 해서 현관 가까이에서 해 볼 수 있는 별이에요.",
      "description": "현관 밖에서 5분만 머물러요.", "constellationName": "거문고자리", "verifyType": "self" },
    { "starId": 13, "title": "우편함 확인하기", "reason": "집 근처가 괜찮다고 해서 현관 가까이에서 해 볼 수 있는 별이에요.",
      "description": "우편함까지 다녀와요.", "constellationName": "거문고자리", "verifyType": "self" }
  ],
  "usedFallback": true,
  "reused": false,
  "todayChoice": "near",
  "modelVersion": null
}
```

**오류**

```jsonc
// 401 세션 없음
{ "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 404 다른 세션의 체크인 또는 없는 체크인 (구분하지 않음)
{ "error": "체크인을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
// 400 { "error": "checkinId가 필요해요.", "code": "INVALID", "help": null }
// 500 { "error": "지금은 추천을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }   // DB 조회 실패·세션 확인 실패
```

규칙

- **현재 세션 사용자의 체크인인지 확인**한다 (`checkins.user_id`). 다른 세션의 체크인은 404.
- **쉬어 가기(`rest`)는 빈 추천**이다. Gemini를 부르지 않고 저장하지도 않는다 → 같은 날 다른 범위로 다시 체크인하면 그때 추천을 만든다. 오늘 추천이 이미 있어도 쉬어 가기 체크인에는 빈 추천.
- **일일 추천 재사용**: 같은 사용자·같은 한국 날짜에 추천이 있으면 Gemini 호출 없이 `reused: true`를 반환한다. 같은 범위이면 이전 별과 이유를 재사용한다. 범위를 바꾸면 현재 범위의 별만 남기고 기본 이유를 사용한다. 남는 별이 없으면 현재 범위의 기본 후보를 반환한다. `todayChoice`는 현재 체크인의 범위다.
- 추천 개수: 최대 3개. 오늘 선택이 없으면 `home`으로 본다.
- 후보 범위 (임시 규칙, 콘텐츠 정의서 확정 시 교체)

  | 오늘 선택 | 후보 순서 |
  | --------- | --------- |
  | `rest` 쉬어 가기 | 추천 없음 |
  | `home` 집 안 / 선택 안 함 | 집 안 별 |
  | `near` 집 근처 | 집 앞 별 → 집 안 별 |
  | `out` 바깥 | 바깥(GPS) 별 → 집 앞 별 → 집 안 별 |

  - 집 안 = 1단계 별자리의 별, 집 앞 = 2단계 이상 별자리의 GPS가 아닌 별, 바깥 = GPS 별
  - 새 시드 기준 (`quests.json`, `feat/points`): 1단계 사용자에게 집 안 = 1단계 별 10개, 집 앞 = 2단계의 GPS가 아닌 별 7개, 바깥 = 2단계 GPS 별 4개(8 공원·6 편의점·10 카페·11 도서관). 1단계의 '쓰레기 버리고 오기'(집 밖)도 규칙상 집 안으로 분류된다
  - ⚠ 3·4단계의 집 안 활동(청년센터 홈페이지 둘러보기, 온라인 강의 등)도 규칙상 "집 앞"으로 분류된다. 범위를 별마다 정하려면 `stars`에 범위 칸이 필요하다 (아래 "DB 변경 — 포인트·새 시드"의 선택 항목)
  - 사용자 시작 단계 + 1단계(바로 위 단계)까지만 후보. 이미 딴 별(bright)은 뺀다 (다 땄으면 다시 포함). 모델에는 후보 최대 8개를 보낸다
- AI가 후보에 없는 `starId`·중복을 내면 제거한다. 남는 게 없으면 기본 후보 + 기본 이유. 이유가 비었거나 80자를 넘거나 금지 표현이 있으면 그 별만 기본 이유로 바꾼다.
- 추천 저장이 실패해도 추천은 200으로 돌려준다 (추천은 사용자가 쓴 글이 아니고, 다음 요청 때 다시 만들면 됨).
- 프론트 처리: 400·404면 체크인 화면으로, 401이면 데모 시작, 500이면 다시 불러오기. `items`가 비면 "오늘은 쉬어 가도 괜찮아요"와 밤하늘로 가는 버튼.

### 회고 처리 함수 — `processReflection()` (AI ④ 응원 + AI ③ 위기 표현, 고은비 → 윤석 호출)

시도 저장 API가 회고를 **저장하기 전에** 호출한다. 그래서 저장이 실패해도 `help`를 응답할 수 있다.

```ts
// 경로: web/src/lib/reflection.ts
import { processReflection } from "@/lib/reflection";

const { cheer, help } = await processReflection({
  status: "dim",                          // "bright" | "dim" (필수)
  reflection: "현관문을 열고 잠깐 서 봤어요", // string | null. 비어 있으면 AI를 부르지 않고 기본 응원
  starTitle: "현관 앞 5분 서 있기",          // string | null. 응원이 행동을 짚게 (선택)
  stopReason: "tired",                     // StopReason | null. dim일 때 고른 이유 (선택)
});
// 반환 { cheer: string, help: null | { title: string, lines: string[] } }

// 저장 성공 → 201 { attemptId, starId, status, cheer, help }
// 저장 실패 → 500 { error, code: "SAVE_FAILED", help }   ← cheer는 저장 성공 뒤에만 보여 줌
```

| 상황 | cheer | help |
| ---- | ----- | ---- |
| AI 정상 + 위험 없음 | AI 응원 (검사 통과한 것만) | `null` |
| 회고 없음 (`null`·빈 문자열) | 기본 응원 (AI 호출 없음) | `null` |
| Gemini 호출 실패·10초 초과·예외 | 기본 응원 | **규칙 기반**: 규칙 + 부정 감정 표현 → 최소 caution이면 안내 |
| 출력 형식 오류 (JSON 아님·필드 없음) | 기본 응원 | 규칙 기반 (위와 같음) |
| 응원에 금지 표현·위험 표현·100자 초과 | 기본 응원 | AI 위험도 + 규칙 중 높은 쪽 |
| 규칙 또는 AI가 caution·danger | 기본 응원 (밝은 응원을 쓰지 않음) | 안내 |

- 기본 응원: bright "오늘 해낸 일을 이 별에 담았어요." / dim "오늘 손을 뻗어 본 순간을 이 별에 담았어요." (`DEFAULT_CHEER`)
- 예외를 던지지 않는다. 기존 위험 판단 `assessRisk`(`lib/safety.ts`)를 그대로 쓴다.
- 모델에는 별 제목·결과·멈춘 이유·회고(앞 300자)만 보낸다. 사용자 ID·닉네임·지역은 보내지 않는다.
- 같은 처리에 기록용 값(`risk`, `usedFallback`, `modelVersion`)까지 받으려면 `inspectReflection()`. 지금 `api/_lib/attempts.ts`는 이것을 쓴다.
- AI 없이 규칙만으로 안내가 필요할 때(400·401 응답 등)는 `ruleHelp(text)` (`lib/safety.ts`).

```jsonc
// 2026-11-19 실제 결과 (gemini-3.5-flash-lite)
// 입력 { status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", starTitle: "현관 앞 5분 서 있기", stopReason: "tired" }
{ "cheer": "현관문을 열고 잠깐 서 보는 시도를 해냈군요. 마음이 힘들었을 텐데 현관 앞에서 보낸 그 시간이 참 소중해요.", "help": null }
// 입력 { status: "dim", reflection: "죽고 싶다는 생각이 들었어요" } + AI 실패
{ "cheer": "오늘 손을 뻗어 본 순간을 이 별에 담았어요.", "help": { "title": "혼자 감당하지 않아도 돼요", "lines": ["자살예방상담전화 109 (24시간)", "정신건강위기상담전화 1577-0199", "지역 청년마음건강 지원사업도 찾아볼 수 있어요."] } }
```

### 3. 별 시도 저장 — `POST /api/attempts` (윤석 담당 범위, 현재 구현은 고은비)

```jsonc
// 요청
{
  "starId": 12,
  "status": "dim",                       // bright(하늘의 별 따기) | dim(손 뻗어 보기)
  "reflection": "현관문을 열고 잠깐 서 봤어요",  // 선택, 300자 이하. 빈 문자열은 회고 없음
  "verifyMethod": "self",                 // 선택, self | photo | gps (기본 self)
  "stopReason": "tired",                  // 선택, dim일 때만. crowded | weather | tired | no_time | not_for_me | cost | other
  "placeId": "12345", "placeName": "OO편의점"  // 선택, gps 도착 확인 시만 (30자·100자 이하). 좌표는 보내지 않음
}
```

```jsonc
// 201 저장 성공 (2026-11-19 실제 응답)
{
  "attemptId": 54, "starId": 11, "status": "dim", "date": "2026-11-19",
  "reflection": "현관문을 열고 잠깐 서 봤어요",
  "cheer": "현관문을 열고 서 있던 그 시도만으로도 충분히 의미가 있어요. 오늘은 마음과 몸을 편안하게 쉬어주세요.",
  "help": null,
  "pointsEarned": 0, "totalPoints": 0,     // feat/points에서 추가. 아래 "포인트" 참고
  "risk": "normal", "usedFallback": false, "modelVersion": "gemini-3.5-flash-lite"
}
```

```jsonc
// 201 별을 처음 땄을 때 (2026-11-19 로컬 HTTP 검증 실제 응답. 그때의 더미 시드 별 4 = 2단계라 20점. 지금 시드의 별 4는 1단계라 10점)
{
  "attemptId": 18, "starId": 4, "status": "bright", "date": "2026-11-19", "reflection": null,
  "cheer": "오늘 해낸 일을 이 별에 담았어요.", "help": null,
  "pointsEarned": 20,       // 이번 시도로 얻은 포인트. 이 별을 처음 밝혔을 때만 난이도 × 10, 그 외 0
  "totalPoints": 20,        // 이 시도까지 포함한 사용자 총 포인트
  "risk": "normal", "usedFallback": true, "modelVersion": null
}
```

```jsonc
// 500 저장 실패 — 성공으로 보내지 않음. help는 그대로 전달, cheer는 보내지 않음
{
  "error": "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.",
  "code": "SAVE_FAILED",
  "help": { "title": "혼자 감당하지 않아도 돼요", "lines": ["자살예방상담전화 109 (24시간)", "정신건강위기상담전화 1577-0199", "지역 청년마음건강 지원사업도 찾아볼 수 있어요."] }
}
// 400 { "error": "stopReason은 손 뻗어 보기(dim)일 때만 보낼 수 있어요.", "code": "INVALID", "help": null }
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": { ... } }   // 회고에 위기 표현이 있으면
// 503 { "error": "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", "code": "SAVE_FAILED", "help": { ... } }   // 세션 조회 DB 장애
// 404 { "error": "별을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

규칙

- 응원·위기 안내는 위 **회고 처리 함수** 결과를 쓴다. `help`는 400·401·404·500에도 담는다 (이때는 AI 없이 규칙만).
- 같은 별을 여러 번 시도할 수 있다. 시도마다 한 줄씩 쌓인다.
- **포인트 (고민기록 #31):** 별을 **처음** bright로 만든 시도만 `pointsEarned` = 별자리 난이도(`stage`) × 10 (10·20·30·40). dim, 이미 딴 별을 다시 딴 경우, 하위 퀘스트(더 작게 해 보기)로 이미 밝아진 별은 0. 감점은 없다.
  - 규칙은 뷰 `v_star_points` 한 곳, 총점의 기준은 뷰 `v_user_points` (별을 처음 밝힐 때만 더하므로 (사용자, 별)당 한 번만 셈). 적립 기록 테이블은 없다.
  - 같은 별을 동시에 두 번 보내면 두 응답 모두 `pointsEarned`가 나올 수 있지만 총점(`v_user_points`, 밤하늘 `totalPoints`)은 한 번만 센다. 화면은 저장 중 버튼을 막는다.
  - 저장 실패(500)에는 `pointsEarned`·`totalPoints`를 보내지 않는다.
  - 화면 문구: 순위·비교·연속 기록 표현을 쓰지 않는다 ([기능 완료 기준](기획/기능완료기준과_콘텐츠.md) "포인트").
- 프론트 처리: 저장 중 버튼 비활성화(중복 클릭 방지), 201 뒤에만 응원 표시 후 밤하늘로. 500이면 입력 유지 + 다시 저장하기, `help`가 있으면 같이 표시.
- 다음 행동(`nextAction`: smaller·retry·swap·stop) 저장과 AI 제안은 후속 API로 분리한다 (11/21 예정, 아래 "만들 것").

### 4. 밤하늘 — `GET /api/sky` (윤석 담당 범위, 현재 구현은 고은비)

```jsonc
// 200 (새 시드 기준 예시)
{
  "totalPoints": 0,             // feat/points 추가. feat/meteor-points부터 별 + 유성 + 체크인 합계 (= 뷰 v_user_points.total_points)
  "stars": [
    {
      "starId": 28, "title": "집 근처 산책로 한 바퀴 돌기", "description": "집 근처 산책로를 천천히 한 바퀴 걸어요. 중간에 돌아와도 괜찮아요.",
      "constellationId": 6, "constellationName": "여우자리", "position": 2, "verifyType": "self",
      "status": "dim",          // untried | dim | bright. 한 번이라도 bright면 bright
      "attempts": 2,
      "points": 0,              // feat/points 추가. bright면 이 별의 점수(난이도 × 10), 아니면 0 (따기 전에는 점수를 알려주지 않음)
      "memories": [             // 이 사용자의 시도만, 최신순. 시도마다 한 줄
        { "attemptId": 5, "date": "2026-11-20", "status": "dim", "reflection": "오늘은 산책로 입구까지만" },
        { "attemptId": 3, "date": "2026-11-19", "status": "dim", "reflection": "현관문을 열고 잠깐 서 봤어요" }
      ]
    },
    { "starId": 1, "title": "창문 열고 5분 바깥 공기 쐬기", "description": "창문을 열고 바깥 공기를 5분 느껴 봐요. 나가지 않아도 괜찮아요.",
      "constellationId": 1, "constellationName": "카시오페이아자리", "position": 1, "verifyType": "self",
      "status": "untried", "attempts": 0, "points": 0, "memories": [] }
  ]
}
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 500 { "error": "지금은 밤하늘을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }
// 503 { "error": "지금은 밤하늘을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }   // 세션 조회 DB 장애
```

- 별 목록은 **시드의 모든 별**(현재 40개, 별자리 10개)을 단계·별자리·순서대로 준다. 별자리 ID·이름은 도감(`catalog/characters.ts`)과 같다 (별자리 선택 API가 생기면 바꿈).
- `totalPoints`·`points`는 위 "3. 별 시도 저장"의 포인트 규칙과 같은 뷰로 계산한다. 별자리 하나를 다 따면 1단계 30, 2단계 40, 3단계 90, 4단계 160.
  - `feat/meteor-points`부터 `totalPoints`에는 유성·체크인 포인트도 들어간다 (아래 "9. 포인트"). 별 포인트만 필요하면 `stars[].points`를 더한다. 시도 저장 응답의 `totalPoints`도 같은 합계다.
- `status`는 뷰 `v_user_star_status` 기준(최종 상태), `memories`는 개별 시도. 회고 없이 저장한 시도는 `reflection: null`.
- 별 상세 화면 URL(예: `/stars/12`)로 바로 들어와도 이 응답에서 `starId`로 제목을 얻는다.
- 센터 "앞까지 가 본 별"은 새 시드에서 **별 17 "청년센터 방문해서 둘러보기"**(4단계 작은곰자리 1번째, GPS, `category: center`)다. v4 시드와 ID가 같아 화면의 `/stars/17` 링크는 그대로 맞는다 (제목·별자리는 바뀜). GPS 확인이면 `placeId`에 `center:{centerId}`, `placeName`에 센터 이름을 보낸다.

### 5·6. 청년센터와 문의 초안 — 화면 연결 계약 (고은비 → 재희)

> 2026-11-19 12:38 로컬 HTTP로 검증한 실제 응답이다 (`scripts/verify-inquiry-http.mts`, 25/25 통과). **지금 센터는 가상 센터 1곳(`centerId: 9001`)뿐**이라 이 응답 그대로 화면을 만들면 된다.

#### ID는 어디에서 받나

| ID | 받는 곳 | 쓰는 곳 |
| -- | ------- | ------- |
| `centerId` | `GET /api/centers` 목록의 `centerId` (지금은 `9001`) | 센터 상세 `GET /api/centers/{centerId}`, 초안 생성 `POST /api/inquiries`의 본문, 초안 목록 `?centerId=` |
| `draftId` | 초안 생성 응답(201) 또는 `GET /api/inquiries` 목록의 `draftId` | 초안 수정·보냄 기록 `PATCH /api/inquiries/{draftId}` |
| `starId` | `GET /api/sky`의 `stars[].starId` 또는 `POST /api/recommendations`의 `items[].starId` | 별 수행 `POST /api/attempts` |

- 센터와 별은 연결돼 있지 않다. **센터 상세 응답에는 `starId`가 없다.**
- "앞까지 가 보기"는 별 17로 시도를 저장한다 (`POST /api/attempts`, `starId: 17`. 새 시드에서는 '청년센터 방문해서 둘러보기'). 공용 DB에 변경 SQL을 적용하기 전에는 404다.
- URL 경로의 `centerId`는 숫자다. 화면 주소 `/centers/demo`는 화면 쪽 이름이라 API에는 `9001`을 넘긴다.

#### 정상 흐름 (요청 순서대로)

**① 센터 목록** — `GET /api/centers?region=11440` (세션 불필요. `region`은 선택, 시군구 5자리)

```jsonc
// 200
{
  "centers": [
    {
      "centerId": 9001,
      "name": "예시 청년센터",
      "address": "예시 주소 (실제 장소가 아니에요)",
      "regionCode": "11440",
      "isSample": true,   // true면 "예시 데이터예요" 표시
      "source": null      // 가상 센터는 null. 실데이터면 아래 "실데이터 출처" 모양
    }
  ]
}
```

**② 센터 상세** — `GET /api/centers/9001` (세션 불필요)

```jsonc
// 200
{
  "center": {
    "centerId": 9001,
    "name": "예시 청년센터",
    "address": "예시 주소 (실제 장소가 아니에요)",
    "phone": null,      // 확인된 값이 없으면 null. 가상 센터에는 전화번호를 붙이지 않음
    "url": null,
    "regionCode": "11440",
    "lat": null,
    "lng": null,        // 좌표가 null이면 지도 핀을 그리지 않음
    "hours": null,      // null이면 "운영시간은 센터에 확인해 주세요"
    "programs": [ { "title": "예시 프로그램", "summary": "시연을 위한 가상의 프로그램이에요." } ],
    "isSample": true,
    "source": null
  }
}
```

**③ 초안 생성** — `POST /api/inquiries` (세션 필요. AI ⑥ 호출 1번)

```jsonc
// 요청
{ "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?" }   // question 1~300자
// 201 (gemini-3.5-flash-lite 실제 응답)
{
  "draftId": 11,
  "centerId": 9001,
  "question": "처음인데 예약 없이 들러도 되나요?",
  "draft": "안녕하세요. 예시 청년센터의 예시 프로그램에 대해 문의드립니다. 처음 방문하는 경우에 예약 없이 들러서 참여해도 괜찮은지 궁금합니다.",
  "sent": false,          // 초안만 저장한 상태
  "sentAt": null,
  "date": "2026-11-19",   // 초안을 만든 날 (한국 날짜)
  "usedFallback": false,  // true면 기본 틀로 만든 초안 (AI 실패)
  "risk": "normal",
  "help": null,
  "modelVersion": "gemini-3.5-flash-lite"   // 검증용, 화면에서 쓰지 않음
}
```

**④ 초안 수정** — `PATCH /api/inquiries/11` (세션 필요. AI 호출 없음)

```jsonc
// 요청
{ "draft": "안녕하세요. 처음 방문하려고 하는데 예약 없이 잠깐 둘러봐도 괜찮을까요?" }   // 1~1000자
// 200
{
  "draftId": 11, "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?",
  "draft": "안녕하세요. 처음 방문하려고 하는데 예약 없이 잠깐 둘러봐도 괜찮을까요?",
  "sent": false, "sentAt": null, "date": "2026-11-19", "help": null
}
```

**⑤ 재조회** — `GET /api/inquiries?centerId=9001` (세션 필요. 내 초안만, 최신순. `centerId`를 빼면 내 전체 초안)

```jsonc
// 200
{ "drafts": [ { "draftId": 11, "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?",
                "draft": "안녕하세요. 처음 방문하려고 하는데 예약 없이 잠깐 둘러봐도 괜찮을까요?",
                "sent": false, "sentAt": null, "date": "2026-11-19" } ] }
// 초안이 없으면 { "drafts": [] }
```

**⑥ "문의해 봤어요" 기록** — `PATCH /api/inquiries/11` (사용자가 앱 밖에서 직접 보낸 뒤 누르는 버튼)

```jsonc
// 요청
{ "sent": true }   // draft와 함께 보내도 됨
// 200
{ "draftId": 11, "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?",
  "draft": "안녕하세요. 처음 방문하려고 하는데 예약 없이 잠깐 둘러봐도 괜찮을까요?",
  "sent": true, "sentAt": "2026-11-19", "date": "2026-11-19", "help": null }
```

#### 초안 저장 vs 문의를 보냈다는 기록

| 상태 | `sent` | `sentAt` | 화면 문구 예 |
| ---- | ------ | -------- | ------------ |
| 초안만 저장 | `false` | `null` | "초안이에요. 보내기 전에 내용을 확인해 주세요" · **초안만 저장하고 끝내기** 가능 |
| 문의해 봤다고 기록 | `true` | `"YYYY-MM-DD"` | "11월 19일에 문의해 봤어요" |

- **앱은 문의를 보내지 않는다.** `sent: true`는 사용자가 앱 밖에서 직접 보냈다고 누른 기록일 뿐이다.
- 보냄 기록은 되돌리지 않는다 (`sent: false`는 400). 보낸 뒤에도 문장 수정은 된다.
- 초안 저장(①~⑤)과 보냄 기록(⑥), 센터 앞까지 가 본 별(GPS·직접 도착)은 서로 다른 기록이다.

#### 오류와 help

| HTTP | code | 언제 | 화면 처리 |
| ---- | ---- | ---- | --------- |
| 400 | `INVALID` | `centerId`가 숫자 아님, `region` 형식 오류, 질문 비었거나 300자 초과, 초안 1000자 초과, `sent`가 true 아님, PATCH에 `draft`·`sent` 둘 다 없음 | 입력 유지, `error` 문구 |
| 401 | `NO_SESSION` | 세션 쿠키 없음 (초안 API만. 센터 조회는 세션 불필요) | 입력 유지 + 데모 다시 시작 |
| 404 | `NOT_FOUND` | 없는 센터, 없는 초안, **다른 세션의 초안** (구분하지 않음) | "찾을 수 없어요" |
| 500 | `SAVE_FAILED` | 초안 저장·수정 실패 | 생성 실패면 응답의 `draft`를 보여 주되 "저장되지 않았어요" + 다시 저장하기 |
| 500 | `LOAD_FAILED` | 초안 목록 조회 실패 | 다시 불러오기 |
| 503 | `SAVE_FAILED`·`LOAD_FAILED` | 세션 확인 중 DB 장애 (세션이 없는 것이 아님) | 데모를 다시 시작시키지 말고 잠시 뒤 다시 시도 |

```jsonc
// 401
{ "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 404 (다른 세션의 초안을 고치려 할 때도 같음)
{ "error": "초안을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
// 500 초안 생성 저장 실패 — draft는 저장되지 않은 문장
{ "error": "지금은 초안을 저장하지 못했어요.", "code": "SAVE_FAILED", "draft": "안녕하세요. ...", "help": null }
// 400 위기 표현이 담긴 질문이면 오류 응답에도 help
{ "error": "궁금한 점을 300자 이하로 적어 주세요.", "code": "INVALID", "help": { "title": "혼자 감당하지 않아도 돼요", "lines": ["자살예방상담전화 109 (24시간)", "..."] } }
```

- 질문(`question`)과 고친 초안(`draft`)도 사용자 문장이라 위기 표현 판단을 거친다. `help`가 있으면 상태 코드와 관계없이 안내를 띄운다 (세션 없는 401 포함).
- 초안 생성 때 AI가 입력에 없는 숫자(운영시간·전화번호 등)를 넣으면 버리고 기본 틀을 쓴다. 기본 틀: "안녕하세요. {센터 이름}에 처음 문의드려요. {질문} 알려주시면 감사하겠습니다."

#### 실데이터 출처 (인증키 대기)

- 후보: 공공데이터포털 [한국고용정보원_온통청년_청년센터](https://www.data.go.kr/data/15171410/openapi.do). 제공기관 한국고용정보원, 이용허락범위 "제한 없음", 등록·수정 2026-10-14 (2026-11-19 페이지 확인).
- **2026-11-19 13시 기준 `YOUTH_CENTER_API_KEY`가 비어 있어 실데이터를 조회하지 않았다.** 공개 페이지에서 요청 변수·응답 필드의 영문 이름도 확인되지 않았다.
- 실데이터가 들어오면 `source`는 이 모양이고, 확인하지 못한 값(주소·전화·운영시간·좌표)은 `null`로 둔다.

```jsonc
"isSample": false,
"source": {
  "name": "한국고용정보원_온통청년_청년센터",
  "url": "https://www.data.go.kr/data/15171410/openapi.do",
  "basisDate": "YYYY-MM-DD",          // 실제로 조회한 날
  "terms": "이용허락범위 제한 없음"     // 조회 시점 데이터셋 페이지 문구 그대로
}
```

#### 실데이터로 바꿀 때 고칠 곳

| 단계 | 파일·DB | 할 일 |
| ---- | ------- | ----- |
| 1 | `web/.env.local`, Vercel 환경 변수 | `YOUTH_CENTER_API_KEY` 입력 (윤석) |
| 2 | 공용 DB `youth_centers` | 아래 "DB 변경 요청" 2번 칸 추가: `source_name`, `source_url`, `basis_date`, `terms`, `is_sample`, `hours`, `programs` (기존 `source_id`, `name`, `address`, `phone`, `url`, `region_code`, `lat`, `lng`는 그대로 사용) |
| 3 | `web/scripts/collect-centers.mts` (새로 만듦) | 시연 지역(마포구 `11440`) 센터만 소수 조회 → `youth_centers`에 `is_sample=false`, 출처·기준일·이용 조건과 함께 저장. 응답에 없는 값은 NULL |
| 4 | `web/src/app/api/_lib/centers.ts` | `CENTERS` 배열 대신 `youth_centers` 조회로 교체. 응답 모양(`centerId`, `isSample`, `source{name,url,basisDate,terms}`)은 그대로라 화면은 바꿀 필요 없음 |
| 5 | `web/src/app/api/_lib/centers-data.ts` | 가상 센터 9001은 `is_sample=true` 행으로 DB에 옮기거나 그대로 두고 목록에 합침 (시연 리허설용) |
| 6 | `web/src/app/api/_lib/inquiries.ts` | `findCenter`가 DB 조회를 쓰도록 바꿈 (초안 생성 시 센터 확인) |

- `inquiry_drafts.center_id`에는 외래키가 없어 가상 센터 ID(9001)와 실데이터 ID가 함께 들어갈 수 있다. 실데이터 ID는 9000번대를 피한다.


### 7. 개인 맞춤 정책 추천 — `GET /api/policies`, `POST /api/policies/{policyId}/click` (AI ⑤, 윤석, 기획: `docs/기획/정책추천.md`)

```jsonc
// GET /api/policies  → 오늘의 정책 추천 (하루 한 번 생성·저장, 같은 날은 저장된 결과)
// 200
{
  "items": [
    {
      // 2026-11-19 로컬 응답 (키 없음 → 문장 틀 이유)
      "policyId": 137, "title": "2026 고립·은둔 청년 지원",
      "summary": "고립·은둔 청년과 가족을 위한 종합적이고 체계적인 맞춤 지원을 제공한다.",   // AI 쉬운 말 요약 (원문에 없는 숫자 없음)
      "reason": "집에서 온라인으로 신청할 수 있어요",               // AI 맞춤 이유, 실패 시 문장 틀
      "burden": "online", "burdenLabel": "온라인으로 신청",          // online | visit | phone | group
      "difficulty": 1, "difficultyNote": "온라인으로 간편하게 신청",  // 참여 난이도 1~6 (별 단계와 같은 눈금)
      "tags": ["마음건강", "사람과 함께"], "scope": "서울",            // 서울 | 전국 | 서울 마포구
      "applyEnd": null, "applyAlways": true, "deadline": "상시 모집",
      "url": "https://...",
      "needsInquiry": false,                                           // 전화·방문 정책이면 true → 문의 문장 준비하기 연결
      "bucket": "마음·관계",                                           // 분야 묶음: 주거 | 돈 | 일·배움 | 마음·관계 | 여가 | 기타 (추천 3~5개는 서로 다른 묶음 우선)
      "evidence": [                                                    // 원문 문장에서 찾은 객관 항목 (AI 판단 아님). AI 점수 대신 카드에 표시
        { "item": "온라인 신청", "status": "yes" },                    // yes: 원문에 있음 / unknown: "원문에서 확인 필요" (없다는 뜻 아님)
        { "item": "방문", "status": "unknown" }, { "item": "상담·면접", "status": "yes" }, { "item": "서류 제출", "status": "unknown" }
      ],
      "conditionsToCheck": ["소득: 기준 중위소득 150% 이하"],         // 원문에서 확인할 자격 조건 (답하지 않은 칸, "기타", 문장 조건). 없으면 []
      "mayNotFit": []                                                  // 내 정책 신청 정보와 맞지 않을 수 있는 조건. 추천에서는 항상 [] (이미 뺌), ?view=all에서만 생김
    }
  ],
  "usedFallback": false,     // true면 AI 대신 규칙 순서 ("준비해 둔 순서로 보여 드려요")
  "reused": false,           // 같은 날 다시 요청하면 true (AI 호출 없음)
  "maxDifficulty": 2,        // 이번 추천에 쓴 난이도 상한 (내 단계 + 1, 후보가 3개 미만이면 넓힘)
  "basis": { "region": "서울 마포구", "updatedAt": "2026-11-19 17:32" },   // 화면 상단 "정책 정보 기준"
  "modelVersion": "gemini-3.5-flash-lite"   // 새로 만든 추천에만, 검증용
}
// GET /api/policies?view=all → { "items": [...같은 모양, reason은 문장 틀], "basis": {...} }  (AI 없음, 난이도 거르지 않음)
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 500 { "error": "지금은 정책을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }
// 503 같은 문구 (세션 조회 DB 장애)
```

```jsonc
// POST /api/policies/137/click → 원문 열기 기록 ("정보 확인", 신청·참여 아님)
// 200 { "url": "https://..." }   화면은 이 url을 새 탭으로 연다 (기록 실패해도 원문은 열기)
// 400 잘못된 ID / 404 없는 정책 / 500 { "code": "SAVE_FAILED", "error": "기록하지 못했어요. 원문은 그대로 열 수 있어요." }
```

- 추천 개수: **3~5개, 분야 묶음이 겹치지 않게** (정확도가 완벽하지 않아 한 분야에 몰지 않음, 고민기록 #37). AI가 같은 묶음을 또 고르면 건너뛰고, 3개 미만이면 쓰지 않은 묶음에서 규칙 순서로 채움. "나랑 안 맞아요"를 누른 정책은 빠짐.
- 추천 대상: 분류됨 · 개인이 이용 가능(`actionable`) · 신청 가능(상시 또는 마감 전) · 지역(전국, 서울 전체, 내 시군구) · 나이(입력한 경우만) · **자격 조건이 내 정책 신청 정보와 확실히 어긋나지 않음**(입력한 경우만, 8장).
- "모든 정책 보기"는 자격으로 숨기지 않고 `mayNotFit`으로 표시만 한다 (원문 코드가 틀린 경우가 있음). 화면 문구 예: "알려 주신 정보와 맞지 않을 수 있어요 · {mayNotFit}" / "원문에서 확인해 주세요 · {conditionsToCheck}"
- 화면 문구: "자격은 원문에서 확인해 주세요. 요약은 AI가 만들어 틀릴 수 있어요." / 상단 "예시 지역: 서울 마포구 · 정책 정보 기준 {basis.updatedAt}"
- 데이터 수집·분류: `web/scripts/sync-policies.mts` (새·바뀐 정책만 분류). 검증: `web/scripts/verify-policies.mts` (트랜잭션 롤백, 가짜 AI).

```jsonc
// POST /api/policies/{policyId}/feedback — "나랑 안 맞아요" (피드백 루프 입구, 고민기록 #38)
// 요청
{ "reason": "region", "text": "저는 서울인데 부산 게 왔어요" }   // reason: region | eligibility | not_needed | too_hard | other, text는 선택 200자 이하
// 201
{ "feedbackId": 12, "excluded": true, "loop": "pending",          // pending: 데이터 오류인지 루프에서 확인 / personal: 이 사용자 추천만 조정
  "message": "알려 주셔서 고마워요. 이 정책은 다시 추천하지 않을게요. 지역 정보가 맞는지도 확인해 둘게요.", "help": null }
// 400 이유 없음·잘못된 ID·200자 넘음 / 404 없는 정책 / 401 세션 없음 / 500·503 SAVE_FAILED — 모두 text에 위기 표현이 있으면 help 포함
```

- 피드백을 저장하는 즉시 그 사용자의 추천(오늘 저장된 추천 포함)에서 빠진다. "모든 정책 보기"에서는 그대로 보인다.
- 모든 사용자의 데이터 수정은 판정 → 검증 → 승인 루프를 통과한 경우만 (`scripts/run-feedback-loop.mts`, 무료 한도 때문에 시연에서는 실행하지 않음).

```jsonc
// POST /api/policies/{policyId}/helper — 신청 도우미 (챗봇형, 고민기록 #39). 대화는 저장하지 않음, 세션 필요
// 요청
{ "intent": "practice",                       // steps | docs | script | practice | ask | start
  "text": "안녕하세요, 정책 문의드려요",        // ask는 필수, script·practice는 선택. 200자 이하
  "history": [{ "role": "staff", "text": "네, 청년 정책 문의 창구예요. 어떤 일로 연락 주셨어요?" }] }  // practice만, 화면이 들고 있다가 보냄
// 200
{ "intent": "practice", "reply": "",
  "sections": [],                              // steps·docs·start: [{ "title": "원문에 적힌 신청 방법", "items": ["..."] }]
  "script": null,                              // script: { "label": "전화로 말할 때", "opening": "...", "questions": ["..."], "closing": "..." }
  "staffLine": "네, 어떤 점이 궁금하세요?", "tip": "인사를 먼저 해서 좋았어요.", "turnsLeft": 5,   // practice만
  "source": "ai",                              // rule: 원문·정해 둔 문장 / ai: 검사 통과한 AI 문장 / fallback: AI 대신 기본 문장
  "followUps": [],                             // 다음에 보여 줄 버튼
  "help": null, "modelVersion": "gemini-3.5-flash-lite",
  "aiStatus": "ok" }                          // ok | not_used(규칙 버튼) | no_key(키 없음, 로컬 개발 서버) | error(호출 실패·한도) | invalid(형식 틀림) | filtered(원문에 없는 숫자·금지 표현으로 버림)
// 400 이유·ID·글자 수·기록 형식 / 404 없는·분류 전 정책 / 401 세션 없음 / 500 LOAD_FAILED — 모두 위기 표현이면 help 포함
```

- 모델: `POLICY_HELPER_MODEL` (기본 `gemini-3.5-flash-lite`, `/api/health`의 `helperModel`). 로컬 `npm run dev`는 키를 비워 둬서 항상 `no_key` → 실제 AI 확인은 `scripts/verify-apply-helper-live.mts`
- AI 호출: steps·docs·start와 연습 첫 인사는 0번, script·ask·연습 말 1번당 1번. 연습은 사용자 말 6번까지
- AI 문장에 원문에 없던 숫자 → 버리고 기본 문장 (ask는 원문 숫자만, 연습 담당자 말은 숫자 금지). 위기 표현이면 AI 없이 안내만

### 8. 프로필 — `GET /api/profile`, `PUT /api/profile` (윤석, 기획: `docs/기획/프로필.md`)

모든 칸은 선택이다. `null` = 답하지 않음. 유형 이름은 만들지 않는다. 화면 `/profile` "내 정보"와 첫 화면 시작 질문이 사용한다.

```jsonc
// GET /api/profile
// 200
{
  "startAnswers": {                 // 시작 질문을 거치지 않았으면 null
    "range": "near",                // ① home 집 안 | near 집 앞 | out 혼자 외출 | people 사람 있는 곳
    "burden": ["phone"],            // ② people | unfamiliar | phone | morning (여러 개)
    "with": null,                   // ③ alone | together
    "support": "unsure",            // ④ 힘들 때 연락할 사람: yes | unsure | no
    "living": "family",             // ⑤ 누구와 지내는지: alone | family | other
    "needs": ["health"]             // ⑥ 도움이 필요한 것: money_job | health | family | people | unsure (여러 개)
  },
  "policyInfo": {                   // 정책 신청 정보 (AI에 보내지 않음)
    "job": null,                    // unemployed | employed | short_term | daily | freelancer | self_employed | founder | farmer | other
    "school": null,                 // below_high | high_student | high_grad | college_student | college_grad | grad_school | other
    "married": null,                // single | married
    "income": null,                 // 본인 연소득: under_2000 | 2000_3000 | 3000_5000 | 5000_7000 | over_7000 (만원)
    "special": null                 // basic_living | single_parent | disabled | leaving_care | family_carer (여러 개). [] = 해당 없음
  },
  "birthYear": null,
  "currentStage": 2                 // 추천 기준 단계 (① 활동 범위로 정해짐)
}
// 401 NO_SESSION / 404 NOT_FOUND / 500 LOAD_FAILED / 503 (세션 조회 DB 장애)
```

```jsonc
// PUT /api/profile — 보낸 칸만 바꾼다. 응답은 GET과 같은 모양
{ "startAnswers": { "range": "near", "needs": ["health"] } }   // 시작 질문 전체를 보낸다 (빠진 키 = 답하지 않음). range가 있으면 currentStage도 정함 (1·2·3·4, 초안)
{ "policyInfo": { "job": "unemployed", "special": [] }, "birthYear": 2000 }   // 모두 비우거나 policyInfo: null → DB에서 지움
// 400 { "error": "선택지에 없는 답이 있어요.", "code": "INVALID", "help": null, "field": "policyInfo.job" }
// 400 { "error": "출생연도를 확인해 주세요.", "code": "INVALID", "field": "birthYear" }   // 15~45세 범위
// 400 { "error": "저장할 내용이 없어요.", "code": "INVALID" }
// 500 { "code": "SAVE_FAILED", "error": "저장하지 못했어요. 고른 답은 화면에 그대로 있어요." }
```

- DB: `users.policy_info JSONB` 추가 (`db/migrations/20261120_profile.sql`, 여러 번 실행 안전). ④~⑥은 기존 `start_answers`에 키만 늘어남. **공용 Neon 적용은 PR이 합쳐진 뒤 팀에 알리고 진행**
- 검증: `web/scripts/verify-profile.mts` 40/40 (로컬 DB, 트랜잭션 롤백, 가짜 AI). `verify-policies.mts` 39/39 그대로

#### 데모 시작 질문을 질문별 페이지로 바꿀 때 (2026-11-20 확인, 고민기록 #40)

**결론: 기존 `PUT /api/profile`을 그대로 쓴다. 서버 단계별 임시 저장 API는 만들지 않는다.**

- 지금 흐름: 첫 화면에서 질문 ①~③에 답함 (세션 없음) → **데모 시작** → `POST /api/demo/session` → 답이 하나라도 있으면 `PUT /api/profile { startAnswers }` 한 번 (`mobile-flow.tsx`).
- 질문을 답하는 동안은 **아직 세션(사용자)이 없어서** 서버에 단계별로 저장할 곳이 없다. 이전/다음 이동 중 입력값은 화면 상태로 들고 있으면 되고, 새로고침에도 남기려면 `sessionStorage`에 두면 된다 (개인정보가 아닌 선택지 값뿐).
- 서버에 단계별로 저장하려면 첫 질문 전에 세션을 만들고, `start_answers`와 별도로 "다 답했는지"를 둬야 한다 (`start_answers`가 NULL이 아니면 "시작 질문을 거친 사용자"로 세고, 1순위 지표 `v_outside_attempt_rate`의 분모에도 들어감). 시연 흐름에서 얻는 것이 없어 두지 않는다.

질문별 입력값과 저장 위치 (`users`):

| 화면 단계 | 질문 | 요청 키 | 값 | 저장 |
| --------- | ---- | ------- | -- | ---- |
| 1/3 | 요즘 할 수 있는 활동 범위는? | `startAnswers.range` | `home` · `near` · `out` · `people` 하나 | `start_answers.range` + **`current_stage`** (home 1 · near 2 · out 3 · people 4) |
| 2/3 | 부담되는 상황은? (여러 개) | `startAnswers.burden` | `people` · `unfamiliar` · `phone` · `morning` 배열 | `start_answers.burden` (목록 순서로 정리·중복 제거) |
| 3/3 | 혼자 / 함께하는 활동도 | `startAnswers.with` | `alone` · `together` 하나 | `start_answers.with` |

- 마지막 질문을 마치고 **데모 시작**을 누를 때 세 답을 한 번에 보낸다: `{ "startAnswers": { "range": "out", "burden": ["people"], "with": "alone" } }`. 응답(`currentStage` 포함)은 GET과 같아서 결과 화면에 바로 쓸 수 있다.
- 건너뛴 질문은 `null`(또는 키를 빼기). 다 건너뛰면 지금처럼 요청을 보내지 않아도 되고, `{ "startAnswers": {} }`를 보내면 "시작 질문을 거쳤지만 답은 없음"으로 저장된다 (단계 1 그대로).
- ①을 비우면 시작 단계는 그대로다 (1로 내리지 않음). 틀린 값이면 400 + `field`(예: `startAnswers.with`)이고 아무것도 저장하지 않는다.
- ⚠ `startAnswers`는 **통째로 바뀐다** (빠진 키 = 답하지 않음). 이미 "내 정보"에서 ④~⑥을 답한 사용자가 첫 화면 질문을 다시 거쳐 ①~③만 보내면 ④~⑥이 지워진다. 지금은 브라우저에 모드가 남아 있으면 첫 화면을 건너뛰어서 거의 일어나지 않지만, 화면에서 막으려면 데모 시작 뒤 `GET /api/profile`의 `startAnswers`가 `null`일 때만 저장하거나, 받은 값에 ①~③을 덮어 보낸다.
- 검증: `verify-profile.mts`에 위 경우 10개 추가 → **50 / 50**

### 8-1. 프로필 이미지 — `GET /api/profile/avatar`, `PUT /api/profile/avatar` (고은비, 고민기록 #40)

프로필 이미지 = **획득한 별자리의 도감 캐릭터** 또는 기본 캐릭터. 획득 = 그 별자리의 별을 **모두 한 번 이상 땄음**(bright). 도감 화면(`lib/constellations.ts`의 `getCompletedConstellationIds`)과 같은 기준이고, DB 뷰 `v_user_acquired_constellations`로 계산한다. 저장값은 별자리 ID(`users.avatar_constellation_id`), `null` = 기본 캐릭터.

```jsonc
// GET /api/profile/avatar
// 200 — 별자리 전체(도감 순서) + 획득 여부. 화면은 acquired인 것만 고를 수 있게 한다
{
  "avatarConstellationId": 1,         // 지금 프로필 이미지 별자리, null = 기본 캐릭터
  "constellations": [
    { "constellationId": 1, "name": "카시오페이아자리", "acquired": true,  "acquiredDate": "2026-11-20" },  // 마지막 별을 처음 딴 날 (한국 날짜)
    { "constellationId": 2, "name": "돌고래자리",       "acquired": false, "acquiredDate": null }
  ]
}
// 401 NO_SESSION / 404 NOT_FOUND / 500 LOAD_FAILED "지금은 별자리 목록을 불러오지 못했어요." / 503 LOAD_FAILED
```

```jsonc
// PUT /api/profile/avatar
{ "constellationId": 1 }      // 획득한 별자리 ID, 또는 null(기본 캐릭터로)
// 200 — GET과 같은 모양 (바뀐 avatarConstellationId + 목록)
// 400 { "error": "별자리 번호를 확인해 주세요.", "code": "INVALID", "help": null, "field": "constellationId" }   // 키가 없거나 양의 정수·null이 아님
// 403 { "error": "아직 별을 모두 따지 않은 별자리예요. 별을 모두 따면 고를 수 있어요.", "code": "NOT_ACQUIRED", "help": null }
// 404 { "error": "별자리를 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
// 401 NO_SESSION / 500 LOAD_FAILED·SAVE_FAILED / 503 SAVE_FAILED
```

- 캐릭터 그림은 화면이 `catalog/characters.ts`에서 `constellationId`로 찾는다 (`characters.find(c => c.constellationId === id)`). 서버는 캐릭터 문자열 ID(`saebit` 등)를 다루지 않는다.
- 미획득 별자리는 403으로 거절하고 지금 이미지를 바꾸지 않는다. 저장하는 UPDATE 문장에서도 획득 여부를 다시 확인한다. 다른 사용자가 획득한 별자리는 내 것이 아니다.
- 저장된 별자리를 더는 획득한 상태가 아니면(콘텐츠 변경으로 그 별자리에 별이 늘어난 경우) GET은 `avatarConstellationId: null`(기본 캐릭터)로 준다. 별을 마저 따면 다시 고를 수 있다.
- 저장은 됐는데 목록을 다시 읽지 못하면 200 `{ "avatarConstellationId": 1, "constellations": null }` (실패로 보내지 않음).
- ⚠ 지금 화면(`profile-home.tsx`)은 이미지를 브라우저(`localStorage` `naranhi-avatar`)에만 저장하고 캐릭터 전부를 고를 수 있다. API 모드에서는 이 API로 바꾸고, 예시 모드는 밤하늘 예시 기록으로 같은 기준을 적용하면 된다 (화면 담당).
- 검증: `web/scripts/verify-avatar.mts` **30 / 30**

---

### 9. 포인트 — `POST /api/meteors`, `GET /api/points` (고민기록 #32, 고은비, `feat/meteor-points`)

포인트는 세 곳에서 모인다. **총점 = 별 + 유성 + 체크인** (뷰 `v_user_points.total_points`). 밤하늘·시도 저장·체크인·유성 응답의 `totalPoints`는 모두 이 합계다.

| 출처 | 포인트 | 중복 방지 | 저장 |
| ---- | ------ | --------- | ---- |
| 별 처음 따기 | 별자리 난이도 × 10 | (사용자, 별)당 한 번 | 뷰 `v_star_points` (기존) |
| 유성 터치 | +1 | (사용자, 유성 번호)당 한 번, **하루 20개까지** | `point_events` (source `meteor`) |
| 데일리 체크인 | +100 | (사용자, 한국 날짜)당 한 번 | `point_events` (source `checkin`) |

규칙 숫자는 `web/src/lib/points.ts` 한 곳에 있다 (서버 전용 코드를 가져오지 않아 화면에서도 import 가능).

#### 유성 번호 — 화면과 서버가 같은 유성을 가리키는 방법

- 유성은 **서버 시각 기준 16초마다 1개** 떨어진다. 유성 번호 `meteorId = floor(유닉스 초 / 16)`.
- 화면은 `GET /api/points`의 `serverTime`으로 기기 시계와의 차이를 구해 두고, 번호가 바뀔 때마다(= `nextMeteorAt`부터 16초마다) 유성을 하나 그린다. 터치하면 그 유성의 번호를 보낸다.
- 서버는 **떨어진 지 60초 안의 유성과 다음 1개**까지만 받는다 (네트워크 지연·애니메이션 여유, 기기 시계가 조금 빠른 경우). 그 밖의 번호는 `EXPIRED`.
- 하루 한도: 화면을 켜 두기만 해도 시간당 225개가 쌓일 수 있어 하루(한국 날짜) 20개까지만 준다 → 유성 하루 최대 20 < 체크인 100. 숫자는 `lib/points.ts`의 `METEOR_DAILY_LIMIT`에서 바꾼다.

**`POST /api/meteors`** — 떨어지는 유성 터치

```jsonc
// 요청
{ "meteorId": 112196904 }
// 201 이번에 받음
{ "meteorId": 112196904, "pointsEarned": 1, "reason": null, "totalPoints": 101,
  "meteor": { "caughtToday": 1, "dailyLimit": 20 } }
// 200 받지 못함 (오류 아님) — 같은 유성 다시 / 하루 한도 / 지난·아직 안 온 유성
{ "meteorId": 112196904, "pointsEarned": 0, "reason": "ALREADY_CAUGHT", "totalPoints": 101,
  "meteor": { "caughtToday": 1, "dailyLimit": 20 } }
// reason: null(받음) | ALREADY_CAUGHT | DAILY_LIMIT | EXPIRED
// 400 { "error": "meteorId가 필요해요.", "code": "INVALID", "help": null }   // 양의 정수가 아님
// 401 NO_SESSION / 500 SAVE_FAILED "지금은 유성을 담지 못했어요." / 503 SAVE_FAILED (세션 조회 DB 장애)
```

- 같은 유성을 다시 보내도(재시도·연타·동시 요청) 한 번만 적립된다 (DB `UNIQUE (user_id, source, ref_key)`). 2026-11-20 HTTP로 같은 유성 6번 동시 요청 → 201 1번, 200 5번.
- 화면: `pointsEarned > 0`일 때만 "+1"을 띄운다. `DAILY_LIMIT`이면 그날은 유성을 그리지 않거나 터치만 막아도 된다 (`GET /api/points`의 `caughtToday`·`dailyLimit`). 응답을 기다리지 않고 유성은 바로 사라지게 해도 된다.
- ⚠ 하루 한도는 서로 다른 유성을 동시에 보내면 받을 수 있는 유성 수(최대 6개)만큼 넘을 수 있다. 같은 유성 중복은 생기지 않는다.

**`GET /api/points`** — 포인트 합계와 출처별 내역, 유성 일정

```jsonc
// 200 (2026-11-20 로컬 HTTP 검증 실제 응답: 체크인 1번 + 유성 1개 + 1단계 별 1개)
{
  "totalPoints": 111,                                  // = stars.points + meteor.points + checkin.points
  "stars":   { "points": 10, "brightStars": 1 },
  "meteor":  { "points": 1, "caughtToday": 1, "dailyLimit": 20, "pointsEach": 1,
               "intervalSeconds": 16, "graceSeconds": 60,
               "currentMeteorId": 112196904, "nextMeteorAt": "2026-11-20T04:54:40.000Z" },
  "checkin": { "points": 100, "doneToday": true, "pointsEach": 100 },
  "serverTime": "2026-11-20T04:54:27.815Z"
}
// 401 NO_SESSION / 500 LOAD_FAILED "지금은 포인트를 불러오지 못했어요." / 503 LOAD_FAILED
```

- 화면 문구는 기존 포인트 원칙을 따른다: 순위·다른 사람과 비교·연속 기록(며칠 연속 체크인 등) 표현을 쓰지 않는다. 그래서 체크인 일수·연속 일수는 응답에 넣지 않았다.

## 만들 것 (기획: `docs/기획/아이디어_v4.md`)

| API | 기능 | 비고 |
| --- | ---- | ---- |
| 시작 질문 저장 | 시작 질문 3개 답 → 시작 단계 | `users.start_answers`, `current_stage` |
| 별자리 선택 | 고른 별자리 저장 → 밤하늘 범위 | `user_constellations` |
| 시도 후 다음 행동 (AI ①) | 이유 → 더 작게 / 다른 날 / 다른 별 / 마치기 제안, 사용자 선택 저장 | `stop_reason`, `next_action`. 11/21 |
| 청년센터 실데이터 수집 | 온통청년 청년센터 API → 저장 | 인증키·DB 칸 필요 |
| 센터 행동 기록 | 상세 보기(`viewed`)·"참여했어요"(`joined`) 저장 | `center_events` (테이블 준비됨). 센터 "앞까지 가 본 별"은 별 17로 시드 완료 (새 시드에서도 17) |
| 주변 장소 | GPS 별의 목표 장소 (카카오 로컬) | 좌표 저장 안 함 |
| 정책 추천 화면 연결 | 위 7번 API → 청년센터·바깥 지도 화면 "나에게 맞는 정책" | API 완료 (`feat/policy-recommend`). 예약 수집은 추후 |

---

## AI 기능 현황 (2026-11-19 기준)

### 모델 — 실호출 결과

| 요청 모델 (`GEMINI_MODEL`) | 응답 `modelVersion` | 2026-11-19 결과 | 판단 |
| -------------------------- | ------------------- | --------------- | ---- |
| `gemini-3.5-flash` (현재 `.env.example` 값) | `gemini-3.6-flash` | 오전에 10초·20초 초과, 503(수요 과다) 반복. 11:27에 2회 성공(1.7~2.9초). 11:28 흐름 검증 중 **429: 무료 등급 하루 요청 한도 20건 초과** (오류 메시지 그대로: `generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash`) | **시연에 부적합** (하루 20건) |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | 오전부터 약 90건 호출, 대부분 3.7~7초 응답. 503 1건(기본값 처리), 한도 오류 없음 | **권장** |
| `gemini-3.6-flash` 직접 | `gemini-3.6-flash` | 503 1회, 12.5초 1회 | 10초 제한 밖 |
| `gemini-2.5-flash` | — | 404 (신규 사용자 제공 중단) | 사용 불가 |

- **권장: 배포·로컬 모두 `GEMINI_MODEL=gemini-3.5-flash-lite`.** 한 사용자 흐름(체크인·추천·회고·초안)에 4번 안팎 호출하므로, 하루 20건이면 키 하나로 시연 5번 정도에서 멈춘다. flash-lite의 무료 한도 숫자는 공식 문서에 없고 키 주인의 AI Studio 사용량 화면에서만 확인된다. 일일 한도는 미국 태평양 시간 자정(한국 시간 17:00)에 초기화된다 ([공식 안내](https://aistudio.google.com/docs/rate-limits)).
- 제출 문서에는 실제 배포 환경 변수 값과 응답 `modelVersion`을 함께 적는다. `gemini-3.5-flash`로 요청하면 `gemini-3.6-flash`가 응답하므로 둘을 구분해 적는다.
- 공통 처리: `web/src/lib/gemini.ts`의 `generateJson`. JSON 스키마 지정 → 검증 함수 통과 못 하면 기본값. 키 없음·네트워크 오류·**10초 초과**·빈 응답·JSON 아님도 기본값. 실제 응답 모델 버전과 기본값 사유를 돌려준다.
- 모델에 보내지 않는 것: 닉네임, 사용자 ID, 지역 코드, 출생 연도, (추천 시) 회고 원문. 무료 등급은 입력이 서비스 개선에 쓰일 수 있어 가상 문장만 사용한다.

### 실호출 기록 — 새 가상 세션으로 기능마다 1번 (`scripts/verify-ai-live.mts`)

판정 기준: AI 호출 성공은 **각 응답의 `usedFallback: false`와 응답 `modelVersion`**으로만 본다. `/api/health`의 `geminiModel`은 서버 설정값일 뿐이다. 아래 키 없음 실행에서 설정값은 `gemini-3.5-flash-lite`였지만 모든 응답이 기본값이었다.

**로컬, `GEMINI_MODEL=gemini-3.5-flash-lite`, 2026-11-19 12:38 KST** (브랜치 `feat/center-inquiry`, 공용 Neon)

| 기능 | HTTP | 요청 모델(서버 설정) | 응답 `modelVersion` | `usedFallback` | 비고 | 확인 시각 (KST) |
| ---- | ---- | -------------------- | ------------------- | -------------- | ---- | --------------- |
| ② 체크인 마음 날씨 | 200 | gemini-3.5-flash-lite | **응답에 칸 없음** | false | weather=partly_cloudy | 12:38:45 |
| ① 추천 (최초 호출) | 200 | gemini-3.5-flash-lite | gemini-3.5-flash-lite | false | reused=false, 별 11·13 | 12:38:47 |
| ① 추천 (같은 날 재요청) | 200 | 모델 호출 없음 | 응답에 칸 없음 | false (최초 값 그대로) | **reused=true**, 최초와 같은 별·이유 | 12:38:48 |
| ④ 회고 응원 | 201 | gemini-3.5-flash-lite | gemini-3.5-flash-lite | false | help=null | 12:38:49 |
| ⑥ 문의 초안 (가상 센터) | 201 | gemini-3.5-flash-lite | gemini-3.5-flash-lite | false | sent=false | 12:38:50 |

- 같은 날 재요청한 추천은 모델을 부르지 않았다. `reused: true`이고 `modelVersion` 칸이 없다. 최초 호출과 섞어 세지 않는다.
- 위 실행 당시 체크인 응답에는 `modelVersion` 칸이 없어 성공 근거는 `usedFallback: false`뿐이었다. 이후 체크인 응답에 `modelVersion`을 추가했다 (윤석, `feat/checkin-model-version`).

**로컬, 키 없음 (`GEMINI_API_KEY` 비움), 2026-11-19 12:39 KST** — `/api/health` 설정값은 `gemini-3.5-flash-lite`, `gemini: "no key"`

| 기능 | HTTP | 응답 `modelVersion` | `usedFallback` | 응답 내용 |
| ---- | ---- | ------------------- | -------------- | --------- |
| ② 체크인 | 200 | 응답에 칸 없음 | true | weather=partly_cloudy (기본값) |
| ① 추천 (최초) | 200 | null | true | 실제 후보 11·12·13 + 기본 이유 |
| ① 추천 (재요청) | 200 | 응답에 칸 없음 | true | reused=true |
| ④ 회고 응원 | 201 | null | true | "오늘 손을 뻗어 본 순간을 이 별에 담았어요." |
| ⑥ 문의 초안 | 201 | null | true | "안녕하세요. 예시 청년센터에 처음 문의드려요. …" 기본 틀 |

**공개 주소 `https://itda-naranhi.vercel.app` — 확인 전**

- 2026-11-19 12:34·12:39 KST 기준 `/api/health`의 `geminiModel`이 아직 `gemini-3.5-flash`다 (운영 모델 미적용, 배포 커밋 `1a541b3`). 이 모델은 오전에 무료 하루 한도 20건을 넘긴 기록이 있어 공개 주소 AI 호출은 하지 않았다.
- 윤석이 운영 환경 변수를 `gemini-3.5-flash-lite`로 바꾸고 재배포하면 아래를 **한 번만** 실행해 이 표를 채운다.

```bash
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-ai-live.mts --base=https://itda-naranhi.vercel.app
```

### 기능별

| # | 기능 | 위치 | 입력 → 출력 | 기본값 (실패 시) | 구현·검증 범위 |
| - | ---- | ---- | ----------- | ---------------- | -------------- |
| ① | 오늘의 별 추천 | `api/recommendations/` | 오늘 선택, 부담 상황, 마음 날씨, 체크인 한 줄, 최근 시도 5개(별 제목·결과·멈춘 이유), 후보 별 최대 8개 → `{ items: [{ starId, reason }] }` | 후보 앞에서 최대 3개 + 범위별 기본 이유. 쉬어 가기는 빈 추천 | **구현·검증**: 실제 추천, 쉬어 가기, 반복 요청 일관성, 후보 밖 ID 제거, 금지 표현 이유 교체, 키 없음·잘못된 키·한도 초과, 다른 세션 거절 |
| ① | 시도 후 다음 행동 | 미구현 | 멈춘 이유 + 별 → 다음 행동 제안 | 이유별 고정 문구(기능 완료 기준 문서) | **미구현** (11/21) |
| ② | 마음 날씨 | `api/checkin` (윤석) | 체크인 한 줄 → `{ weather, risk }` | `partly_cloudy`, 위험은 규칙 판단 | 실호출 `usedFallback: false`, 키 없음 `true` 확인. 응답에 `modelVersion` 칸 없음 |
| ③ | 위기 표현 안내 | `lib/safety.ts` + 체크인·회고·문의 | 문장 → 규칙(직접·간접) + AI 위험도 중 높은 쪽 | AI 실패 시 규칙 + 부정 감정 표현으로 최소 caution | **회고 처리 함수로 가상 문장 30개 검증**, 문의 질문·초안 수정에도 적용 |
| ④ | 회고 응원 | `lib/reflection.ts` | 별 제목, 결과(bright/dim), 멈춘 이유, 회고 → `{ cheer, risk }` | bright "오늘 해낸 일을 이 별에 담았어요." / dim "오늘 손을 뻗어 본 순간을 이 별에 담았어요." | **구현·검증**: 실제 응원, 금지 표현 교체, 회고 없음, 호출 예외·형식 오류, 위기 표현 시 기본 문구 |
| ⑤ | 정책 참여 부담 분류 | 미구현 | 정책 설명 → 참여 방식 + 요약 | — | **미구현** (정책 API 키 없음) |
| ⑥ | 문의 문장 초안 | `api/inquiries` | 센터 이름·프로그램 요약, 사용자 질문 → `{ draft, risk }` | "안녕하세요. {센터}에 처음 문의드려요. {질문} 알려주시면 감사하겠습니다." | **구현·검증 (가상 센터만)**: 실제 초안, 입력에 없는 숫자 차단, 저장 실패 시 초안 유지, 생성 → 수정 → 재조회 → 보냄 기록 HTTP 확인 |

AI 출력 검사 (`lib/safety.ts`의 `isSafeAiText`): 위험 표현, 지시·과장·진단 표현("반드시", "~해야 해요", "완벽", "최고", "대단", "진단", "치료" 등)이 있거나 길이를 넘으면 쓰지 않고 기본값. 실제로 `gemini-3.6-flash`가 "정말 대단해요!"를 낸 사례가 있어 이 필터에 걸린다.

## 검증 기록

> 2026-11-19 11:26~11:36 (한국 시간), 브랜치 `feat/star-api` (윤석 `feat/demo-platform`, `master` 합친 상태). 공용 Neon DB와 실제 Gemini 대상. 입력은 모두 가상 문장이다.
> 로직 검증은 트랜잭션 안에서 가상 사용자로 실행하고 **롤백**했다. HTTP 검증은 실제 데모 세션 2개를 만들고, 끝난 뒤 그 쿠키에 묶인 사용자 2명만 지웠다 (다른 팀원의 데모 사용자는 건드리지 않음).

### 실행 방법 (web/에서)

```bash
node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts --check   # quests.json과 시드·Neon 동기화 SQL이 같은지 (고친 뒤에는 --check 없이 실행해 다시 생성)
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --no-key   # 키 없음
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --ai-fail  # 잘못된 키
GEMINI_MODEL=gemini-3.5-flash-lite node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts
GEMINI_MODEL=gemini-3.5-flash-lite node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-safety.mts
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-points.mts            # 유성·체크인 포인트, 합산 밸런스 (20261121_reward_points.sql 적용된 DB)
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-avatar.mts            # 프로필 이미지 (20261121_profile_avatar.sql 적용된 DB)
# 서버를 띄운 뒤 (npm run build && npx next start -p 3107)
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-http.mts --base=http://localhost:3107
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-inquiry-http.mts --base=http://localhost:3107   # 센터·문의 초안
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-ai-live.mts --base=http://localhost:3107       # AI 실호출 기록 (공개 주소는 1번만)
```

### 2026-11-20 유성·체크인 포인트 검증 (브랜치 `feat/meteor-points` = `master` 761c820 + 이번 변경, 로컬 Docker만, 키 없음)

| 검증 | 결과 | 비고 |
| ---- | ---- | ---- |
| 새 DB(`db/init`) — `verify-points.mts` | **44 / 44 통과** | 유성 +1·같은 유성 중복 0·지난 유성·하루 한도(어제 것은 세지 않음)·사용자별 판단·UNIQUE 거절, 체크인 +100·같은 날 0·다음 날 다시, 별 + 유성 + 체크인 = 총점 = 응답 적립 합 = 뷰 = 밤하늘, DB 실패 시 500 |
| 새 DB — `verify-star-api.mts --no-key` | **81 / 81 통과** | 기존 별 포인트·추천·시도 회귀 없음 |
| Neon 경로: master `db/init` + 가상 시도(별 포인트 20) → `20261121_reward_points.sql` 2번 | 에러 없음, 기록 그대로 | 20점 유지. `point_events`·`v_user_points` 정의가 새 DB와 같음 |
| HTTP (쿠키 세션, `next dev`) | 기대대로 | 세션 없음 401, 체크인 100→0, 유성 201→중복 200·지난 유성 EXPIRED·잘못된 번호 400, 시도 총점 111 = `GET /api/points` = 밤하늘, `/api/health`의 `pointEvents: ready`, 같은 유성 동시 6번 → 적립 1번 |
### 2026-11-20 프로필 이미지·시작 질문 저장 검증 (브랜치 `feat/profile-avatar` = `master` 761c820 + 이번 변경, 로컬 Docker만, 키 없음)

| 검증 | 결과 | 비고 |
| ---- | ---- | ---- |
| 새 DB(`db/init`) — `verify-avatar.mts` | **30 / 30 통과** | 잘못된 요청 400, 일부만 딴·dim·다른 사용자 별자리 403, 없는 별자리 404, 획득 날짜, 화면 `getCompletedConstellationIds` 결과 = 서버 목록, 별이 늘면 미획득·기본 캐릭터, 외래키, DB 실패 500 |
| 새 DB — `verify-profile.mts` | **50 / 50 통과** (기존 40 + 시작 질문 10) | ① 범위별 시작 단계 1·2·3·4, ①~③만 보냄 = 6칸 보냄, 다 건너뜀, 틀린 값, ④~⑥ 지워지는 현재 계약 |
| 새 DB — `verify-star-api.mts --no-key` | **81 / 81 통과** | 회귀 없음 |
| Neon 경로: master `db/init` + 가상 기록(별자리 1 완성) → `20261121_profile_avatar.sql` 2번 | 에러 없음, 기록 그대로 | users 칸·외래키·뷰 정의가 새 DB와 같음. 기존 사용자 획득 별자리 1이 바로 보임 |
| HTTP (쿠키 세션, `next dev`) | 기대대로 | 세션 없음 401, 데모 시작 → `PUT /api/profile` ①~③ → 단계 2, 미획득 403 → 별 5개 따기 → 200, 미획득 2 → 403, 999 → 404, 문자 → 400, 다시 조회 = 1 |
| `tsc --noEmit`, eslint (바꾼 파일) | 통과 | |

### 2026-11-20 오후 별자리를 도감 10개로 맞춘 뒤 재검증 (브랜치 `feat/points`, 로컬 Docker만, 키 없음)

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| 동기화 SQL `20261121_quests_sync.sql` — 지금 Neon과 같은 DB(최신 master + points + survey)에 시도·설문·하위 퀘스트 시도·옛 별자리 기록을 넣고 2번 실행 | 에러 없음, **시도 기록 그대로** | 포인트 70점 그대로, 오늘의 추천·체크인 그대로. 지운 것은 옛 별자리 11번을 가리키던 `user_constellations` 1줄뿐 |
| 새 DB / master + points + 동기화 / Neon과 같은 DB + 동기화 | 별자리 10개·별 40행·하위 퀘스트 같음, 번호 10/40/40 | 스키마는 새 DB = master + points + 동기화 (설문 칸은 #21에서) |
| `verify-star-api.mts --no-key` | **81 / 81** | 새 검사: 별자리 = 도감 캐릭터 10명(순서·이름·테마) |
| `verify-profile` / `verify-policies` | **40 / 40**, **41 / 41** | |
| `npm run build` → `next start` HTTP — `verify-http` / `verify-inquiry-http` | **20 / 20**, **25 / 25** | 밤하늘 API: 별자리 10개, 별 수 5·5·4·3·3·4·3·5·3·5 |
| `eslint`, `tsc` (`next typegen` 뒤) | 오류 없음 | |

 (브랜치 `feat/points`, 로컬 Docker만, 키 없음)

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| `gen-quest-seed.mts --check` | 통과 | 시드·변경 SQL이 `quests.json`과 같음. 제목 중복 JSON으로 실패하는 것도 확인 |
| 새 DB / 최신 master `db/init` + 포인트(2번) / 옛 `db/init` → 변경 SQL 4개(이름 순서, 포인트 2번) | 콘텐츠(별 40행·하위 퀘스트 40개)·스키마 3개 모두 같음 | 시도·추천 비움, 사용자·체크인·초안 유지. 별·하위 퀘스트 번호는 41부터 |
| `verify-star-api.mts --no-key` ×3 | **80 / 80 통과** | 별자리·별·하위 퀘스트를 `quests.json`과 직접 비교. 포인트: 별자리 합계 = 난이도 × 10 × 별 수, 총점 240점·11개 |
| `verify-policies` / `verify-profile` | **41 / 41**, **40 / 40** | |
| HTTP `verify-http` / `verify-inquiry-http` | **20 / 20**, **25 / 25** | |
| `eslint`, `tsc --noEmit` | 오류 없음 | |

### 2026-11-20 master(PR #9~#17: ERD v4, 정책·프로필·카탈로그) 합친 뒤 재검증 (브랜치 `feat/points`, 로컬 Docker만)

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| A. 새 DB (합친 `db/init`) — `verify-star-api.mts --no-key` | **81 / 81 통과** | v4 구조 검사 추가: 하위 퀘스트 8개 모두 바깥 별, 센터 앞 GPS 별 1개, 1단계 집 안, 사진 확인 별 없음 |
| B. master `db/init` + 가상 기록(하위 퀘스트 시도·센터 기록 포함) → `20261120_points.sql` 2번 | **81 / 81 통과** | 콘텐츠·스키마 A와 같음. 시도·추천 비움, 사용자·체크인·초안·센터 기록 유지 |
| C. Neon 경로: 옛 `db/init` + 가상 기록 → `20261120_erd_v4_alignment.sql` → `20261120_points.sql` 2번 | **81 / 81 통과** | 콘텐츠 A와 같음, 스키마는 칸 순서만 다름(v4의 `ADD COLUMN`) |
| D. 순서 오류: 옛 `db/init` → `20261120_points.sql`만 | 의도대로 실패 | "v4를 먼저 적용해 주세요"로 멈추고 아무것도 바뀌지 않음 |
| HTTP (`next dev`, A, 키 없음) — `verify-http.mts` / `verify-inquiry-http.mts` | **20 / 20**, **25 / 25 통과** | master가 추가한 바깥 → 집 안 범위 케이스 포함 |
| `eslint src scripts`, `tsc --noEmit` | 오류 없음 | |
| PR #13~#17까지 합친 뒤: 새 DB / 최신 master `db/init` + 포인트 / 옛 `db/init` → 변경 SQL 4개(이름 순서, 포인트 2번) | 콘텐츠·스키마 3개 모두 같음, `verify-star-api` **81 / 81** ×3 | 정책 `verify-policies` **41 / 41**, `verify-profile` **40 / 40**, HTTP **20 / 20**·**25 / 25**. `tsc`는 `next typegen`으로 라우트 타입을 다시 만든 뒤 통과 |

### 2026-11-19 포인트·새 시드 검증 (17:48~17:50 KST, 브랜치 `feat/points` = `master` d710e8b + 이번 변경)

공용 Neon은 쓰지 않았다. 로컬 Docker `postgres:16` 두 개에 `DATABASE_URL`을 덮어써서 실행했다 (Gemini 호출 없음).

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| 새 DB (`db/init` 새 스키마·시드) — `verify-star-api.mts --no-key` | **80 / 80 통과** | 시드 규칙, 추천 범위, 포인트 포함 |
| 기존 DB 재현 (master `db/init` + 가상 시도 기록) → `20261119_points.sql(현재 이름 20261120_points.sql)` 2번 실행 → `verify-star-api.mts --no-key` | **80 / 80 통과** | 2번 실행해도 같은 결과. 사용자·체크인 유지, 시도·추천 비움. 새 DB와 별자리·별·점수 30행 동일, 뷰 정의 동일 |
| HTTP + 실제 쿠키 세션 (`next dev`, 새 DB, 키 없음) — `verify-http.mts` | **17 / 17 통과** | dim 0점 → 처음 bright 20점 → 다시 bright 0점, 밤하늘 총점 일치, 다른 세션 0점 |
| `eslint src scripts`, `tsc --noEmit` | 오류 없음 | |

- 시드: 별자리 10개, 난이도 1·2·3·4 = 1·3·3·3개, 별 수 = 난이도(1단계 3개), `star_count` 일치, 별 30개 제목 중복 없음, 별 점수 = 난이도 × 10, GPS 별에만 `place_type`
- 포인트: 포인트 없는 사용자는 뷰에 행 없음(0) / 같은 별 다시 완료 0점 / 하위 퀘스트로 밝아진 별은 1번만 / 별자리 완성 30·40·160점 / dim 0점 / 응답 적립 합 = 뷰 총점 = 밤하늘 총점 (230점, 9개) / 저장 실패 시 적립 없음
- 추천: 1단계 사용자 집 안 후보 3개(별 1~3), 쉬어 가기 뒤 집 안, 후보 밖 ID 제거, 2단계 사용자 바깥 → GPS 별 11부터

### 2026-11-19 점심 추가 검증 (12:37~12:39 KST, 브랜치 `feat/center-inquiry` = `master` 1a541b3 + 이번 변경)

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| 키 없음 로직 검증 (`verify-star-api.mts --no-key`, 먼저 실행) | **61 / 61 통과** | Gemini 호출 없음. 회고 저장 실패 → 500 + help + cheer 없음, 초안 생성 → 수정 → 재조회 → 보냄 기록 포함 |
| 센터·문의 초안 HTTP (`verify-inquiry-http.mts`, flash-lite) | **25 / 25 통과** | 실제 쿠키 세션 2개. AI 호출은 초안 생성 1번 |
| AI 실호출 기록 (`verify-ai-live.mts`, flash-lite) | 4기능 모두 `usedFallback: false` | 위 "실호출 기록" 표 |
| AI 실호출 기록, 키 없음 | 4기능 모두 `usedFallback: true` | 기본 응답 확인 |

- 센터·문의 HTTP에서 확인한 것: 가상 센터의 `isSample: true`·`source: null`·전화·운영시간·좌표 `null`, 없는 센터 404, 형식 오류 400, 세션 없음 401(위기 표현이면 help), 초안 생성 직후 `sent: false`, 수정 후 재조회에 고친 문장, 다른 세션에서 목록에 안 보이고 수정·보냄 기록 404, 보냄 기록 뒤 `sent: true`·`sentAt` 날짜·문장 유지
- 테스트로 만든 데모 사용자는 실행마다 그 쿠키의 사용자만 지웠다 (47·48·49·50번).

### 결과

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| 키 없음 (기본값 경로, 먼저 실행) | **55 / 55 통과** | 모든 AI 기능이 기본값으로 동작 |
| 잘못된 키 | **55 / 55 통과** | 실제 호출 9건이 400 `API_KEY_INVALID` → 기본값 |
| `gemini-3.5-flash` (설정값) | 54 / 56 | 실패 2건은 회고 응원 호출이 10초 초과 → 기본값. 뒤이어 429 하루 한도 초과. 추천·문의 초안은 실제 응답 |
| `gemini-3.5-flash-lite` | **56 / 56 통과** | 추천·회고·초안 실제 응답. 503 1건은 기본값 처리 |
| HTTP + 실제 쿠키 세션 (`gemini-3.5-flash-lite`) | **14 / 14 통과** | 아래 |

확인한 항목

- **정상 추천:** 집 근처 체크인 → 실제 시드 별 2개 + AI 이유 (위 "정상" 예시가 실제 응답)
- **쉬어 가기:** 빈 추천, AI 호출 0회, 저장 안 함. 그 뒤 같은 날 집 안으로 체크인하면 새 추천 생성
- **반복 요청 일관성(당시 구현):** 같은 요청 3번 모두 같은 별·같은 이유, AI 호출 0회. 이후 활동 범위를 바꾼 요청에 현재 범위를 적용하도록 수정했다.
- **Gemini 실패 시 기본값:** 키 없음·잘못된 키·형식 오류·호출 예외·모두 후보 밖 → 유효한 실제 후보 + 기본 이유. 바깥 선택이면 GPS 별 16부터
- **후보 밖 ID:** 없는 별 999, 범위 밖 GPS 별, 중복 제거. 금지 표현 이유만 기본 이유로 교체
- **다른 세션의 체크인 거절:** 브라우저 B가 A의 체크인으로 추천 → 404 (HTTP·로직 모두). 세션이 없으면 401이며 현재 오류 코드는 `NO_SESSION`이다.
- **회고 처리 함수:** 반환 키가 `cheer`·`help` 두 개. 회고 없음 → AI 호출 없음. 호출 예외·형식 오류 → 기본 응원 + 규칙 기반 help. AI가 normal이어도 규칙 danger면 help
- **시도 저장 오류에도 help:** 가짜 DB로 INSERT 실패 → 500 `SAVE_FAILED` + help 유지 + cheer 없음. DB 전체 장애도 500 + help. 세션 없이 위기 표현 회고 → 401 + help (HTTP)
- **새로고침 후 회고 조회:** 같은 쿠키로 밤하늘 재조회 → 같은 별에 날짜·회고. 다른 세션의 밤하늘에는 기록 없음. 데모 시작을 다시 눌러도 같은 사용자

### 위기 표현 검증 — `web/scripts/verify-safety.mts`

- 가상 회고 문장 30개를 회고 처리 함수에 넣음. 실제 상담 내용·개인정보 아님. 2026-11-19 11:34 KST, `gemini-3.5-flash-lite`, **30건 모두 AI 응답**
- 구성: 직접 표현 6, 간접 표현 6 (안내가 떠야 함) / 부정문·타인 이야기·관용 표현 6, 일상적인 부정 감정 6, 평범한 회고 6 (안내가 뜨지 않아야 함)

| 판단 방식 | 놓친 위험 문장 | 과잉 안내 |
| --------- | -------------- | --------- |
| 규칙만 (오전 첫 실행, 규칙 보완 전) | 3 / 12 | 3 / 18 |
| 규칙 + AI (오전 첫 실행) | 0 / 12 | 3 / 18 |
| 규칙만 (규칙 보완 후, 11:34 재실행) | 0 / 12 | 3 / 18 |
| AI 실패 시 = 규칙 + 부정 감정 (11:34) | 0 / 12 | 8 / 18 |
| **규칙 + AI = 실제 동작 (11:34)** | **0 / 12** | **3 / 18** |

- 첫 실행에서 규칙이 놓친 3건("나 하나 없어도 아무도 모를 거예요", "내일이 안 왔으면 좋겠어요", "다 놓아버리고 싶어요")은 AI가 잡았다. AI가 실패해도 안내가 빠지지 않도록 간접 규칙에 추가했다. **같은 문장으로 다시 잰 결과라 새 문장에 대한 성능을 뜻하지 않는다.**
- 과잉 안내 3건: "죽고 싶을 만큼은 아니고…", "드라마에서 주인공이 자살하는 장면…", "자살예방 캠페인 포스터…". 규칙이 danger로 잡고 "더 위험한 쪽"을 택하므로 안내가 뜬다. 안내를 놓치는 것보다 낫다고 보고 유지한다.
- AI 실패 시 과잉 안내 8건 중 5건은 "무기력", "불안", "외로운", "힘들" 같은 일상 표현이다. 원칙 2(AI 실패 시 최소 caution) 그대로의 결과다.
- 위험 신호가 있는 15건은 모두 응원 대신 기본 문구 + 안내가 나갔다.
- 한계: 30문장, 같은 모델 하나. 판별 정확도가 아니라 "초기 테스트 결과"로 설명한다.

## DB 변경 (반영: `db/migrations/20261120_erd_v4_alignment.sql`)

아래 요청 1~3번과 ERD 점검 결과를 한 번에 반영했다. `db/init/01_schema.sql`, `02_seed.sql`, `db/erdcloud.sql`도 같은 내용이다. **공용 Neon 적용은 PR이 합쳐진 뒤 팀에 알리고 진행한다** (그 전까지 공용 DB에는 없음).

| 변경 | 내용 | API에서 할 일 |
| ---- | ---- | ------------- |
| 요청 1 | `daily_recommendations.items JSONB` | 추천 API를 `items` 칸으로 옮기고 `reason`에는 대표 이유 한 줄 (아직 `reason`의 JSON 문자열을 씀, 그대로 동작) |
| 요청 2 | `youth_centers`에 `hours`, `programs`, `source_name`, `source_url`, `basis_date`, `terms`, `is_sample` | 센터 실데이터 수집 때 사용 |
| 요청 3 | `star_attempts.risk` | 회고 처리 결과의 위험도 저장 (선택) |
| 센터 별 | 별 17 "청년센터 앞까지 가 보기" (거문고자리 7번째, GPS, `place_type: youth_center`) | 없음. 바로 시도 저장 가능 |
| 바깥 별 | `stars.is_outside` — 1순위 지표 기준. 앱 안 센터 별(지도·홈페이지 보기)은 false | 없음 |
| 센터 행동 | `center_events (user_id, center_id, event: viewed·joined)` | 상세 화면 열 때 `viewed`, "참여했어요" 누르면 `joined` 저장 (API 새로 필요) |
| 하위 퀘스트 | `sub_quests` (별마다 더 작게 해 보기 목록, 예시 8개: 바깥 별 11~14·16·17) | AI ① 다음 행동 제안은 이 목록 안에서만 고름. 목록 없는 별에는 smaller를 제안하지 않음 |
| 다음 행동 | dim 시도 줄에 `suggested_action`(AI 제안), `next_action`(선택), `next_sub_quest_id`(smaller 대상)·`next_star_id`(swap 대상) | 다음 행동 API(11/21): 제안·선택·대상을 dim 줄에 저장 → 다음에 앱을 열어도 "다음에 할 작은 별"이 남음 |
| 이어진 시도 | `parent_attempt_id` = 원래 시도, 하위 퀘스트로 한 시도는 `sub_quest_id` + 이름 사본 `custom_title`. 자유 문장 `custom_title`·다른 별의 하위 퀘스트는 DB가 거절. 원래 시도를 지워도 남음(`ON DELETE SET NULL`) | `POST /api/attempts`에 `parentAttemptId`·`subQuestId` 받기, `risk` 저장 |
| 사진 확인 | 3-1 "쓰레기 버리고 오기" `photo` → `self` (v4: 바깥은 GPS 기본, 사진은 선택) | 없음 |
| 한국 날짜 | `rec_date` 기본값, `v_sky_today`를 `Asia/Seoul` 기준으로 | 없음 (API는 이미 한국 날짜를 직접 넣음) |
| 지표 뷰 | `v_outside_attempt_rate` 정의 수정(분모 = 실제로 시작한 사용자), `v_split_success`는 하위 퀘스트만, `v_next_action_retry_rate`(AI 제안 따랐는지별)·`v_center_actions` 추가, v4에서 빠진 `v_center_quest_rate` 삭제 | 없음 |
| 기록 삭제 | 체크인을 지워도 추천은 남음(`daily_recommendations.checkin_id ON DELETE SET NULL`) | 없음 |

- 남은 결정: 별 17이 거문고자리(2단계)에 속해 있어 1단계 사용자가 센터 앞에 가면 그 별자리의 별이 켜진다. 별자리 밖 센터 별로 빼려면 `constellation_id`를 비우고 밤하늘 API(`_lib/sky.ts`의 JOIN)도 바꿔야 해서 팀 결정으로 남김. 예시 센터를 `youth_centers`(`is_sample=true`)로 옮기면 `inquiry_drafts`·`center_events`의 `center_id`에 외래키를 걸 수 있다. (→ 포인트 변경 뒤에는 센터 별이 별 20, 4단계 거문고자리)
- 검증 (2026-11-19, 로컬 Docker만): 이전 스키마 + 가상 기록에 변경 SQL을 두 번 적용 → 새로 만든 DB와 칸·인덱스·뷰·시드 일치, 기존 기록 유지 (옛 방식 쪼갠 별 기록이 있으면 새 제약은 새 행에만 적용). 목록 밖 하위 퀘스트·자유 문장 이름·행동과 대상 불일치 거절, 원래 시도·체크인 삭제 시 이어진 기록 유지 확인. 기존 API 검증 스크립트 `verify-star-api` 61/61, `verify-http` 14/14, `verify-inquiry-http` 25/25 (AI 키 없음), 별 17 시도 저장 성공.

## DB 변경 — 포인트·새 시드 (`feat/points`, `db/migrations/20261120_points.sql`)

**`20261120_erd_v4_alignment.sql`을 먼저 적용한 뒤에** 실행한다 (v4가 없으면 SQL이 처음에 멈추고 아무것도 바꾸지 않음). 내용은 `db/init/01_schema.sql`·`02_seed.sql`과 같다.

| 변경 | 내용 | API에서 할 일 |
| ---- | ---- | ------------- |
| 콘텐츠 교체 | 원본 루트 `quests.json`. 이 파일 적용 당시는 별자리 12개(단계마다 3개)·별 40개였고, 지금은 아래 동기화 SQL로 별자리 10개(도감)로 바뀜. 별 ID = quest id. `is_outside`·`category`·`verify_type`·`place_type`·`description`도 JSON에 있음 | 별 ID를 코드에 직접 적지 않기. 문구를 고치면 JSON만 고치고 스크립트 실행 (`--check`로 어긋남 확인) |
| 하위 퀘스트 | 별마다 `easier_title` 1개 → `sub_quests` 40개 (하위 퀘스트 ID = 별 ID) | 없음 |
| 별 칸 추가 | `stars.focus`(daily·outing·relation·work), `stars.tags`(TEXT[], outdoor·social·career·learning·rest) | 아직 API에서 안 씀. 정책 추천·추천 이유에 쓸 수 있음 |
| 포인트 뷰 | `v_star_points`(별 점수 = 난이도 × 10), `v_user_points`(처음 밝힌 별만 합산). 테이블 구조 변경 없음 | 시도 저장·밤하늘 응답에 반영 완료 |

- ⚠ 별 ID가 바뀌어 **`star_attempts`·`daily_recommendations`·`user_constellations`·`sub_quests`를 비우고 다시 넣는다** (데모 사용자의 시도·회고·오늘 추천이 사라짐. 사용자·체크인·문의 초안·센터 기록은 유지). 팀에 알린 뒤, 시연 직전이 아닐 때 적용한다.
- 적용 전까지 Neon에서는 새 코드의 시도 저장·밤하늘이 뷰가 없어 실패한다 → 이 브랜치를 배포하기 전에 적용해야 한다.
- (선택, 남은 결정) 별마다 추천 범위 칸: 지금은 stage로 정해서 3·4단계의 집 안 활동도 "집 앞"으로 분류됨 (고민기록 #31) → `ALTER TABLE stars ADD COLUMN scope VARCHAR(5) CHECK (scope IN ('home', 'near', 'out'));`

## DB 변경 — 별자리를 도감 10개로 (`feat/points`, `db/migrations/20261121_quests_sync.sql`, 기록 유지)

`20261120_points.sql` 다음에 실행한다 (없으면 처음에 멈추고 아무것도 바꾸지 않음). **기록을 지우지 않는다.** `web/scripts/gen-quest-seed.mts`가 `quests.json`으로 만드는 파일이라, 문구를 고칠 때마다 다시 만들어 실행하면 된다. 여러 번 실행해도 결과가 같다.

| 변경 | 내용 | API에서 할 일 |
| ---- | ---- | ------------- |
| 별자리 | 12개 → **10개 = 도감 캐릭터** (ID 1 카시오페이아 · 2 돌고래 · 3 거문고 · 4 작은곰 · 5 토끼 · 6 여우 · 7 카멜레온 · 8 백조 · 9 독수리 · 10 화가). 단계별 2·3·2·3개 | 없음 (API는 DB를 읽음) |
| 별 | 소속 별자리·순서만 바뀜. 별 ID·단계·문구는 그대로 → 포인트도 그대로 | 없음 |
| 하위 퀘스트 | 문구 덮어쓰기 (ID = 별 ID 그대로) | 없음 |
| 지우는 것 | 별이 없는 옛 별자리 11·12번, 그 별자리를 가리키는 `user_constellations` 줄 | 없음 |

- 폐기한 별자리 6개(안드로메다·북쪽왕관·페가수스·목동·오리온·큰곰)와 그전 12개 묶음은 루트 `quests.retired.json`에 보관 (DB·스크립트는 읽지 않음).
- `quests.json`에 없는 별이 DB에 있으면 멈춘다 (별을 지우면 시도 기록이 깨지므로 자동으로 지우지 않음).
- 확인: `SELECT id, stage, name, star_count FROM constellations ORDER BY id;` → 10줄, `SELECT count(*) FROM stars;` → 40

## DB 변경 — 유성·체크인 포인트 (`feat/meteor-points`, `db/migrations/20261121_reward_points.sql`, 기록 유지)

`20261120_points.sql` 다음에 실행한다 (없으면 처음에 멈추고 아무것도 바꾸지 않음). `20261121_quests_sync.sql`과는 순서 상관없다. **기록을 지우지 않는다.** 여러 번 실행해도 결과가 같다.

| 변경 | 내용 | API에서 할 일 |
| ---- | ---- | ------------- |
| 테이블 추가 | `point_events` (user_id, source `meteor`·`checkin`, ref_key = 유성 번호·한국 날짜, points, earned_date). `UNIQUE (user_id, source, ref_key)`로 중복 지급 방지, 사용자 삭제 시 함께 삭제 | 반영 완료 (`_lib/points.ts`) |
| 뷰 변경 | `v_user_points.total_points` = 별 + 유성 + 체크인. 칸 `star_points`·`meteor_points`·`checkin_points`를 뒤에 덧붙임 (앞 세 칸은 그대로). 별 없이 유성·체크인만 있어도 행이 생김 | 시도 저장·밤하늘 `totalPoints`가 자동으로 합계가 됨 |

- ⚠ **적용 전에 이 브랜치를 배포하면** 유성 API·포인트 조회는 500, 체크인은 정상이지만 `pointsEarned`·`totalPoints`가 `null`. `GET /api/health`의 `pointEvents`로 적용 여부를 확인할 수 있다.
- 지난 체크인에 포인트를 소급해 주지 않는다 (적용한 뒤 체크인부터).

## DB 변경 — 프로필 이미지 (`feat/profile-avatar`, `db/migrations/20261121_profile_avatar.sql`, 기록 유지)

다른 변경 SQL과 순서 상관없다. **기록을 지우지 않는다.** 여러 번 실행해도 결과가 같다.

| 변경 | 내용 | API에서 할 일 |
| ---- | ---- | ------------- |
| 칸 추가 | `users.avatar_constellation_id INT` (NULL = 기본 캐릭터), 외래키 `constellations(id) ON DELETE SET NULL` | 반영 완료 (`api/profile/avatar/`) |
| 뷰 추가 | `v_user_acquired_constellations` (user_id, constellation_id, acquired_at): 별자리의 별을 모두 딴 사용자·별자리. 별 수는 `star_count`가 아니라 실제 `stars` 행으로 셈 | 프로필 이미지 검증. 도감·별자리 완성 안내에도 쓸 수 있음 |

- ⚠ 적용 전에 이 브랜치를 배포하면 `/api/profile/avatar`만 500이고 다른 API는 그대로다.
- 확인: `SELECT to_regclass('public.v_user_acquired_constellations');` → 이름이 나오면 적용 완료

## 실행 환경

- DB: 팀 공용 Neon (서버 시간대 GMT → 날짜는 SQL에서 `Asia/Seoul`로 변환), 로컬은 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`)
- 환경 변수 예시: `web/.env.example`
