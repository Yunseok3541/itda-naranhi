'use client';
import type { Mode } from '@/lib/mobile-data';
import { useShop } from './use-shop';
import SkyPerson from './sky-person';

export default function DressedSkyPerson({ mode }: { mode: Mode }) {
  const { state, character } = useShop(mode);
  return <SkyPerson sculpted character={character} item={state?.equipped} />;
}
