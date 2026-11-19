import type { Metadata } from 'next';
import SkyPanorama from './sky-panorama';

export const metadata: Metadata = { title: '별을 바라보는 밤 · 나란히' };

export default function Page() {
  return <SkyPanorama />;
}
