'use client';
import type { CSSProperties, ReactNode } from 'react';
import type { Mode } from '@/lib/mobile-data';
import { useShop } from './use-shop';
import SkyPerson from './sky-person';

// Top of each image's visible pixels in the 172-unit SkyPerson view box.
const artTop: Record<string, number> = {
  person: -41, baram: 55, dalkong: 55, doran: 67, moa: 55, mulggam: 63,
  noeul: 55, posil: 59, saebit: 72, sobok: 55, yeoul: 55, yunseul: 83,
};

export default function DressedSkyPerson({ mode, children }: { mode: Mode; children?: ReactNode }) {
  const { state, character } = useShop(mode);
  const rise = (172 - (artTop[character] ?? 54)) / 172;
  return <span className="sky-quest-character-art" data-companion={character !== 'person' || undefined}
    style={{ '--quest-art-rise': `${rise * 100}%` } as CSSProperties}>
    <span className="sky-quest-figure"><SkyPerson sculpted character={character} item={state?.equipped} /></span>
    {children}
  </span>;
}
