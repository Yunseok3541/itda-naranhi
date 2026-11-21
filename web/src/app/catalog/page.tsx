import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import CatalogGallery from './catalog-gallery';
import './catalog.css';

export const metadata: Metadata = {
  title: '별자리 도감 · 나란히',
  description: '포실, 새빛, 윤슬과 함께 나란히의 별자리 친구를 만나요.',
};

function CatalogBackLink({ fromProfile = false }: { fromProfile?: boolean }) {
  return <Link href={fromProfile ? '/profile' : '/sky'} className="catalog-back">
    <span aria-hidden="true">←</span> {fromProfile ? '프로필로 돌아가기' : '내 밤하늘'}
  </Link>;
}

type CatalogSearchParams = Promise<{ from?: string | string[] }>;

async function CatalogBack({ searchParams }: { searchParams: CatalogSearchParams }) {
  const { from } = await searchParams;
  return <CatalogBackLink fromProfile={from === 'profile'} />;
}

export default function CatalogPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  return (
    <main className="catalog-page">
      <div className="catalog-content">
        <div className="catalog-top-bar">
          <Suspense fallback={null}>
            <CatalogBack searchParams={searchParams} />
          </Suspense>
        </div>
        <header className="catalog-intro">
          <div>
            <h1>별자리 도감</h1>
            <p>별자리마다 사는 작은 친구들을 만나 보세요. 별자리의 별을 모두 따면 그 친구를 만나요.</p>
          </div>
          <span aria-hidden="true" className="catalog-intro-star">✦</span>
        </header>
        <CatalogGallery />
      </div>
    </main>
  );
}
