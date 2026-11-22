import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenBar } from '@/components/screen-kit';
import CatalogGallery from './catalog-gallery';
import './catalog.css';

export const metadata: Metadata = {
  title: '친구 도감 · 나란히',
  description: '별마중, 새빛, 윤슬과 함께 나란히의 별자리 친구를 만나요.',
};

function CatalogBackLink({ fromProfile = false }: { fromProfile?: boolean }) {
  return <ScreenBar title="친구 도감" back={fromProfile ? '/profile' : '/sky'}
    backLabel={fromProfile ? '프로필로 돌아가기' : '내 밤하늘로'} />;
}

type CatalogSearchParams = Promise<{ from?: string | string[] }>;

async function CatalogBack({ searchParams }: { searchParams: CatalogSearchParams }) {
  const { from } = await searchParams;
  return <CatalogBackLink fromProfile={from === 'profile'} />;
}

export default function CatalogPage({ searchParams }: { searchParams: CatalogSearchParams }) {
  return (
    <main className="catalog-page night-ui">
      <div className="catalog-content">
        <Suspense fallback={null}>
          <CatalogBack searchParams={searchParams} />
        </Suspense>
        <header className="catalog-intro">
          <div>
            <p>별자리마다 사는 작은 친구들을 만나 보세요. 별자리의 별을 모두 따면 그 친구를 만나요.</p>
          </div>
          <span aria-hidden="true" className="catalog-intro-star">✦</span>
        </header>
        <CatalogGallery />
      </div>
    </main>
  );
}
