import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type SkyParams = Promise<{ completed?: string; memory?: string; guide?: string; tour?: string; checkin?: string; resume?: string }>;

function readId(value: string | undefined) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function Sky({ searchParams }: { searchParams: SkyParams }) {
  const { completed, memory, guide, tour, checkin, resume } = await searchParams;
  const attemptId = readId(completed), starId = readId(memory);
  // guide=1: 설정의 "사용 안내 다시 보기" → 시작 안내부터 (끝나면 /sky로 돌아옴)
  const replay = guide === '1';
  // tour=1: 메뉴 안내만 다시 (확인·시연용)
  return <MobileFlow key={`${attemptId ?? ''}:${starId ?? ''}:${replay ? 'guide' : ''}:${checkin ?? ''}:${resume ?? ''}`} completionAttemptId={attemptId} memoryStarId={starId} guide={replay} tour={tour === '1'} checkin={checkin === '1' || resume === 'today'} resumeToday={resume === 'today'} />;
}

export default function Page({ searchParams }: { searchParams: SkyParams }) {
  // 대기 화면도 청년센터처럼 밤하늘 배경 (night-fallback: MobileFlow가 html에 밤하늘 표시를 붙이기 전, night-sky.css)
  // 예전엔 새로고침할 때마다 흰 화면에 이 문구가 잠깐 보였음
  return <Suspense fallback={<main className="shell sky-mode night-fallback"><p className="night-loading">밤하늘을 불러오고 있어요…</p></main>}>
    <Sky searchParams={searchParams} />
  </Suspense>;
}
