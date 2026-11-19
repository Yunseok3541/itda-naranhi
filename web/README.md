# web (Next.js 앱: 화면 + API)

> 나란히의 본 앱. 화면과 API를 이 프로젝트 하나에서 만들고 Vercel에 배포한다 (고민기록 #27)
> 기획: `docs/기획/아이디어_v4.md` · 화면: `docs/화면설계.md` · API: `docs/API명세.md`
> ⚠ Next.js 16은 인터넷 자료와 다른 부분이 있음. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 확인 (AGENTS.md)

## 스택

| 영역 | 선택 |
| ---- | ---- |
| 앱 | Next.js 16 + TypeScript + Tailwind CSS (모바일 웹) |
| 애니메이션 | motion (별 따기, 별자리 완성 연출) |
| AI | Gemini 무료 API (`@google/genai`), API에서만 호출 |
| DB | PostgreSQL (팀 공용 Neon / 로컬 Docker는 선택) |
| 지도 | 카카오맵 JS SDK |
| 배포 | Vercel |

## 실행 환경

- **DB: 팀 공용 Neon PostgreSQL** (연결 주소는 팀 DM, `DATABASE_URL`에 pooler 주소 사용)
  - 스키마: `db/init/01_schema.sql`, 콘텐츠(별자리·별): `02_seed.sql` (Neon에 적용 완료)
  - 사용자는 시드로 만들지 않음. **`users.id = 1` 같은 고정 사용자를 쓰지 말고 데모 세션으로 구한다** (아래 "데모 세션")
  - **운영 중인 Neon에는 init SQL을 다시 실행하지 않는다** (데이터 중복·충돌). 스키마 변경은 `db/migrations/`의 변경 SQL로만 (아래 "DB 변경")
  - 공용 DB라 스키마를 바꾸기 전에 팀에 먼저 알리기
- 로컬 DB(선택): 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`)
- 환경 변수 예시: `web/.env.example` 참고

## 데모 세션 (통합 계약)

로그인 없이 **브라우저 1개 = 가상 사용자 1명**. 쿠키(`naranhi_demo`, HttpOnly)로 구분한다.

### FE: 호출 순서

```ts
// 1) 데모 시작 화면에서 한 번 (같은 브라우저가 다시 불러도 같은 사용자 유지)
await fetch("/api/demo/session", { method: "POST" });          // → 200 { "ready": true }

// 2) 이후 사용자별 API는 그냥 호출. 같은 출처라 쿠키가 자동으로 따라간다 (userId를 보내지 않는다)
await fetch("/api/checkin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "오늘 좀 무기력해요", todayChoice: "home" }),
});

// 3) 401 { code: "NO_SESSION" } 이면 → 입력은 지우지 말고 1)을 다시 호출하거나 데모 시작 화면으로
//    help 가 null 이 아니면 상태 코드와 관계없이 위기 안내를 먼저 보여 준다 (docs/API명세.md 공통 규칙)
```

- 실패 응답: `POST /api/demo/session` → 503 `{ "ready": false, "error": "..." }` (DB 장애). 잠시 후 재시도 안내
- 쿠키는 브라우저가 관리한다. JS로 읽을 수 없고(HttpOnly) 읽을 필요도 없다

### BE: 현재 사용자 구하기

```ts
import { getDemoUserId, demoSessionRequired } from "@/lib/demo-session";

export async function GET() {
  const userId = await getDemoUserId();          // Promise<number | null>
  if (userId === null) return demoSessionRequired(); // 401 { error, code: "NO_SESSION", help: null }
  // ... WHERE user_id = $1 로 내 데이터만 조회·수정
}
```

| export (`@/lib/demo-session`) | 용도 |
| ----------------------------- | ---- |
| `getDemoUserId(): Promise<number \| null>` | **기본.** 현재 사용자 id, 세션이 없거나 확인 실패면 `null` |
| `demoSessionRequired(extra?)` | 401 `{ error: "데모를 다시 시작해 주세요.", code: "NO_SESSION", help: null }` (`extra`로 `help` 등 추가). API명세 공통 규칙과 같은 형식이라 `api/_lib/http.ts`의 `noSession()`과 바꿔 써도 된다 |
| `lookupDemoSession()` | `{status:"ok",userId}` / `{status:"none"}` / `{status:"error"}`. DB 장애와 세션 없음을 구분해야 할 때 (체크인처럼 DB가 죽어도 위험 안내를 응답해야 하는 API) |

규칙
- **요청 본문·쿼리의 `userId`를 믿지 않는다.** 사용자별 테이블은 항상 `WHERE user_id = <getDemoUserId()>`로 조회·수정
- 남의 기록이면 403 대신 **404**("찾을 수 없어요")로 존재 여부를 숨긴다
- 별자리·별 같은 공용 콘텐츠 조회는 세션이 없어도 된다

### 세션 없음·DB 장애 응답 예시

| 상황 | API | 응답 |
| ---- | --- | ---- |
| 세션 쿠키 없음·만료·위조 | 사용자별 API 전부 | `401 { "error": "데모를 다시 시작해 주세요.", "code": "NO_SESSION", "help": null }` |
| 〃 + 문장에 위기 표현 | 체크인·별 시도 | `401 { …, "code": "NO_SESSION", "risk": "danger", "help": { "title": "혼자 감당하지 않아도 돼요", "lines": [...] } }` (규칙만, 저장·AI 없음) |
| DB 장애 | `POST /api/demo/session` | `503 { "ready": false, "error": "지금은 데모를 시작할 수 없어요. 잠시 후 다시 시도해 주세요." }` |
| DB 장애 | `POST /api/checkin` | `200 { "checkinId": null, "weather": …, "risk": …, "help": …, "usedFallback": …, "modelVersion": … }` — 저장만 건너뛰고 위기 안내는 그대로 |
| DB 장애 | `PATCH /api/checkin/weather` | `500 { "error": "지금은 저장하지 못했어요." }` |
| DB 장애 | `getDemoUserId()`를 쓰는 API | 세션을 확인할 수 없어 `null` → `401 NO_SESSION`. FE가 이어서 `/api/demo/session`을 부르면 `503`이 오므로 "잠시 후 다시" 안내 |

FE 처리 순서: `help`가 있으면 먼저 안내 → `401`이면 세션 재발급 → `503`/`500`이면 입력을 지우지 않고 "잠시 후 다시".

### 새 사용자의 초기 상태

| 값 | 초기값 |
| -- | ------ |
| `users.nickname` | `데모 사용자` |
| `users.current_stage` | 1 |
| `users.region_code` | `11440` (데모 지역 서울 마포구) |
| 체크인·별 시도·회고·추천 | 비어 있음 (다른 사람 기록을 복제하지 않음) |

시작 질문 답(`start_answers`)과 고른 별자리(`user_constellations`)는 화면 흐름에서 저장한다.

## DB 변경

- 새 DB: `db/init/*.sql`이 처음 한 번 자동 실행 (Docker) 또는 SQL Editor에서 순서대로 실행
- **운영 중인 Neon:** `db/migrations/` 안의 변경 SQL만 이름 순서대로 적용 (모두 여러 번 실행해도 안전하게 작성)

| 파일 | 내용 | Neon 적용 |
| ---- | ---- | --------- |
| `20261119_demo_sessions.sql` | 데모 세션 테이블 `demo_sessions` | ✅ 2026-11-19 적용 |

적용 방법: Neon 콘솔 → SQL Editor에 파일 내용을 붙여넣고 Run (또는 `psql "$DATABASE_URL" -f db/migrations/파일.sql`). 적용 후 `/api/health`의 `demoSessions`가 `"ready"`인지 확인.
스키마를 바꾸면 `db/init/01_schema.sql`(새 DB용)과 `db/migrations/`(운영 DB용), `db/erdcloud.sql`(확인용)을 함께 수정한다.

## 로컬에서 실행하기

### 1. 준비물 (한 번만)

- Node.js 20 이상
- 팀 DM으로 받은 Neon `DATABASE_URL` (Docker는 필요 없음)

### 2. 환경 변수

```bash
cp .env.example .env.local
```

`.env.local`에 `DATABASE_URL`(팀 공용 Neon 주소, 로컬 Docker면 기본값 그대로)과 `GEMINI_API_KEY`를 넣습니다 ([AI Studio](https://aistudio.google.com/apikey)에서 무료 발급).
Gemini 키가 없어도 AI 기능은 기본값으로 동작합니다.

### 3. 실행

```bash
npm install
npm run dev
```

- http://localhost:3000/api/health 에서 DB 연결과 Gemini 키 상태 확인

### 로컬 Docker DB를 처음부터 다시 만들기 (선택)

```bash
# 저장소 루트에서
docker compose down -v && docker compose up -d
```

> ⚠ `down -v`는 **기존 데이터를 모두 삭제**합니다. 데이터를 남겨야 하면 바뀐 컬럼·뷰만 `ALTER TABLE ... ADD COLUMN`, `CREATE VIEW`로 직접 추가하세요.

## 배포 (Vercel + Neon)

Vercel 프로젝트는 GitHub 저장소와 연결되어 있다. 설정값은 아래와 맞춘다.

| 항목 | 값 |
| ---- | -- |
| Root Directory | **`web`** |
| Framework | Next.js (자동 인식), Build·Install 명령은 기본값 |
| Production Branch | `master` (합쳐지면 자동 배포) |
| Preview | 다른 브랜치·PR을 푸시하면 미리보기 주소가 자동 생성 → 팀 검증용 |

Environment Variables (이름만 적는다. 값은 Vercel 설정에만 입력하고 문서·채팅·로그에 붙이지 않는다)

| 이름 | Production | Preview | 비고 |
| ---- | :--------: | :-----: | ---- |
| `DATABASE_URL` | ✅ | ✅ | Neon **Pooled** 주소. `sslmode=verify-full` 권장 (`require`는 pg 다음 버전에서 의미가 바뀐다는 경고가 나옴) |
| `GEMINI_API_KEY` | ✅ | ✅ | 없으면 AI는 기본값으로 동작 |
| `GEMINI_MODEL` | ✅ | ✅ | 무료 등급 모델명 확인 후 입력 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 지도 붙일 때 | 지도 붙일 때 | 카카오 콘솔에 배포·미리보기 도메인 등록 |
| 공공 API 키 (`DATA_GO_KR_KEY` 등) | 수집 API 붙일 때 | 〃 | `.env.example` 참고 |

데모 세션은 별도 비밀 값이 필요 없다. 화면은 `fetch('/api/...')`로 같은 앱을 부르므로 API 주소 변수도 없다.

배포 확인
1. `https://<배포 주소>/api/health` → `db: "ok"`, `demoSessions: "ready"`, `gemini: "key set"`
2. 데모 시작 화면에서 `POST /api/demo/session` → `{ "ready": true }`, 응답에 `Set-Cookie: naranhi_demo=...; Secure; HttpOnly; SameSite=lax`
3. 체크인 → 새로고침해도 같은 사용자로 이어지는지 확인
4. 카카오 개발자 콘솔 → 플랫폼(Web)에 배포 주소 등록 (`http://localhost:3000`도 함께)

- 스키마 변경은 위 "DB 변경" 순서대로 Neon에 먼저 적용한 뒤 배포

## 폴더 구조

```
src/app/              화면 (페이지)
src/app/api/          API (Route Handler)
  demo/session/       데모 시작 (브라우저마다 가상 사용자, 세션 쿠키)
  checkin/            AI ② 체크인 → 마음 날씨 + AI ③ 위기 표현 안내 (새 API의 참고 예시)
  checkin/weather/    마음 날씨 직접 고치기
  health/             DB·세션 테이블·AI 상태 확인
src/lib/
  db.ts               DB 연결
  demo-session.ts     현재 데모 사용자 구하기 (getDemoUserId)
  gemini.ts           Gemini 호출 공통 함수 (JSON 스키마 + 실패 시 기본값)
  safety.ts           위험 표현 규칙(직접·간접 2단계), AI 실패 시 판단(assessRisk), 안내 문구
  weather.ts          마음 날씨 종류
(DB 스키마·시드는 저장소 루트 db/init/, 운영 DB 변경 SQL은 db/migrations/)
```

## AI 기능 구현 현황

| # | 기능 | 위치 | 상태 |
| - | ---- | ---- | ---- |
| ① | 오늘의 별 추천 + 시도한 별 다음 행동 | `api/recommend` | TODO |
| ② | 체크인 → 마음 날씨 | `api/checkin` | 완료 |
| ③ | 위기 표현 안내 | `lib/safety.ts` + 각 API | 체크인에 적용됨, 회고에도 적용 필요 |
| ④ | 회고 맞춤 응원 | `api/reflection` | TODO |
| ⑤ | 정책 참여 부담 분류 | `scripts/classify-policies.ts`(로컬에서 미리 분류) + `api/policies` | TODO |
| ⑥ | 문의 문장 초안 | `api/inquiry` | TODO |

새 AI 기능은 `api/checkin/route.ts`와 같은 순서로 만듭니다.
**입력 검증 → (규칙 검사) → `generateJson`(스키마 + 기본값) → DB 저장(실패해도 흐름 유지) → 응답**

## 주의

- 시연용 서비스, 실사용 없음. Gemini 무료 등급 → **실제 개인정보 입력 금지, 테스트 데이터만** (안내 문구: `docs/화면설계.md`)
- 사진은 선택 기능. Vercel은 서버에 파일을 저장할 수 없으므로 MVP에서는 저장하지 않음
