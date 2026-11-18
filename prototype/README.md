# prototype (Next.js 시험 구현, 참고용)

> 팀 스택을 정하기 전에 혼자 먼저 만들어 본 시험 구현. 실제 개발은 루트의 `frontend/`, `backend/`에서 진행하며, 이 폴더의 API 계약·위험 판단 로직·프롬프트를 옮겨 쓴다.
> 기획은 `docs/기획/아이디어_v4.md`, 결정 과정은 `docs/고민기록.md` 참고

## 스택 (비용 0원)

| 영역 | 선택 |
| ---- | ---- |
| 앱 | Next.js 16 + TypeScript + Tailwind CSS (모바일 웹) |
| 애니메이션 | motion (별 따기, 별자리 완성 연출) |
| AI | Gemini 무료 API (`@google/genai`) |
| DB | 로컬 PostgreSQL 16 (Docker Compose) |
| 지도 | 카카오맵 JS SDK |

## 처음 실행하기

### 1. 준비물 설치 (한 번만)

- Node.js 20 이상
- PostgreSQL 실행 방법 중 하나
  - **추천: Docker Desktop** (또는 OrbStack) → 팀원 모두 같은 DB 환경
  - Docker 없이: `brew install postgresql@16` 후 직접 DB 생성 (아래 "Docker 없이" 참고)

### 2. 환경 변수

```bash
cp .env.example .env.local
```

`.env.local`에 `GEMINI_API_KEY`를 넣습니다 ([AI Studio](https://aistudio.google.com/apikey)에서 무료 발급).
키가 없어도 앱은 기본값으로 동작합니다.

### 3. DB 실행 (저장소 루트에서)

```bash
cd ..                  # 저장소 루트 (docker-compose.yml 위치)
docker compose up -d
```

처음 실행할 때 루트 `db/init/`의 SQL(테이블 생성 → 예시 데이터)이 자동으로 들어갑니다.
스키마를 바꾼 뒤 처음부터 다시 만들려면:

```bash
docker compose down -v && docker compose up -d
```

> ⚠ `down -v`는 DB 볼륨을 지워서 **기존 데이터가 모두 삭제**됩니다. 데이터를 남겨야 하면 바뀐 컬럼·뷰만 `ALTER TABLE ... ADD COLUMN`, `CREATE VIEW`로 직접 추가하세요.

### 4. 앱 실행

```bash
npm install
npm run dev
```

- http://localhost:3000/api/health 에서 DB 연결과 Gemini 키 상태 확인

### Docker 없이 PostgreSQL 쓰기

```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s app && psql -d postgres -c "ALTER USER app PASSWORD 'app';"
createdb -O app starquest
psql -U app -d starquest -f ../db/init/01_schema.sql -f ../db/init/02_seed.sql
```

## 폴더 구조

```
(DB 스키마·시드는 저장소 루트 db/init/ 으로 이동)
src/lib/db.ts         DB 연결
src/lib/gemini.ts     Gemini 호출 공통 함수 (JSON 스키마 + 실패 시 기본값)
src/lib/safety.ts     위험 표현 규칙(직접·간접 2단계), AI 실패 시 판단(assessRisk), 안내 문구
src/lib/weather.ts    마음 날씨 종류
src/app/api/checkin   AI ② 체크인 → 마음 날씨 + AI ③ 위험 감지 (다른 AI 기능의 참고 예시)
src/app/api/checkin/weather  마음 날씨 직접 고치기 (AI 한계 대응)
src/app/api/health    세팅 확인용
```

## AI 기능 구현 현황

| # | 기능 | 위치 | 상태 |
| - | ---- | ---- | ---- |
| ① | 오늘의 별 추천 + 시도한 별 다음 행동 | `api/recommend` | TODO |
| ② | 체크인 → 마음 날씨 | `api/checkin` | 완료 (예시) |
| ③ | 위험 신호 감지 | `lib/safety.ts` + 각 API | 체크인에 적용됨, 회고에도 적용 필요 |
| ④ | 회고 맞춤 응원 | `api/reflection` | TODO |
| ⑤ | 정책 참여 부담 분류 | `scripts/classify-policies.ts`(미리 분류) + `api/policies` | TODO |
| ⑥ | 문의 문장 초안 | `api/inquiry` | TODO |

새 AI 기능은 `api/checkin/route.ts`와 같은 순서로 만듭니다.
**입력 검증 → (규칙 검사) → `generateJson`(스키마 + 기본값) → DB 저장 → 응답**

## 시연 관련

- 사진 인증은 `<input type="file" accept="image/*" capture>` 방식으로 구현 → HTTP에서도 휴대폰 카메라 사용 가능
- 기본 시연: 노트북 브라우저 개발자 도구의 모바일 화면 (GPS는 개발자 도구 Sensors에서 위치 지정)
- 휴대폰 시연: `cloudflared tunnel --url http://localhost:3000` 으로 임시 HTTPS 주소 생성
- Gemini 무료 등급은 호출 제한이 있고 입력이 서비스 개선에 쓰일 수 있음 → **실제 개인정보 입력 금지, 테스트 데이터만 사용**
