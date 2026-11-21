'use client';

import Image from 'next/image';
import { useState } from 'react';
import './first-star-bow.css';

const poses = ['rest', 'dip', 'bow'] as const;

export default function FirstStarBow({ characterId, alt, play, eager = false }: {
  characterId: string;
  alt: string;
  play: boolean;
  eager?: boolean;
}) {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());

  return <span className="first-star-bow" data-ready={play && poses.every(pose => loaded.has(pose)) || undefined}>
    {poses.filter(pose => pose === 'rest' || play).map(pose => (
      <Image key={pose}
        data-pose={pose}
        src={`/catalog/${characterId}${pose === 'rest' ? '' : `-${pose}`}.webp`}
        alt={pose === 'rest' ? alt : ''}
        fill
        unoptimized
        loading={eager || pose !== 'rest' ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(previous => new Set([...previous, pose]))}
      />
    ))}
  </span>;
}
