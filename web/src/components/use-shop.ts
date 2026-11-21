'use client';
import { useEffect, useState } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import type { ShopState } from '@/lib/shop';
import { characters } from '@/app/catalog/characters';

export function useShop(mode: Mode) {
  const [state, setState] = useState<ShopState | null>(null);
  const [character, setCharacter] = useState('person');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      try {
        const [shop, avatar] = await Promise.all([client(mode).shop(), client(mode).avatar()]);
        if (current !== revision) return;
        setState(shop);
        setCharacter(characters.find(c => c.constellationId === avatar.avatarConstellationId)?.id ?? 'person');
        setError('');
      } catch (e) { if (current === revision) setError(e instanceof Error ? e.message : '상점을 불러오지 못했어요.'); }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('wardrobe-changed', refresh);
    return () => {
      revision++;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('wardrobe-changed', refresh);
    };
  }, [mode, retry]);
  return { state, character, error, setState, refresh: () => setRetry(n => n + 1) };
}
