'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef } from 'react';
import { characters } from '@/app/catalog/characters';

export default function ConstellationCelebration({ constellationId, name }: { constellationId: number; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const character = characters.find(friend => friend.constellationId === constellationId);

  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealAt = reduced ? 200 : 1200;
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
  }, [router]);

  return (
    <dialog ref={dialog} className="constellation-celebration" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); router.replace('/catalog'); }}>
      <div className="constellation-award">
        <span aria-hidden="true">✧</span>
        {character ? (
          <div className="constellation-award-art">
            <Image src={`/catalog/${character.id}.webp`} alt={character.nickname}
              fill unoptimized loading="eager" />
          </div>
        ) : <strong aria-hidden="true">✦</strong>}
        <span aria-hidden="true">✧</span>
      </div>
      <h2 id={titleId}>{name}를<br />획득하였습니다</h2>
      <p>새 별자리가 도감에 담겼어요.</p>
      <button type="button" className="ghost" onClick={() => router.replace('/catalog')}>도감으로 이동</button>
    </dialog>
  );
}
