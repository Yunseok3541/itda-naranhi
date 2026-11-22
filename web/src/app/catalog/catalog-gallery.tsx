'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { client } from '@/lib/mobile-data';
import { catalogConstellations } from '@/lib/quest-catalog';
import { getStarConstellationId } from '@/lib/constellations';
import { skyConstellation } from '@/lib/sky-constellations';
import { projector, toLonLat, type Vec3 } from '@/lib/sky-view';
import { characters, type Character } from './characters';
import CatalogStardust from './catalog-stardust';
import { useCloseDialogOnHide } from '@/components/use-close-dialog-on-hide';
import FirstStarBow from '@/components/first-star-bow';

const catalogShapes = new Map(catalogConstellations.map(group => {
  const { points, edges } = skyConstellation(group.id, group.quests.length);
  const center: Vec3 = [0, 0, 0];
  for (const [x, y, z] of points) {
    center[0] += x;
    center[1] += y;
    center[2] += z;
  }
  const project = projector({ ...toLonLat(center), fov: 1 }, 100, 100);
  const positions = points.map(point => project(point)!);
  const xs = positions.map(point => point.x), ys = positions.map(point => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const scale = 72 / Math.max(right - left, bottom - top, 1);
  return [group.id, {
    edges,
    points: positions.map(({ x, y }) => [
      (50 + (x - (left + right) / 2) * scale).toFixed(2),
      (50 + (y - (top + bottom) / 2) * scale).toFixed(2),
    ]),
  }] as const;
}));

function CatalogConstellation({ character }: { character: Character }) {
  const shape = catalogShapes.get(character.constellationId);
  return <>
    <CatalogStardust id={character.id} />
    {shape && <svg className="catalog-shape" viewBox="0 0 100 100" aria-hidden="true">
      {shape.edges.map(([a, b]) => <line key={`${a}-${b}`} x1={shape.points[a][0]} y1={shape.points[a][1]}
        x2={shape.points[b][0]} y2={shape.points[b][1]} />)}
      {shape.points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.3" />)}
    </svg>}
  </>;
}

function CharacterArt({ character, acquired, play, large = false }: {
  character: Character;
  acquired: boolean;
  play: boolean;
  large?: boolean;
}) {
  const [imageReady, setImageReady] = useState(false);
  const [waveReady, setWaveReady] = useState(false);
  const bow = character.greeting === 'bow';

  return (
    <span
      className="catalog-art"
      style={{ '--companion-light': character.color } as CSSProperties}
      data-character={character.id}
      data-acquired={acquired}
      data-greeting={acquired && !bow && play && imageReady && waveReady ? 'wave' : undefined}
    >
      {!acquired ? <CatalogConstellation character={character} />
      : bow ? <FirstStarBow characterId={character.id} alt="" play={play} eager={large} />
      : <span className="catalog-portrait">
        <Image
          className="catalog-rest-frame"
          src={`/catalog/${character.id}.webp`}
          alt=""
          fill
          unoptimized
          loading={large ? 'eager' : 'lazy'}
          onLoad={() => setImageReady(true)}
        />
        {play && (
          <Image
            className="catalog-wave-frame"
            src={`/catalog/${character.id}-wave.webp`}
            alt=""
            fill
            unoptimized
            loading="eager"
            onLoad={() => setWaveReady(true)}
          />
        )}
      </span>}
    </span>
  );
}

export default function CatalogGallery() {
  const [selected, setSelected] = useState<Character | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [acquired, setAcquired] = useState<ReadonlySet<number> | null>(null);
  const [progress, setProgress] = useState(new Map<number, { bright: number; total: number }>());
  const [loadFailed, setLoadFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialog);
  const grid = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const mode = localStorage.getItem('naranhi-mode') === 'api' ? 'api' : 'example';
        const api = client(mode);
        void api.sky().then(({ stars }) => {
          if (!active) return;
          const byGroup = new Map<number, { bright: number; total: number }>();
          for (const star of stars) {
            const id = getStarConstellationId(star);
            const count = byGroup.get(id) ?? { bright: 0, total: 0 };
            count.total++;
            if (star.status === 'bright') count.bright++;
            byGroup.set(id, count);
          }
          setProgress(byGroup);
        }).catch(() => { /* The catalog and acquisition labels remain available. */ });
        const { constellations } = await api.avatar();
        if (active && constellations) setAcquired(new Set(constellations.filter(item => item.acquired).map(item => item.constellationId)));
      } catch {
        if (active) setLoadFailed(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function isAcquired(character: Character) {
    return acquired?.has(character.constellationId) === true;
  }

  function statusLabel(character: Character) {
    if (isAcquired(character)) return '만났어요';
    const count = progress.get(character.constellationId);
    if (count) return `별 ${count.bright}/${count.total}`;
    if (acquired) return '별자리 완성 후 만나요';
    return loadFailed ? '만났는지 확인 못 함' : '확인 중';
  }

  useEffect(() => {
    const artwork = grid.current?.querySelectorAll('.catalog-art');
    if (!artwork || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver(entries => {
      const visible: string[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.getAttribute('data-character');
        if (id) visible.push(id);
        observer.unobserve(entry.target);
      }
      if (visible.length) setSeen(previous => new Set([...previous, ...visible]));
    }, { threshold: 0.45 });

    artwork.forEach(art => observer.observe(art));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }
  }, [selected]);

  return (
    <>
      <ul ref={grid} className="catalog-grid" aria-label={`별자리 친구 ${characters.length}명`}>
        {characters.map(character => (
          <li key={character.id}>
            <button
              type="button"
              className="catalog-card"
              aria-haspopup="dialog"
              onClick={() => setSelected(character)}
            >
              <CharacterArt character={character} acquired={isAcquired(character)} play={seen.has(character.id)} />
              <span className="catalog-label">
                <span className="catalog-constellation">{character.constellation.name}</span>
                <strong>{character.nickname}</strong>
                <span className="catalog-acquisition" data-acquired={isAcquired(character)}>{statusLabel(character)}</span>
                <span className="catalog-chevron" aria-hidden="true">›</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="catalog-dialog"
        aria-labelledby={selected ? 'companion-name' : undefined}
        onClose={() => setSelected(null)}
        onClick={event => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <div className="catalog-detail">
            <CharacterArt key={selected.id} character={selected} acquired={isAcquired(selected)} play large />
            <button
              type="button"
              className="catalog-close"
              aria-label="캐릭터 소개 닫기"
              onClick={() => dialog.current?.close()}
            >
              <span aria-hidden="true">×</span>
            </button>
            <div className="catalog-detail-copy">
              <p className="catalog-constellation">{selected.constellation.name}</p>
              <h2 id="companion-name">{selected.nickname}</h2>
              <span className="catalog-acquisition" data-acquired={isAcquired(selected)}>{statusLabel(selected)}</span>
              <p className="catalog-theme">{selected.constellation.theme}</p>
              <p className="catalog-story">{selected.story}</p>
              <p className="catalog-activity">{selected.gesture ?? '내 밤하늘에서 활동할 수 있어요'}</p>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
