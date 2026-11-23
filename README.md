# 나란히 (itda-naranhi)

> **AI 기반 개인 맞춤형 사회화 퀘스트 앱**
> 고립·은둔 청년이 아주 작은 행동부터 자기 속도로 시작해, 실제 장소와 사람에게 이어지도록 돕는 모바일 웹 서비스 (해커톤 프로젝트)

- 별 하나 = 작은 퀘스트 하나. 해냈다면 **"하늘의 별 따기"**로 별을 따서 내 별자리에 담고, 시도만 해도 희미한 별로 남습니다.
- AI가 한 줄 체크인과 회고를 바탕으로 오늘의 별을 추천하고, 어려웠던 이유에 맞춰 다음 걸음을 다시 찾습니다.
- 지향점: **언젠가 필요 없어지기를 바라는 앱**

## 심사위원용 바로가기

- **프로토타입:** https://itda-naranhi.vercel.app (로그인 없이 첫 화면의 '데모 시작' → 가상 사용자로 전체 흐름)
- **결정 과정과 이유:** [docs/고민기록.md](docs/고민기록.md)
- **API 명세:** [docs/API명세.md](docs/API명세.md) · **화면 설계:** [docs/화면설계.md](docs/화면설계.md)
- **AI 호출 공통 함수(검증·실패 시 기본값):** [web/src/lib/gemini.ts](web/src/lib/gemini.ts)
- **평가·검증 스크립트:** [web/scripts/](web/scripts/) (`verify-*` 자동 검사, `eval-*` AI 평가)
- 시연용 서비스이며 모든 데이터는 가상 입력입니다.

## 폴더 구조

```
itda-naranhi/
├── web/                       # Next.js 앱 (화면 + API, Vercel에 배포)
│   ├── src/app/               #   화면 (페이지)
│   ├── src/app/api/           #   API: 체크인, 날씨 수정, 상태 확인 …
│   ├── src/lib/               #   AI 호출, 위험 판단 규칙, DB 연결
│   ├── .env.example           #   환경 변수 예시
│   └── README.md              #   실행·배포 방법
│
├── db/                        # PostgreSQL (Neon·로컬 Docker 공용)
│   ├── init/
│   │   ├── 01_schema.sql      #   테이블·뷰 생성
│   │   └── 02_seed.sql        #   예시 데이터 (별자리, 별, 데모 사용자)
│   └── erdcloud.sql           #   ERDCloud 확인용 DDL
├── docker-compose.yml         # 로컬 DB 실행 (docker compose up -d)
│
└── docs/                      # 기획·설계 문서
    ├── 기획/
    │   ├── 아이디어_v1.md      #   1차 회의록
    │   ├── 아이디어_v2.md      #   단계·별 밝기·공공 API
    │   ├── 아이디어_v3.md      #   심사 기준 반영, AI 기능
    │   └── 아이디어_v4.md      #   ★ 최신 기획 (피드백 반영)
    ├── 화면설계.md             #   화면 목록, 안내 문구, 주의점
    ├── API명세.md              #   API 요청·응답 형식, 지켜야 할 원칙
    ├── 고민기록.md             #   결정 과정과 이유, 예상 질문
    ├── 기술스택.md             #   기술 스택, DB 설계, 배포
    ├── 작업메모.md             #   ★ 이어서 작업할 때 먼저 볼 것
    └── 참고자료/               #   심사 기준
```

### 처음 왔다면 이 순서로 읽어 보세요

1. [docs/기획/아이디어_v4.md](docs/기획/아이디어_v4.md): 무엇을 만드는지 (최신 기획)
2. [docs/작업메모.md](docs/작업메모.md): 지금 어디까지 했고 무엇이 남았는지
3. [docs/고민기록.md](docs/고민기록.md): 왜 이렇게 정했는지
4. 개발을 맡았다면 [docs/화면설계.md](docs/화면설계.md), [docs/API명세.md](docs/API명세.md), [web/README.md](web/README.md)

## 빠른 시작

```bash
git clone https://github.com/Yunseok3541/itda-naranhi.git
cd itda-naranhi/web
npm install
cp .env.example .env.local     # DATABASE_URL(팀 DM으로 공유), GEMINI_API_KEY 입력
npm run dev                    # http://localhost:3000/api/health
```

> **DB는 팀 공용 Neon PostgreSQL을 사용합니다.** Docker는 필요 없습니다.
> 연결 주소는 팀 DM으로 공유하며, README·코드에 절대 쓰지 않습니다.
> 오프라인 개발용 로컬 DB가 필요하면 저장소 루트에서 `docker compose up -d` (선택)

## 기술 스택

Next.js 16 + TypeScript + Tailwind CSS (화면과 API를 한 프로젝트에서) · Gemini API · PostgreSQL (Neon 공용 DB, 로컬 Docker는 선택) · 카카오맵 · 공공데이터(온통청년, 복지서비스, 1365) · **Vercel 배포**

자세한 내용은 [docs/기술스택.md](docs/기술스택.md), 배포 방법은 [web/README.md](web/README.md)를 참고하세요.

> 시연용 서비스입니다. 실제 개인정보를 입력하지 마세요.
> API 키는 `web/.env.local`(로컬)과 Vercel 환경 변수(배포)에만 저장하고 커밋하지 않습니다.

## Credits / Licenses

| 구분 | 명칭 | 출처 · 라이선스 | 사용 위치 |
| --- | --- | --- | --- |
| 오픈소스 | Next.js 16 · React 19 · Tailwind CSS 4 · node-postgres · Motion · Google Gen AI SDK | 각 공식 GitHub · MIT / Apache-2.0 | 웹앱 전체 |
| 외부 API | 온통청년 청년정책 API (한국고용정보원) | https://www.youthcenter.go.kr · 이용 조건에 따름 | 정책 수집·분류·추천 |
| 외부 API | Google Gemini API (gemini-3.5-flash · gemini-3.5-flash-lite) | Google AI 이용약관 | 서비스 AI 기능 |
| 외부 API | OpenAI API (GPT-4o-mini · GPT-4o · GPT-4.1, 교육과정 제공 계정) | OpenAI 이용약관 | 개발 중 평가만 (배포 미사용) |
| 폰트 | Pretendard (jsDelivr) · 마루부리 (네이버) · Noto Sans KR (Google Fonts) | SIL OFL 1.1 | 웹앱 · 발표자료 |
| 이미지 | 도감 캐릭터 그림 | 팀 자체 제작 | 도감 · 프로필 |
| 음원 | Music: "Kiss the Sky" by Aakash Gandhi | YouTube 오디오 보관함 | 배경음악 |
| 개발 도구 | Claude Code · OpenAI Codex | 각 서비스 이용약관 | 코드·문서 작성 보조 (팀이 검토·수정·실행 확인) |
| 통계 | 국무조정실 「2024년 청년의 삶 실태조사」(2025.3) · 보사연·한경협 「청년 은둔화의 결정요인 및 사회경제적 비용 추정」(2026.2) | 각 기관 공개 자료 | 소개서 문제 정의 |
