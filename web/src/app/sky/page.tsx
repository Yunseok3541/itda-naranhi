import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type SkyParams = Promise<{ completed?: string; memory?: string; guide?: string; tour?: string }>;

function readId(value: string | undefined) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function Sky({ searchParams }: { searchParams: SkyParams }) {
  const { completed, memory, guide, tour } = await searchParams;
  const attemptId = readId(completed), starId = readId(memory);
  // guide=1: 설정의 "사용 안내 다시 보기" → 시작 안내부터 (끝나면 /sky로 돌아옴)
  const replay = guide === '1';
  // tour=1: 메뉴 안내만 다시 (확인·시연용)
  return <MobileFlow key={`${attemptId ?? ''}:${starId ?? ''}:${replay ? 'guide' : ''}`} completionAttemptId={attemptId} memoryStarId={starId} guide={replay} tour={tour === '1'} />;
}

export default function Page({ searchParams }: { searchParams: SkyParams }) {
  return <Suspense fallback={<main className="shell">밤하늘을 불러오고 있어요…</main>}>
    <Sky searchParams={searchParams} />
  </Suspense>;
}
