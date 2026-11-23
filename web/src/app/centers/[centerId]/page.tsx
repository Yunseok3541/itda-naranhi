import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';
import { CENTERS } from '@/app/api/_lib/centers-data';

// 센터 목록은 코드에 있는 고정 데이터라 상세 화면도 미리 만들어 둠 → 목록에서 누르면 서버를 기다리지 않고 바로 넘어감
// (목록에 없는 번호는 지금처럼 요청 때 그림. 들어온 곳 ?from=policies는 화면이 주소에서 직접 읽음)
export function generateStaticParams() {
  return CENTERS.map(center => ({ centerId: String(center.id) }));
}

async function Detail({ params }: { params: Promise<{ centerId: string }> }) {
  const { centerId } = await params;
  return <MobileFlow screen="centers" centerId={Number(centerId)} />;
}

export default function Page({ params }: { params: Promise<{ centerId: string }> }) {
  return <Suspense fallback={<main className="shell sky-mode night-fallback"><p className="night-loading">센터를 불러오고 있어요…</p></main>}>
    <Detail params={params} />
  </Suspense>;
}
