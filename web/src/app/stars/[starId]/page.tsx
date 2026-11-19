import { Suspense } from 'react';
import MobileFlow from '@/components/mobile-flow';
async function Detail({params}:{params:Promise<{starId:string}>}) { const {starId}=await params; return <MobileFlow screen="star" starId={Number(starId)}/>; }
export default function Page({params}:{params:Promise<{starId:string}>}) { return <Suspense fallback={<main className="shell">별을 불러오고 있어요…</main>}><Detail params={params}/></Suspense>; }
