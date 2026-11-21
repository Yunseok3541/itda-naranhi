'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { characters } from '@/app/catalog/characters';
import FirstStarBow from './first-star-bow';

/**
 * 별자리를 완성해 도감에 친구가 담길 때 뜨는 모달.
 * 기본: 1.2초 뒤 나타나 잠시 뒤 도감으로 이동. onDone을 주면(시작 안내의 첫 친구) 도감으로 가지 않고 "계속하기"를 누를 때까지 그대로
 * (이때 "계속하기"·Esc는 뜬 뒤 0.8초 동안 잠금: 앞 화면에서 연타하던 손가락에 바로 닫히지 않게)
 */
export default function ConstellationCelebration({ constellationId, name, title, message, onDone }: {
  constellationId: number; name: string;
  /** 기본 "○○를 획득하였습니다" 대신 보여 줄 제목·설명 */
  title?: ReactNode; message?: string;
  /** 있으면 도감으로 이동하지 않고, 닫을 때(계속하기·Esc) 부름 */
  onDone?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const character = characters.find(friend => friend.constellationId === constellationId);

  const stay = !!onDone;
  const [canClose, setCanClose] = useState(!stay);
  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealAt = reduced ? 200 : stay ? 400 : 1200;
    if (stay) {
      const reveal = window.setTimeout(() => modal.showModal(), revealAt);
      const unlock = window.setTimeout(() => setCanClose(true), revealAt + 800);
      return () => { window.clearTimeout(reveal); window.clearTimeout(unlock); if (modal.open) modal.close(); };
    }
    const leaveAt = revealAt + 3400;
    const reveal = window.setTimeout(() => modal.showModal(), revealAt);
    const fade = window.setTimeout(() => { modal.dataset.leaving = 'true'; }, leaveAt);
    const finish = window.setTimeout(() => router.replace('/catalog'), leaveAt + (reduced ? 0 : 320));
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(fade);
      window.clearTimeout(finish);
      if (modal.open) modal.close();
    };
  }, [router, stay]);

  return (
    <dialog ref={dialog} className="constellation-celebration" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (!canClose) return; if (onDone) onDone(); else router.replace('/catalog'); }}>
      <div className="constellation-award">
        <span aria-hidden="true">✧</span>
        {character ? (
          <div className="constellation-award-art">
            {character.greeting === 'bow'
              ? <FirstStarBow characterId={character.id} alt={character.nickname} play eager />
              : <Image src={`/catalog/${character.id}.webp`} alt={character.nickname} fill unoptimized loading="eager" />}
          </div>
        ) : <strong aria-hidden="true">✦</strong>}
        <span aria-hidden="true">✧</span>
      </div>
      <h2 id={titleId}>{title ?? <>{name}를<br />획득하였습니다</>}</h2>
      <p>{message ?? '새 별자리가 도감에 담겼어요.'}</p>
      <button type="button" className="ghost" disabled={!canClose} onClick={() => onDone ? onDone() : router.replace('/catalog')}>{onDone ? '계속하기' : '도감으로 이동'}</button>
    </dialog>
  );
}
