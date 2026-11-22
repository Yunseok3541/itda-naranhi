import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

// from=policies: 정책 화면에서 들어옴 → 뒤로 가기는 정책 화면으로 (기본은 내 밤하늘로)
type CentersParams = Promise<{ from?: string | string[] }>;

async function Centers({ searchParams }: { searchParams: CentersParams }) {
  const { from } = await searchParams;
  return <MobileFlow screen="centers" centersFrom={from === 'policies' ? 'policies' : 'sky'} />;
}

export default function Page({ searchParams }: { searchParams: CentersParams }) {
  return <Suspense fallback={<main className="shell">청년센터를 불러오고 있어요…</main>}><Centers searchParams={searchParams} /></Suspense>;
}
