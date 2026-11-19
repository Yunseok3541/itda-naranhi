import type { Metadata } from 'next';
import Link from 'next/link';
import CatalogGallery from './catalog-gallery';
import './catalog.css';

export const metadata: Metadata = {
  title: '별자리 도감 · 나란히',
  description: '새빛, 윤슬, 도란과 함께 나란히의 열 별자리 친구를 만나요.',
};

export default function CatalogPage() {
  return (
    <main className="catalog-page">
      <div className="catalog-content">
        <div className="catalog-top-bar">
          <Link href="/sky" className="catalog-back">
            <span aria-hidden="true">←</span> 내 밤하늘
          </Link>
        </div>
        <header className="catalog-intro">
          <div>
            <h1>별자리 도감</h1>
            <p>별자리마다 사는 작은 친구들을 만나 보세요.</p>
          </div>
          <span aria-hidden="true" className="catalog-intro-star">✦</span>
        </header>
        <CatalogGallery />
      </div>
    </main>
  );
}
