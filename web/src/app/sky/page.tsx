import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type SkyParams = Promise<{ completed?: string }>;

async function Sky({ searchParams }: { searchParams: SkyParams }) {
  const { completed } = await searchParams;
  const id = typeof completed === 'string' && /^\d+$/.test(completed) ? Number(completed) : undefined;
  const attemptId = id !== undefined && Number.isSafeInteger(id) && id > 0 ? id : undefined;
  return <MobileFlow key={attemptId} completionAttemptId={attemptId} />;
}

export default function Page({ searchParams }: { searchParams: SkyParams }) {
  return <Suspense fallback={<main className="shell">밤하늘을 불러오고 있어요…</main>}>
    <Sky searchParams={searchParams} />
  </Suspense>;
}
