# API 명세

> API는 Next.js 앱(`web/src/app/api/`)의 Route Handler로 구현한다 (고민기록 #27).
> 화면은 같은 앱에서 `fetch('/api/...')`로 호출한다. 화면 쪽 내용은 [화면설계.md](화면설계.md), 문구는 [기능 완료 기준](기획/기능완료기준과_콘텐츠.md), 세션 사용법은 [web/README.md](../web/README.md) "데모 세션"
> 마지막 갱신: 2026-11-19 18시 (포인트: 시도 저장 `pointsEarned`·`totalPoints`, 밤하늘 `totalPoints`·별 `points`, 시드 별자리 10개·별 30개로 교체. 담당 고은비, 브랜치 `feat/points`)
> 이전 갱신: 2026-11-19 13시 (청년센터·문의 초안 화면 연결 계약, 초안 `sent` 칸, 문의 API 세션 장애 503, 실데이터 전환 계획, AI 실호출 기록)
>
> ⚠ **`feat/points`부터 시드가 바뀌어 별 ID와 별자리가 달라졌다** (별 1~30, 고민기록 #28). 아래 응답 예시 중 "실제 응답"이라고 적힌 것은 이전 시드(별 16개)로 받은 기록이라 ID·별자리 이름이 지금과 다르다. 형식은 그대로다.
> 화면(재희) 영향: `mobile-flow.tsx`가 `starId` 16·17을 GPS 별로 가정하는 부분은 새 시드에서 16 = '청년센터 홈페이지에서 프로그램 둘러보기'(self), 17 = '동네 게시판·소식지 읽어 보기'(self)이고 센터 앞까지 가 보는 GPS 별은 20이다 (v4에서는 17). 밤하늘 응답의 `verifyType === "gps"`로 판단하는 것을 권장한다. 예시 모드의 별 제목 17개도 새 시드와 다르다.

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
  "help": null,                 // risk가 normal이 아니면 { title, lines[] }
  "usedFallback": false,        // AI 대신 기본값을 썼는지
  "modelVersion": "gemini-3.5-flash-lite"   // 실제 응답한 모델 버전, 기본값이면 null (검증용, 화면에서 쓰지 않음)
}
// 401 세션 없음 (위기 표현이면 help 포함)
```

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
  - 새 시드 기준 (2026-11-19 `feat/points`): 집 안 = 독수리자리 별 1~3, 집 앞(1단계 사용자) = 2단계 별 4~9, 가장 낮은 바깥 별 = 11 (3단계 백조자리, 2단계 사용자부터 후보). 1단계 사용자가 바깥을 고르면 GPS 후보가 없어 집 앞 → 집 안 순서로 채운다
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
// 201 별을 처음 땄을 때 (2026-11-19 로컬 HTTP 검증 실제 응답, 새 시드 별 4 = 2단계)
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
- **포인트 (고민기록 #28):** 별을 **처음** bright로 만든 시도만 `pointsEarned` = 별자리 난이도(`stage`) × 10 (10·20·30·40). dim, 이미 딴 별을 다시 딴 경우, 하위 퀘스트(더 작게 해 보기)로 이미 밝아진 별은 0. 감점은 없다.
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
  "totalPoints": 0,             // feat/points 추가. 밝힌 별 점수의 합 (= 뷰 v_user_points)
  "stars": [
    {
      "starId": 9, "title": "현관 앞 5분 서 있기", "description": "현관 밖에서 5분만 머물러요. 힘들면 언제든 들어와도 돼요.",
      "constellationId": 4, "constellationName": "북쪽왕관자리", "position": 2, "verifyType": "self",
      "status": "dim",          // untried | dim | bright. 한 번이라도 bright면 bright
      "attempts": 2,
      "points": 0,              // feat/points 추가. bright면 이 별의 점수(난이도 × 10), 아니면 0 (따기 전에는 점수를 알려주지 않음)
      "memories": [             // 이 사용자의 시도만, 최신순. 시도마다 한 줄
        { "attemptId": 5, "date": "2026-11-20", "status": "dim", "reflection": "오늘은 문 앞까지만" },
        { "attemptId": 3, "date": "2026-11-19", "status": "dim", "reflection": "현관문을 열고 잠깐 서 봤어요" }
      ]
    },
    { "starId": 1, "title": "창문 열고 하늘 보기", "description": "창문을 열고 하늘을 잠깐 바라봐요. 1분이면 충분해요.",
      "constellationId": 1, "constellationName": "독수리자리", "position": 1, "verifyType": "self",
      "status": "untried", "attempts": 0, "points": 0, "memories": [] }
  ]
}
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 500 { "error": "지금은 밤하늘을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }
// 503 { "error": "지금은 밤하늘을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }   // 세션 조회 DB 장애
```

- 별 목록은 **시드의 모든 별**(현재 30개, 별자리 10개)을 단계·별자리·순서대로 준다 (별자리 선택 API가 생기면 바꿈).
- `totalPoints`·`points`는 위 "3. 별 시도 저장"의 포인트 규칙과 같은 뷰로 계산한다. 별자리 하나를 다 따면 1단계 30, 2단계 40, 3단계 90, 4단계 160.
- `status`는 뷰 `v_user_star_status` 기준(최종 상태), `memories`는 개별 시도. 회고 없이 저장한 시도는 `reflection: null`.
- 별 상세 화면 URL(예: `/stars/12`)로 바로 들어와도 이 응답에서 `starId`로 제목을 얻는다.
- 센터 "앞까지 가 본 별"은 새 시드에서 **별 20 "청년센터 앞까지 가 보기"**(4단계 거문고자리 2번째, GPS, `category: center`)다. `20261120_erd_v4_alignment.sql`에서는 별 17이었지만 `20261120_points.sql`로 ID가 바뀐다. ⚠ 화면의 `/stars/17` 링크·예시 데이터 별 17은 새 시드에서 '동네 게시판·소식지 읽어 보기'를 가리킨다. GPS 확인이면 `placeId`에 `center:{centerId}`, `placeName`에 센터 이름을 보낸다.

### 5·6. 청년센터와 문의 초안 — 화면 연결 계약 (고은비 → 재희)

> 2026-11-19 12:38 로컬 HTTP로 검증한 실제 응답이다 (`scripts/verify-inquiry-http.mts`, 25/25 통과). **지금 센터는 가상 센터 1곳(`centerId: 9001`)뿐**이라 이 응답 그대로 화면을 만들면 된다.

#### ID는 어디에서 받나

| ID | 받는 곳 | 쓰는 곳 |
| -- | ------- | ------- |
| `centerId` | `GET /api/centers` 목록의 `centerId` (지금은 `9001`) | 센터 상세 `GET /api/centers/{centerId}`, 초안 생성 `POST /api/inquiries`의 본문, 초안 목록 `?centerId=` |
| `draftId` | 초안 생성 응답(201) 또는 `GET /api/inquiries` 목록의 `draftId` | 초안 수정·보냄 기록 `PATCH /api/inquiries/{draftId}` |
| `starId` | `GET /api/sky`의 `stars[].starId` 또는 `POST /api/recommendations`의 `items[].starId` | 별 수행 `POST /api/attempts` |

- 센터와 별은 연결돼 있지 않다. **센터 상세 응답에는 `starId`가 없다.**
- "앞까지 가 보기"는 별 20으로 시도를 저장한다 (`POST /api/attempts`, `starId: 20`. v4 시드에서는 17이었고 `20261120_points.sql` 뒤에 20). 공용 DB에 변경 SQL을 적용하기 전에는 404다.
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

---

## 만들 것 (기획: `docs/기획/아이디어_v4.md`)

| API | 기능 | 비고 |
| --- | ---- | ---- |
| 시작 질문 저장 | 시작 질문 3개 답 → 시작 단계 | `users.start_answers`, `current_stage` |
| 별자리 선택 | 고른 별자리 저장 → 밤하늘 범위 | `user_constellations` |
| 시도 후 다음 행동 (AI ①) | 이유 → 더 작게 / 다른 날 / 다른 별 / 마치기 제안, 사용자 선택 저장 | `stop_reason`, `next_action`. 11/21 |
| 청년센터 실데이터 수집 | 온통청년 청년센터 API → 저장 | 인증키·DB 칸 필요 |
| 센터 행동 기록 | 상세 보기(`viewed`)·"참여했어요"(`joined`) 저장 | `center_events` (테이블 준비됨). 센터 "앞까지 가 본 별"은 별 20(v4에서는 17)으로 시드 완료 |
| 주변 장소 | GPS 별의 목표 장소 (카카오 로컬) | 좌표 저장 안 함 |
| 정책 추천 (AI ⑤) | 미리 분류해 둔 정책 조회 + 노출·클릭 기록 | `policies`, `policy_events` |

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
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --no-key   # 키 없음
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --ai-fail  # 잘못된 키
GEMINI_MODEL=gemini-3.5-flash-lite node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts
GEMINI_MODEL=gemini-3.5-flash-lite node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-safety.mts
# 서버를 띄운 뒤 (npm run build && npx next start -p 3107)
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-http.mts --base=http://localhost:3107
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-inquiry-http.mts --base=http://localhost:3107   # 센터·문의 초안
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-ai-live.mts --base=http://localhost:3107       # AI 실호출 기록 (공개 주소는 1번만)
```

### 2026-11-20 master(ERD v4, PR #9~#12) 합친 뒤 재검증 (브랜치 `feat/points`, 로컬 Docker만)

| 실행 | 결과 | 비고 |
| ---- | ---- | ---- |
| A. 새 DB (합친 `db/init`) — `verify-star-api.mts --no-key` | **81 / 81 통과** | v4 구조 검사 추가: 하위 퀘스트 8개 모두 바깥 별, 센터 앞 GPS 별 1개, 1단계 집 안, 사진 확인 별 없음 |
| B. master `db/init` + 가상 기록(하위 퀘스트 시도·센터 기록 포함) → `20261120_points.sql` 2번 | **81 / 81 통과** | 콘텐츠·스키마 A와 같음. 시도·추천 비움, 사용자·체크인·초안·센터 기록 유지 |
| C. Neon 경로: 옛 `db/init` + 가상 기록 → `20261120_erd_v4_alignment.sql` → `20261120_points.sql` 2번 | **81 / 81 통과** | 콘텐츠 A와 같음, 스키마는 칸 순서만 다름(v4의 `ADD COLUMN`) |
| D. 순서 오류: 옛 `db/init` → `20261120_points.sql`만 | 의도대로 실패 | "v4를 먼저 적용해 주세요"로 멈추고 아무것도 바뀌지 않음 |
| HTTP (`next dev`, A, 키 없음) — `verify-http.mts` / `verify-inquiry-http.mts` | **20 / 20**, **25 / 25 통과** | master가 추가한 바깥 → 집 안 범위 케이스 포함 |
| `eslint src scripts`, `tsc --noEmit` | 오류 없음 | |

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
| 콘텐츠 교체 | 별자리 10개(난이도 1·2·3·4 = 1·3·3·3개)·별 30개. `is_outside`·`category`·`place_type` 별마다 지정, 쓰레기 별은 v4대로 `self` | 별 ID를 코드에 직접 적지 않기 |
| 하위 퀘스트 | v4 예시 8개를 같은 별(쓰레기·현관 앞·우편함·계단·편의점·센터 앞)에 다시 넣음 | 없음 |
| 포인트 뷰 | `v_star_points`(별 점수 = 난이도 × 10), `v_user_points`(처음 밝힌 별만 합산). 테이블 구조 변경 없음 | 시도 저장·밤하늘 응답에 반영 완료 |

- ⚠ 별 ID가 바뀌어 **`star_attempts`·`daily_recommendations`·`user_constellations`·`sub_quests`를 비우고 다시 넣는다** (데모 사용자의 시도·회고·오늘 추천이 사라짐. 사용자·체크인·문의 초안·센터 기록은 유지). 팀에 알린 뒤, 시연 직전이 아닐 때 적용한다.
- 적용 전까지 Neon에서는 새 코드의 시도 저장·밤하늘이 뷰가 없어 실패한다 → 이 브랜치를 배포하기 전에 적용해야 한다.
- (선택, 남은 결정) 별마다 추천 범위 칸: 지금은 stage로 정해서 3·4단계의 집 안 활동도 "집 앞"으로 분류됨 (고민기록 #28) → `ALTER TABLE stars ADD COLUMN scope VARCHAR(5) CHECK (scope IN ('home', 'near', 'out'));`

## 실행 환경

- DB: 팀 공용 Neon (서버 시간대 GMT → 날짜는 SQL에서 `Asia/Seoul`로 변환), 로컬은 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`)
- 환경 변수 예시: `web/.env.example`
