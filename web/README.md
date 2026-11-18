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
  - 스키마: `db/init/01_schema.sql`, 예시 데이터: `02_seed.sql` (Neon에 적용 완료, 데모 사용자 `users.id = 1`)
  - **스키마를 바꾸면 Neon SQL Editor에서도 반영**해야 함. 공용 DB라 바꾸기 전에 팀에 먼저 알리기
  - `02_seed.sql`은 다시 실행하지 않기 (데이터가 중복됨)
- 로컬 DB(선택): 루트에서 `docker compose up -d` (`postgres://app:app@localhost:5432/starquest`)
- 환경 변수 예시: `web/.env.example` 참고

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

1. **Neon** (https://neon.tech): 프로젝트 생성 → SQL Editor에서 `db/init/01_schema.sql` → `02_seed.sql` 실행 → 연결 주소 중 **Pooled connection** 복사
2. **Vercel** (https://vercel.com): GitHub 저장소 Import → **Root Directory를 `web`으로 지정**
3. Vercel 프로젝트 Settings → Environment Variables에 입력
   - `DATABASE_URL` = Neon Pooled 연결 주소
   - `GEMINI_API_KEY`, `GEMINI_MODEL`
   - (사용 시) `NEXT_PUBLIC_KAKAO_MAP_KEY`, 공공 API 키
4. Deploy → `https://xxx.vercel.app` 확인 → `/api/health`에서 DB·AI 상태 확인
5. 카카오 개발자 콘솔 → 플랫폼(Web)에 배포 주소 등록 (`http://localhost:3000`도 함께)

- 이후에는 `master`에 푸시하면 자동으로 다시 배포됨
- 스키마를 바꾸면 Neon에도 같은 변경(`ALTER TABLE` 등)을 직접 실행

## 폴더 구조

```
src/app/              화면 (페이지)
src/app/api/          API (Route Handler)
  checkin/            AI ② 체크인 → 마음 날씨 + AI ③ 위기 표현 안내 (새 API의 참고 예시)
  checkin/weather/    마음 날씨 직접 고치기
  health/             DB·AI 상태 확인
src/lib/
  db.ts               DB 연결
  gemini.ts           Gemini 호출 공통 함수 (JSON 스키마 + 실패 시 기본값)
  safety.ts           위험 표현 규칙(직접·간접 2단계), AI 실패 시 판단(assessRisk), 안내 문구
  weather.ts          마음 날씨 종류
(DB 스키마·시드는 저장소 루트 db/init/)
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
