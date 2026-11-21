import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

// from=sky: "오늘의 별" 권유 카드에서 들어옴 → 뒤로 가기는 내 밤하늘로 (기본은 프로필에서 들어온 것으로 보고 프로필로)
type MindCheckParams = Promise<{ from?: string | string[] }>;

async function MindCheck({ searchParams }: { searchParams: MindCheckParams }) {
  const { from } = await searchParams;
  return <MobileFlow screen="mind-check" mindCheckFrom={from === 'sky' ? 'sky' : 'profile'} />;
}

export default function MindCheckPage({ searchParams }: { searchParams: MindCheckParams }) {
  return <Suspense fallback={<main className="shell">마음 짚기를 불러오고 있어요…</main>}>
    <MindCheck searchParams={searchParams} />
  </Suspense>;
}
