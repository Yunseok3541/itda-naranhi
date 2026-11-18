# 나란히 (itda-naranhi)

> **AI 기반 개인 맞춤형 사회화 퀘스트 앱**
> 고립·은둔 청년이 아주 작은 행동부터 자기 속도로 시작해, 실제 장소와 사람에게 이어지도록 돕는 모바일 웹 서비스 (해커톤 프로젝트)

- 별 하나 = 작은 퀘스트 하나. 해냈다면 **"하늘의 별 따기"**로 별을 따서 내 별자리에 담고, 시도만 해도 희미한 별로 남습니다.
- AI가 한 줄 체크인과 회고를 바탕으로 오늘의 별을 추천하고, 어려웠던 이유에 맞춰 다음 걸음을 다시 찾습니다.
- 지향점: **언젠가 필요 없어지기를 바라는 앱**

## 폴더 구조

```
docs/
  기획/            아이디어_v1 ~ v4 (v4가 최신 기획)
  고민기록.md      결정 과정과 이유, 예상 질문 (#1~)
  기술스택.md      기술 스택, DB 설계
  작업메모.md      이어서 작업할 때 먼저 볼 것 (할 일, 결정 요약)
  참고자료/        심사 기준 등
prototype/         Next.js 프로토타입 (실행 방법은 prototype/README.md)
```

## 빠른 시작

```bash
git clone https://github.com/Yunseok3541/itda-naranhi.git
cd itda-naranhi/prototype
npm install
cp .env.example .env.local     # GEMINI_API_KEY 등 입력
docker compose up -d           # Docker Desktop 필요
npm run dev                    # http://localhost:3000/api/health
```

## 기술 스택

Next.js 16 + TypeScript + Tailwind CSS (모바일 웹) · Gemini API · PostgreSQL 16 (Docker) · 카카오맵 · 공공데이터(온통청년, 복지서비스, 1365)

자세한 내용은 [docs/기술스택.md](docs/기술스택.md)를 참고하세요.

> API 키는 `prototype/.env.local`에만 저장하고 커밋하지 않습니다.
