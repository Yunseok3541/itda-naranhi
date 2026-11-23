import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';

// 정적 페이지: 어디서 들어왔는지(?from=policies → 뒤로 가기는 정책 화면)는 화면(centers-screen.tsx)이 주소에서 직접 읽음.
// 서버에서 searchParams를 읽으면 누를 때마다 서버 응답을 기다리며 흰 대기 화면이 1~2초 보였음 → 미리 받아 둔 화면으로 바로 넘어감
export default function Page() {
  return <Suspense fallback={<main className="shell sky-mode night-fallback"><p className="night-loading">청년센터를 불러오고 있어요…</p></main>}>
    <MobileFlow screen="centers" />
  </Suspense>;
}
