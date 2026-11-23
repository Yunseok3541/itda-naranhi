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
  // 대기 화면도 흰색 대신 밤하늘 배경 (청년센터·밤하늘과 같은 night-fallback)
  return <Suspense fallback={<main className="shell sky-mode night-fallback"><p className="night-loading">별을 불러오고 있어요…</p></main>}><Detail {...props} /></Suspense>;
}
