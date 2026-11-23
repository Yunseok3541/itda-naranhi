'use client';
import type { CSSProperties, ReactNode } from 'react';
import type { Mode } from '@/lib/mobile-data';
import type { AccessoryId } from '@/lib/shop';
import { useShop } from './use-shop';
import SkyPerson from './sky-person';

// Top of each image's visible pixels in the 172-unit SkyPerson view box.
const artTop: Record<string, number> = {
  person: -41, baram: 55, dalkong: 55, doran: 67, moa: 55, mulggam: 63,
  noeul: 55, posil: 59, saebit: 72, sobok: 55, yeoul: 55, yunseul: 83,
};

// The full worn artwork has a different top edge from the undecorated character.
const wornArtTop: Record<string, Record<AccessoryId, number>> = {
  person: { "moon-hat": -72, "star-crown": -49, "star-pin": -42 },
  baram: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  dalkong: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  doran: { "moon-hat": 35, "star-crown": 43, "star-pin": 52 },
  moa: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  mulggam: { "moon-hat": 24, "star-crown": 26, "star-pin": 46 },
  noeul: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  posil: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  saebit: { "moon-hat": 44, "star-crown": 51, "star-pin": 57 },
  sobok: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  yeoul: { "moon-hat": 24, "star-crown": 24, "star-pin": 24 },
  yunseul: { "moon-hat": 85, "star-crown": 88, "star-pin": 92 },
};

export default function DressedSkyPerson({ mode, children }: { mode: Mode; children?: ReactNode }) {
  const { state, character } = useShop(mode);
  const item = state?.equipped;
  const top = (item ? wornArtTop[character]?.[item] : undefined) ?? artTop[character] ?? 54;
  const rise = (172 - top) / 172;
  return <span className="sky-quest-character-art" data-companion={character !== 'person' || undefined}
    style={{ '--quest-art-rise': `${rise * 100}%` } as CSSProperties}>
    <span className="sky-quest-figure"><SkyPerson sculpted character={character} item={item} /></span>
    {children}
  </span>;
}
