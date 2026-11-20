import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type SkyParams = Promise<{ completed?: string; memory?: string }>;

function readId(value: string | undefined) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

async function Sky({ searchParams }: { searchParams: SkyParams }) {
  const { completed, memory } = await searchParams;
  const attemptId = readId(completed), starId = readId(memory);
  return <MobileFlow key={`${attemptId ?? ''}:${starId ?? ''}`} completionAttemptId={attemptId} memoryStarId={starId} />;
}

export default function Page({ searchParams }: { searchParams: SkyParams }) {
  return <Suspense fallback={<main className="shell">밤하늘을 불러오고 있어요…</main>}>
    <Sky searchParams={searchParams} />
  </Suspense>;
}
