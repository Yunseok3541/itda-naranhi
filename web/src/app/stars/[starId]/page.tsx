import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

type DetailProps = {
  params: Promise<{ starId: string }>;
  searchParams: Promise<{ from?: string }>;
};

async function Detail({ params, searchParams }: DetailProps) {
  const [{ starId }, { from }] = await Promise.all([params, searchParams]);
  return <MobileFlow screen="star" starId={Number(starId)} fromToday={from === 'today'} />;
}

export default function Page(props: DetailProps) {
  return <Suspense fallback={<main className="shell">별을 불러오고 있어요…</main>}><Detail {...props} /></Suspense>;
}
