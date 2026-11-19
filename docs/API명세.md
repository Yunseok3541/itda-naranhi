# API 명세

> API는 Next.js 앱(`web/src/app/api/`)의 Route Handler로 구현한다 (고민기록 #27).
> 화면은 같은 앱에서 `fetch('/api/...')`로 호출한다. 화면 쪽 내용은 [화면설계.md](화면설계.md), 문구는 [기능 완료 기준](기획/기능완료기준과_콘텐츠.md)
> 마지막 갱신: 2026-11-19 (별 추천·시도 저장·밤하늘·청년센터·문의 초안 계약 추가, 담당 고은비)

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

## 공통 규칙 (새 API)

### 세션

- 사용자는 **서버 쿠키**로 판단한다. 요청 본문에 `userId`를 넣지 않는다.
- 서버는 윤석 담당 `web/src/lib/demo-session.ts`의 `getDemoUserId(): Promise<number | null>`를 쓴다.
- `fetch`는 같은 출처라 쿠키가 자동으로 붙는다. 별도 헤더는 필요 없다.
- ⚠ 기존 `POST /api/checkin`, `PATCH /api/checkin/weather`는 아직 본문의 `userId`를 쓴다. 세션 PR에서 쿠키 방식으로 함께 바꿔야 추천 API의 체크인 소유 확인이 맞는다 (윤석).

### 오류 응답 형식

모든 오류는 같은 모양이다. 화면은 `code`로 분기하고 `error`는 그대로 보여 줘도 되는 문장이다.

```jsonc
{ "error": "별을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

| HTTP | code | 언제 | 프론트 처리 |
| ---- | ---- | ---- | ----------- |
| 400 | `INVALID` | 필드 누락·허용값 아님·길이 초과 | 입력 유지, `error` 문구 표시. 입력을 고치게 함 |
| 401 | `NO_SESSION` | 세션 쿠키 없음·만료 | 입력을 지우지 말고 "데모 시작"으로 안내 (데모 세션 재발급) |
| 404 | `NOT_FOUND` | 없는 ID, **다른 사람의 기록** (존재 여부를 알려주지 않으려고 404로 통일) | "찾을 수 없어요" 안내 후 이전 화면으로 |
| 500 | `SAVE_FAILED` | DB 저장 실패 | "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요." + **다시 저장하기**. 입력 유지 |
| 500 | `LOAD_FAILED` | DB 조회 실패 | 다시 불러오기 버튼 |

- **`help`가 `null`이 아니면 상태 코드와 관계없이 항상 안내를 띄운다** (`{ title, lines[] }`). 400·401·404·500 응답에도 들어올 수 있다.
- 2xx 응답만 성공이다. 500 응답에 들어 있는 값(예: 문의 초안)은 저장되지 않은 것이다.

### 검증용 필드

- 새로 만든 추천·시도·초안 응답에는 `modelVersion`(실제 응답한 모델 버전, 기본값을 썼으면 `null`)이 붙는다. 검증 기록용이라 화면에서는 쓰지 않는다.

### 날짜

- 모든 `date`는 한국 시간 기준 `YYYY-MM-DD` 문자열이다. 화면은 그대로 "11월 19일"처럼 바꿔 쓴다 (`new Date()`로 다시 파싱하지 않기).

---

## API 목록

### 1. 체크인 (구현됨, 기존)

**`POST /api/checkin`** — AI ② 마음 날씨 + AI ③ 위기 표현 안내

```jsonc
// 요청
{ "userId": 1, "text": "오늘 좀 무기력해요", "todayChoice": "home" }  // todayChoice: rest | home | near | out (선택)
// 응답
{
  "checkinId": 12,              // 저장 실패 시 null (프론트는 날씨 고치기 버튼과 추천 진행을 보류)
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

### 2. 오늘의 별 추천 — `POST /api/recommendations` (AI ①)

```jsonc
// 요청
{ "checkinId": 12 }
```

```jsonc
// 200 정상 (AI 추천)
{
  "items": [
    {
      "starId": 12,
      "title": "현관 앞 5분 서 있기",
      "description": "현관 밖에서 5분만 머물러요.",
      "constellationName": "거문고자리",
      "verifyType": "self",          // self | photo | gps (gps면 별 수행 화면에서 도착 확인 버튼)
      "reason": "집 근처가 괜찮다고 해서 현관에서 해 볼 수 있는 별을 골랐어요."
    }
  ],
  "usedFallback": false,   // true면 이유 옆에 "준비해 둔 별에서 골랐어요." 표시
  "reused": false          // 오늘 이미 만든 추천을 다시 돌려준 경우 true
}
```

```jsonc
// 200 AI 실패·빈 응답·형식 오류 → 실제 후보 별 + 기본 이유
{
  "items": [
    { "starId": 12, "title": "현관 앞 5분 서 있기", "description": "현관 밖에서 5분만 머물러요.",
      "constellationName": "거문고자리", "verifyType": "self",
      "reason": "집 근처가 괜찮다고 해서 현관 가까이에서 해 볼 수 있는 별이에요." }
  ],
  "usedFallback": true,
  "reused": false
}
```

```jsonc
// 200 빈 결과 (후보 별이 하나도 없을 때. 시드가 있으면 생기지 않음)
{ "items": [], "usedFallback": true, "reused": false }
```

```jsonc
// 400 { "error": "checkinId가 필요해요.", "code": "INVALID", "help": null }
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 404 { "error": "체크인을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }   // 남의 체크인도 404
// 500 { "error": "지금은 추천을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }
```

규칙

- **현재 세션 사용자의 체크인인지 확인**한다 (`checkins.user_id`).
- **하루 한 번**: 같은 사용자·같은 한국 날짜에 이미 추천이 있으면 Gemini를 부르지 않고 저장된 결과를 돌려준다 (`reused: true`). 같은 날 다른 체크인으로 요청해도 첫 추천을 돌려준다. 마음 날씨를 고쳐도 바뀌지 않는다.
- 추천 개수: `rest` 1개, 그 밖 1~3개. 오늘 선택이 없으면 `home`으로 본다.
- 후보 범위 (임시 규칙, 콘텐츠 정의서 확정 시 교체)

  | 오늘 선택 | 후보 순서 |
  | --------- | --------- |
  | `rest` 쉬어 가기 | 집 안 별에서 1개 |
  | `home` 집 안 / 선택 안 함 | 집 안 별 |
  | `near` 집 근처 | 집 앞 별 → 집 안 별 |
  | `out` 바깥 | 바깥(GPS) 별 → 집 앞 별 → 집 안 별 |

  - 집 안 = 1단계 별자리의 별, 집 앞 = 2단계 이상 별자리의 GPS가 아닌 별, 바깥 = GPS 별
  - 사용자 시작 단계 + 1단계(바로 위 단계)까지만 후보. 이미 딴 별(bright)은 뺀다 (다 땄으면 다시 포함)
- AI가 후보에 없는 `starId`를 내면 제거한다. 남는 게 없으면 기본 후보 + 기본 이유. 이유가 비었거나 너무 길거나 금지 표현이 있으면 그 별만 기본 이유로 바꾼다.
- 추천 저장이 실패해도 추천은 200으로 돌려준다 (추천은 사용자가 쓴 글이 아니고, 다음 요청 때 다시 만들면 됨).
- 프론트 처리: 400·404면 체크인 화면으로, 500이면 다시 불러오기. `items`가 비면 "오늘은 쉬어 가도 괜찮아요"와 밤하늘로 가는 버튼.

### 3. 별 시도 저장 — `POST /api/attempts` (AI ④ 응원 + AI ③ 위기 표현)

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
// 201 저장 성공
{
  "attemptId": 3,
  "starId": 12,
  "status": "dim",
  "date": "2026-11-19",
  "reflection": "현관문을 열고 잠깐 서 봤어요",
  "cheer": "현관문을 열고 서 본 그 순간이 이 별에 남았어요.",
  "usedFallback": false,     // true면 cheer는 기본 문구
  "risk": "normal",
  "help": null               // 또는 { "title": "혼자 감당하지 않아도 돼요", "lines": [...] }
}
```

```jsonc
// 500 저장 실패 — 성공으로 보내지 않음. help는 그대로 전달, cheer는 보내지 않음 (응원은 저장 성공 뒤에만)
{
  "error": "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.",
  "code": "SAVE_FAILED",
  "help": { "title": "혼자 감당하지 않아도 돼요", "lines": ["자살예방상담전화 109 (24시간)", "정신건강위기상담전화 1577-0199", "지역 청년마음건강 지원사업도 찾아볼 수 있어요."] }
}
// 400 { "error": "status는 bright 또는 dim이어야 해요.", "code": "INVALID", "help": null }
// 400 { "error": "stopReason은 손 뻗어 보기(dim)일 때만 보낼 수 있어요.", "code": "INVALID", "help": null }
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 404 { "error": "별을 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

규칙

- 회고가 있으면 규칙 + AI로 위험을 판단한다. `help`는 400·401·404·500에도 담는다 (이때는 AI 없이 규칙만).
- AI 응원 실패·형식 오류·금지 표현이면 기본 문구: bright "오늘 해낸 일을 이 별에 담았어요." / dim "오늘 손을 뻗어 본 순간을 이 별에 담았어요." 회고가 비어 있으면 AI를 부르지 않고 기본 문구.
- risk가 normal이 아니면 응원은 기본 문구를 쓰고 `help`를 띄운다.
- 같은 별을 여러 번 시도할 수 있다. 시도마다 한 줄씩 쌓인다.
- 프론트 처리: 저장 중 버튼 비활성화(중복 클릭 방지), 201 뒤에만 응원 표시 후 밤하늘로. 500이면 입력 유지 + 다시 저장하기, `help`가 있으면 같이 표시.
- 다음 행동(`nextAction`: smaller·retry·swap·stop) 저장과 AI 제안은 후속 API로 분리한다 (11/21 예정, 아래 "만들 것").

### 4. 밤하늘 — `GET /api/sky`

```jsonc
// 200
{
  "stars": [
    {
      "starId": 12,
      "title": "현관 앞 5분 서 있기",
      "description": "현관 밖에서 5분만 머물러요.",
      "constellationId": 3,
      "constellationName": "거문고자리",
      "position": 2,
      "verifyType": "self",
      "status": "dim",          // untried | dim | bright. 한 번이라도 bright면 bright
      "attempts": 2,
      "memories": [             // 이 사용자의 시도만, 최신순. 시도마다 한 줄
        { "attemptId": 5, "date": "2026-11-20", "status": "dim", "reflection": "오늘은 문 앞까지만" },
        { "attemptId": 3, "date": "2026-11-19", "status": "dim", "reflection": "현관문을 열고 잠깐 서 봤어요" }
      ]
    },
    { "starId": 1, "title": "창문 열고 하늘 보기", "description": "창문을 열고 하늘을 잠깐 바라봐요.",
      "constellationId": 1, "constellationName": "카시오페이아자리", "position": 1, "verifyType": "self",
      "status": "untried", "attempts": 0, "memories": [] }
  ]
}
// 401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }
// 500 { "error": "지금은 밤하늘을 불러오지 못했어요.", "code": "LOAD_FAILED", "help": null }
```

규칙

- 별 목록은 **시드의 모든 별**(현재 16개)을 별자리·순서대로 준다. 사용자가 고른 별자리만 보여 주는 것은 별자리 선택 API가 생기면 바꾼다 (임시).
- `status`는 뷰 `v_user_star_status` 기준(최종 상태), `memories`는 개별 시도(그 시도 당시의 상태와 회고). 회고 없이 저장한 시도는 `reflection: null`.
- 별 상세 화면 URL(예: `/stars/12`)로 바로 들어와도 이 응답에서 `starId`로 찾아 제목을 얻는다.
- 프론트 처리: 새로고침 때마다 다시 호출. 시크릿 창(새 세션)에서는 모든 별이 `untried`여야 한다.

### 5. 청년센터 목록·상세 — `GET /api/centers`, `GET /api/centers/{centerId}`

세션 없이 조회 가능 (공공 데이터).

```jsonc
// GET /api/centers?region=11440   (region 선택, 시군구 5자리)
// 200
{
  "centers": [
    {
      "centerId": 9001,
      "name": "예시 청년센터",
      "address": "예시 주소 (실제 장소가 아니에요)",
      "regionCode": "11440",
      "isSample": true,           // true면 화면에 "예시 데이터예요" 표시
      "source": null              // 실데이터면 { "name": "한국고용정보원_온통청년_청년센터", "url": "...", "basisDate": "YYYY-MM-DD" }
    }
  ]
}
// 200 빈 결과: { "centers": [] }
// 400 { "error": "region은 시군구 코드 5자리예요.", "code": "INVALID", "help": null }
```

```jsonc
// GET /api/centers/9001
// 200
{
  "center": {
    "centerId": 9001, "name": "예시 청년센터", "address": "예시 주소 (실제 장소가 아니에요)",
    "phone": null, "url": null, "regionCode": "11440", "lat": null, "lng": null,
    "hours": null,                // 확인된 값이 없으면 null (꾸며내지 않음). 화면은 "운영시간은 센터에 확인해 주세요"
    "programs": [ { "title": "예시 프로그램", "summary": "시연을 위한 가상의 프로그램이에요." } ],
    "isSample": true,
    "source": null
  }
}
// 400 { "error": "centerId가 올바르지 않아요.", "code": "INVALID", "help": null }
// 404 { "error": "센터를 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

- 실제 출처 후보: 공공데이터포털 [한국고용정보원_온통청년_청년센터](https://www.data.go.kr/data/15171410/openapi.do) (제공 한국고용정보원, 이용허락 제한 없음, 등록·수정 2026-10-14, 2026-11-19 페이지 확인). **인증키가 아직 없어 실데이터는 수집 전**이다. 공개 페이지에서 요청 변수·응답 필드의 영문 이름도 확인되지 않아, 키를 받은 뒤 활용가이드로 수집 코드를 만든다.
- 실데이터 저장에는 `youth_centers`에 출처·기준일·예시 여부 칸이 필요하다 (아래 "DB 변경 요청"). 그 전까지 센터는 서버 코드의 목록(`web/src/app/api/_lib/centers-data.ts`)에서 읽는다. 지금 목록에는 예시 센터 1곳만 있다.

### 6. 문의 문장 초안 — `POST /api/inquiries`, `GET /api/inquiries`, `PATCH /api/inquiries/{draftId}` (AI ⑥)

```jsonc
// POST 요청
{ "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?" }   // question 1~300자
// 201 저장 성공
{
  "draftId": 7, "centerId": 9001, "question": "처음인데 예약 없이 들러도 되나요?",
  "draft": "안녕하세요. 처음 방문해 보려고 하는데, 예약 없이 들러도 괜찮을지 여쭤보고 싶어요. 알려주시면 감사하겠습니다.",
  "sentAt": null, "date": "2026-11-19",
  "usedFallback": false,     // true면 기본 틀로 만든 초안
  "risk": "normal", "help": null
}
// 500 저장 실패 — 초안은 화면에 보여 주되 "저장되지 않았어요" + 다시 저장하기
{ "error": "지금은 초안을 저장하지 못했어요.", "code": "SAVE_FAILED", "draft": "안녕하세요. ...", "help": null }
// 400 { "error": "궁금한 점을 300자 이하로 적어 주세요.", "code": "INVALID", "help": null }
// 404 { "error": "센터를 찾을 수 없어요.", "code": "NOT_FOUND", "help": null }
```

```jsonc
// GET /api/inquiries?centerId=9001  → 내 초안만, 최신순 (centerId 생략 시 전체)
{ "drafts": [ { "draftId": 7, "centerId": 9001, "question": "...", "draft": "...", "sentAt": null, "date": "2026-11-19" } ] }
```

```jsonc
// PATCH /api/inquiries/7  — 사용자가 고친 최종본 저장, "문의해 봤어요" 직접 기록
{ "draft": "고친 문장", "sent": true }      // 둘 다 선택, 하나는 있어야 함. draft는 1~1000자
// 200 { "draftId": 7, "centerId": 9001, "question": "...", "draft": "고친 문장", "sentAt": "2026-11-19", "date": "2026-11-19", "help": null }
// 404 남의 초안이거나 없음
```

- 초안에는 센터 정보와 사용자가 적은 질문만 쓴다. 운영시간·전화번호·예약 규칙처럼 입력에 없는 숫자가 들어가면 버리고 기본 틀을 쓴다.
- 보내기는 사용자가 직접 한다. 앱은 문의를 대신 보내지 않는다. 초안 저장과 "문의해 봤어요"(`sentAt`)는 다른 기록이다.
- 화면 문구: "초안이에요. 보내기 전에 내용을 확인해 주세요"

---

## 만들 것 (기획: `docs/기획/아이디어_v4.md`)

| API | 기능 | 비고 |
| --- | ---- | ---- |
| 시작 질문 저장 | 시작 질문 3개 답 → 시작 단계 | `users.start_answers`, `current_stage` |
| 별자리 선택 | 고른 별자리 저장 → 밤하늘 범위 | `user_constellations` |
| 시도 후 다음 행동 (AI ①) | 이유 → 더 작게 / 다른 날 / 다른 별 / 마치기 제안, 사용자 선택 저장 | `stop_reason`, `next_action`. 11/21 |
| 청년센터 실데이터 수집 | 온통청년 청년센터 API → 저장 | 인증키·DB 칸 필요 |
| 주변 장소 | GPS 별의 목표 장소 (카카오 로컬) | 좌표 저장 안 함 |
| 정책 추천 (AI ⑤) | 미리 분류해 둔 정책 조회 + 노출·클릭 기록 | `policies`, `policy_events` |

---

## AI 기능 현황 (2026-11-19 기준)

### 모델

| 요청 모델 (`GEMINI_MODEL`) | 2026-11-19 실호출 결과 | 판단 |
| -------------------------- | --------------------- | ---- |
| `gemini-3.5-flash` (현재 `.env.example` 값) | 간단한 호출 1회 성공, 응답 `modelVersion`은 `gemini-3.6-flash`. 이후 구조화 응답 요청은 10초 초과·503(수요 과다)·429(사용량 한도) 반복 | 시연에 불안정 |
| `gemini-3.6-flash` | 1회 503, 1회 12.5초 성공 | 10초 제한 안에 들어오지 않음 |
| `gemini-3.5-flash-lite` | 2회 연속 약 5.5초 성공. 아래 흐름 검증의 AI 호출과 위험 문장 30건이 모두 10초 안에 응답 | **권장** |
| `gemini-2.5-flash` | 404 (신규 사용자에게 제공 중단) | 사용 불가 |

- 아래 "실제 Gemini" 검증은 `GEMINI_MODEL=gemini-3.5-flash-lite`로 실행했다. 응답 `modelVersion`도 `gemini-3.5-flash-lite`.
- 제출 문서에는 실제 배포 환경 변수 값과 응답 `modelVersion`을 함께 적는다. 코드 기본 문자열은 근거로 쓰지 않는다.
- 공통 처리: `web/src/lib/gemini.ts`의 `generateJson`. JSON 스키마 지정 → 검증 함수 통과 못 하면 기본값. 키 없음·네트워크 오류·**10초 초과**·빈 응답·JSON 아님도 기본값. 실제 응답 모델 버전(`modelVersion`)과 기본값 사유를 돌려준다.
- 모델에 보내지 않는 것: 닉네임, 사용자 ID, 지역 코드, 출생 연도, 시작 질문의 활동 범위 외 개인 정보, (추천 시) 회고 원문. 보내는 것은 아래 표의 입력뿐이다. 무료 등급은 입력이 서비스 개선에 쓰일 수 있어 가상 문장만 사용한다.

### 기능별

| # | 기능 | 위치 | 입력 → 출력 | 기본값 (실패 시) | 구현·검증 범위 |
| - | ---- | ---- | ----------- | ---------------- | -------------- |
| ① | 오늘의 별 추천 | `api/recommendations` | 오늘 선택, 부담 상황, 마음 날씨, 체크인 한 줄, 최근 시도 5개(별 제목·결과·멈춘 이유), 후보 별 최대 8개 → `{ items: [{ starId, reason }] }` | 후보 앞에서 1~3개 + 범위별 기본 이유 | **구현·검증**: 실제 추천, 재요청 재사용, 후보 밖 ID 제거, 금지 표현 이유 교체, AI 실패 |
| ① | 시도 후 다음 행동 | 미구현 | 멈춘 이유 + 별 → 다음 행동 제안 | 이유별 고정 문구(기능 완료 기준 문서) | **미구현** (11/21) |
| ② | 마음 날씨 | `api/checkin` | 체크인 한 줄 → `{ weather, risk }` | `partly_cloudy`, 위험은 규칙 판단 | 기존 구현. `generateJson` 반환값을 늘렸지만 체크인 코드는 그대로 동작(빌드 확인). **이번에 실호출 재검증 안 함** |
| ③ | 위기 표현 안내 | `lib/safety.ts` + 체크인·시도·문의 | 문장 → 규칙(직접·간접) + AI 위험도 중 높은 쪽 | AI 실패 시 규칙 + 부정 감정 표현으로 최소 caution | **시도 저장에서 가상 문장 30개 검증**, 문의 질문·초안 수정에도 적용 |
| ④ | 회고 응원 | `api/attempts` | 별 제목, 결과(bright/dim), 멈춘 이유, 회고 → `{ cheer, risk }` | bright "오늘 해낸 일을 이 별에 담았어요." / dim "오늘 손을 뻗어 본 순간을 이 별에 담았어요." | **구현·검증**: 실제 응원, 금지 표현 교체, 회고 없음, AI 실패, 위기 표현 시 기본 문구 |
| ⑤ | 정책 참여 부담 분류 | 미구현 | 정책 설명 → 참여 방식 + 요약 | — | **미구현** (정책 API 키 없음) |
| ⑥ | 문의 문장 초안 | `api/inquiries` | 센터 이름·프로그램 요약, 사용자 질문 → `{ draft, risk }` | "안녕하세요. {센터}에 처음 문의드려요. {질문} 알려주시면 감사하겠습니다." | **구현·검증 (예시 센터만)**: 실제 초안, 입력에 없는 숫자 차단, 저장 실패 시 초안 유지 |

AI 출력 검사 (`lib/safety.ts`의 `isSafeAiText`): 위험 표현, 지시·과장·진단 표현("반드시", "~해야 해요", "완벽", "최고", "대단", "진단", "치료" 등)이 있거나 길이를 넘으면 쓰지 않고 기본값. 실제로 `gemini-3.6-flash`가 "정말 대단해요!"를 낸 사례가 있어 이 필터에 걸린다.

## 검증 기록

> 2026-11-19 오전(한국 시간) 로컬에서 공용 Neon DB와 실제 Gemini를 대상으로 실행했다. 테스트 데이터는 트랜잭션 안에서 가상 사용자로 만들고 **롤백**했다. 실행 뒤 공용 DB 행 수가 그대로(사용자 1, 시도·체크인·추천·초안 0)인 것을 확인했다. ID 시퀀스 값만 올라갔다.
> 세션 헬퍼가 아직 없어 **사용자 ID를 인자로 넣어** 조회·저장 로직을 검증했다. 쿠키 세션을 거친 HTTP 흐름은 세션 PR 뒤에 확인한다.

### 흐름 검증 — `web/scripts/verify-star-api.mts`

```bash
# web/에서
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts            # 실제 Gemini
node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-star-api.mts --ai-fail  # 잘못된 키로 AI 실패
```

| 실행 | 결과 |
| ---- | ---- |
| `gemini-3.5-flash` (설정값) | 55 통과 / 3 실패. 실패 3건은 모두 모델이 10초 초과·503으로 응답하지 않아 기본값이 쓰인 것 (기본값 처리 자체는 정상) |
| `gemini-3.5-flash-lite` | **58 / 58 통과** |
| AI 실패 (잘못된 키) | **59 / 59 통과** |

확인한 항목

- 정상 저장: dim 시도 → 201, `attemptId·starId·status·cheer·help`. 같은 별 bright 재시도 → 201
- 추천 재요청: 두 번째 요청은 Gemini를 부르지 않고 같은 별·같은 이유 (`reused: true`, 약 250ms). 같은 날 다른 체크인도 첫 추천 재사용
- AI 실패: 추천은 실제 후보 + 기본 이유(`usedFallback: true`), 응원은 기본 문구, 초안은 기본 틀. 흐름은 끊기지 않음
- 후보 밖 ID: 가짜 AI 응답으로 없는 별(999)·범위 밖 GPS 별·중복을 제거, 금지 표현 이유는 기본 이유로 교체. 모두 후보 밖이면 기본 후보
- 타인 기록 접근: 다른 사용자의 체크인으로 추천 → 404, 다른 사용자의 밤하늘은 전부 untried·기억 없음, 남의 초안 목록에 안 보이고 수정 시 404
- 새로고침 후 회고 조회: 밤하늘 재조회 결과가 같고, 해당 별의 기억에 날짜(YYYY-MM-DD)와 회고 원문. dim → bright 순으로 시도하면 최종 bright, 기억 2개가 시도별 상태로 남음
- 실패 응답: 저장 실패(가짜 DB) → 500 `SAVE_FAILED` + help 유지 + cheer 없음, DB 전체 장애 → 500 + help, 조회 실패 → 500 `LOAD_FAILED`, 입력 오류 → 400 (+ 규칙 help)

HTTP 확인 (`next start`, 세션 헬퍼 대신 항상 null을 돌려주는 임시 파일): 센터 목록·상세 200/400/404, 세션이 필요한 5개 주소는 401 `NO_SESSION`, 세션 없이 위기 표현 회고를 보내면 401에도 help가 담김, 지원하지 않는 메서드 405.

### 위기 표현 검증 — `web/scripts/verify-safety.mts`

- 가상 회고 문장 30개를 실제 시도 저장 흐름에 넣음. 실제 상담 내용·개인정보 아님. 30건 모두 AI 응답 받음 (`gemini-3.5-flash-lite`, 2026-11-19 10:50 KST)
- 구성: 직접 표현 6, 간접 표현 6 (안내가 떠야 함) / 부정문·타인 이야기·관용 표현 6, 일상적인 부정 감정 6, 평범한 회고 6 (안내가 뜨지 않아야 함)

| 판단 방식 | 놓친 위험 문장 | 과잉 안내 |
| --------- | -------------- | --------- |
| 규칙만 | 3 / 12 | 3 / 18 |
| AI 실패 시 (규칙 + 부정 감정) | 3 / 12 | 8 / 18 |
| **규칙 + AI (실제 동작)** | **0 / 12** | **3 / 18** |
| 규칙 보완 후, 규칙만 (AI 없이 재실행) | 0 / 12 | 3 / 18 |
| 규칙 보완 후, AI 실패 시 | 0 / 12 | 8 / 18 |

- 규칙이 놓친 3건: "나 하나 없어도 아무도 모를 거예요", "내일이 안 왔으면 좋겠어요", "다 놓아버리고 싶어요". AI는 셋 다 caution으로 잡았다. AI가 실패해도 안내가 빠지지 않도록 이 세 표현을 간접 규칙에 추가했다. **같은 문장으로 다시 잰 결과라 새로운 문장에 대한 성능을 뜻하지 않는다.**
- 과잉 안내 3건: "죽고 싶을 만큼은 아니고…", "드라마에서 주인공이 자살하는 장면…", "자살예방 캠페인 포스터…". 규칙이 danger로 잡고 "더 위험한 쪽"을 택하므로 AI가 있어도 안내가 뜬다. 안내를 놓치는 것보다 낫다고 보고 유지한다.
- AI 실패 시 과잉 안내 8건 중 5건은 "무기력", "불안", "외로운", "힘들" 같은 일상 표현이다. 원칙 2(AI 실패 시 최소 caution) 그대로의 결과다.
- 위험 신호가 있는 15건은 모두 응원 대신 기본 문구 + 안내가 나갔다.
- 한계: 30문장, 한 번 실행, 같은 모델 하나. 판별 정확도가 아니라 "초기 테스트 결과"로 설명한다.

## DB 변경 요청 (윤석 확인)

기존 스키마로 지금 동작하게 만들었고, 아래는 정리용 요청이다. 공용 DB라 적용 시점을 팀에 알린 뒤 `db/init/01_schema.sql`, `db/erdcloud.sql`, Neon에 함께 반영한다.

```sql
-- 1. 별마다 다른 추천 이유 저장 (지금은 reason TEXT에 JSON 문자열을 넣어 둠: {"v":1,"items":[{"starId","reason"}],"usedFallback"})
ALTER TABLE daily_recommendations ADD COLUMN items JSONB;
--    적용 후 API를 items 칸으로 옮기고, reason에는 대표 이유 한 줄만 남긴다

-- 2. 청년센터 출처·기준일·예시 구분 + 상세 화면 값 (지금은 서버 코드 목록 centers-data.ts에서 읽음)
ALTER TABLE youth_centers
  ADD COLUMN source_name  VARCHAR(100),          -- 예: 한국고용정보원_온통청년_청년센터
  ADD COLUMN source_url   TEXT,
  ADD COLUMN basis_date   DATE,                  -- 데이터 기준일(수집일)
  ADD COLUMN is_sample    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hours        TEXT,                  -- 확인된 값만, 없으면 NULL
  ADD COLUMN programs     JSONB;                 -- [{ "title", "summary" }]

-- 3. (선택) 회고 위험도 기록: 안내가 몇 번 나갔는지 지표로 보려면
ALTER TABLE star_attempts ADD COLUMN risk VARCHAR(10) CHECK (risk IN ('normal', 'caution', 'danger'));
```

세션 관련 요청

- `web/src/lib/demo-session.ts`의 `getDemoUserId(): Promise<number | null>`. 새 라우트 5개(`recommendations`, `attempts`, `sky`, `inquiries`, `inquiries/[draftId]`)가 이 이름으로 가져다 쓴다.
- 기존 체크인 두 라우트도 같은 세션으로 바꿔야 추천의 체크인 소유 확인이 맞는다.
- 공용 DB 날짜: 서버 시간대가 GMT라 `CURRENT_DATE`·`v_sky_today`는 한국 시간 오전 9시에 날짜가 바뀐다. 새 API는 `Asia/Seoul`로 직접 계산한다.

## 실행 환경

- DB: 팀 공용 Neon (서버 시간대 GMT → 날짜는 SQL에서 `Asia/Seoul`로 변환), 로컬은 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`)
- 환경 변수 예시: `web/.env.example`
