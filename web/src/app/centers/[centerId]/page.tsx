import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type DetailParams = Promise<{ from?: string | string[] }>;

async function Detail({ params, searchParams }: { params: Promise<{ centerId: string }>; searchParams: DetailParams }) {
  const { centerId } = await params;
  const { from } = await searchParams;
  // 정책 화면에서 목록을 거쳐 왔으면 목록으로 돌아갈 때도 그 표시를 이어 감
  return <MobileFlow screen="centers" centerId={Number(centerId)} centersFrom={from === 'policies' ? 'policies' : 'sky'} />;
}

export default function Page({ params, searchParams }: { params: Promise<{ centerId: string }>; searchParams: DetailParams }) {
  return <Suspense fallback={<main className="shell">센터를 불러오고 있어요…</main>}><Detail params={params} searchParams={searchParams} /></Suspense>;
}
