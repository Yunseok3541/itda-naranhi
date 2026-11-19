import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

async function Detail({ params }: { params: Promise<{ centerId: string }> }) {
  const { centerId } = await params;
  return <MobileFlow screen="centers" centerId={Number(centerId)} />;
}

export default function Page({ params }: { params: Promise<{ centerId: string }> }) {
  return <Suspense fallback={<main className="shell">센터를 불러오고 있어요…</main>}><Detail params={params} /></Suspense>;
}
