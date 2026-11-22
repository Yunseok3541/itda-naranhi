'use client';
import Link from 'next/link';
import { CHECKIN_POINTS, METEOR_POINTS } from '@/lib/points';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import { accessories, accessoryById, type AccessoryId } from '@/lib/shop';
import { ScreenBar } from './screen-kit';
import SkyPerson from './sky-person';
import { useShop } from './use-shop';
import './starlight-shop.css';

export default function StarlightShop({ mode }: { mode: Mode }) {
  const { state, setState, character, error: loadError, refresh } = useShop(mode);
  const [choice, choose] = useState<AccessoryId | undefined>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const tipDialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [arrival, setArrival] = useState(0);
  const selected = choice ?? state?.equipped ?? null;
  const item = accessoryById(selected);
  const owned = !!item && state?.owned.includes(item.id);
  const wearing = !!item && selected === state?.equipped;
  const missing = item && state && !owned ? Math.max(0, item.price - state.balance) : 0;
  const action = wearing ? 'remove' : owned ? 'equip' : 'buy';
  const label = busy ? '저장 중…' : missing ? `${missing}P 더 필요해요` : wearing ? '벗기' : owned ? '착용하기' : `${item?.price}P로 구매하고 착용`;
  const previewing = selected !== (state?.equipped ?? null);
  const actionIcon = busy ? '…' : missing ? '–' : wearing ? '−' : owned ? '✓' : '✦';

  async function apply() {
    if (!item || lock.current || missing) return;
    lock.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await client(mode).changeAccessory(action, item.id);
      setState(result);
      choose(undefined);
      setArrival(n => n + 1);
      setNotice(action === 'remove' ? '장식을 벗었어요.' : `${item.name}${item.id === 'moon-hat' ? '를' : '을'} 착용했어요.`);
      window.dispatchEvent(new Event('wardrobe-changed'));
      if (mode === 'api') {
        try { localStorage.setItem('naranhi-shop-updated', crypto.randomUUID()); }
        catch { /* Other tabs also refresh on focus. */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.');
      refresh();
    } finally { lock.current = false; setBusy(false); }
  }

  return <div className="starlight-shop">
    <ScreenBar title="별빛 상점" back="/profile" backLabel="프로필로 돌아가기" />
    {loadError && <div className="shop-feedback"><p role="alert">{loadError}</p>
      <button type="button" className="secondary shop-retry" onClick={refresh}>다시 불러오기</button>
    </div>}
    {!state && !loadError && <p role="status">상점을 열고 있어요…</p>}
    {state && <>
      <div className="shop-display" data-item={selected ?? undefined}>
        <div className="shop-display-top">
          <span className="shop-caption" data-preview={previewing}>
            <span className="shop-caption-dot" aria-hidden="true" />
            {previewing ? '미리보기' : wearing ? '착용 중' : '내 캐릭터'}
          </span>
          <div className="shop-wallet" role="group" aria-label="사용 가능 포인트">
            <span aria-hidden="true">✦</span><strong>{state.balance.toLocaleString('ko-KR')}P</strong>
          </div>
        </div>
        <div className="shop-stage"><SkyPerson key={arrival} sculpted character={character} item={selected}
          animate={arrival > 0 && !!notice && !choice} /></div>
        <p className="shop-preview-name" aria-live="polite">{item?.name ?? '장식을 눌러 미리 써 볼 수 있어요'}</p>
      </div>
      {/* 포인트 모으는 방법은 작은 Tip 버튼 → 작은 창 (쇼핑 흐름을 가리지 않게) */}
      <button type="button" className="text-button shop-tip-open" aria-haspopup="dialog" onClick={() => tipDialog.current?.showModal()}>
        <span aria-hidden="true">✦</span> 포인트 모으는 Tip
      </button>
      <dialog ref={tipDialog} className="shop-tip" aria-labelledby="shop-tip-title"
        onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <h2 id="shop-tip-title">포인트 모으는 Tip</h2>
        <ul>
          <li><span>하루 첫 한 줄 기록</span><b>+{CHECKIN_POINTS}P</b></li>
          <li><span>별을 처음 따면</span><b>+10~40P</b></li>
          <li><span>별똥별 잡기</span><b>+{METEOR_POINTS}P</b></li>
        </ul>
        <p>천천히 모아도 괜찮아요.</p>
        <button type="button" className="secondary" onClick={() => tipDialog.current?.close()}>알겠어요</button>
      </dialog>
      <h2 className="shop-heading" id="shop-accessories">머리 장식</h2>
      <div className="shop-stock" role="group" aria-labelledby="shop-accessories">
        {accessories.map(product => {
          const shortfall = Math.max(0, product.price - state.balance);
          const productState = state.equipped === product.id ? 'wearing' : state.owned.includes(product.id) ? 'owned' : shortfall ? 'unavailable' : 'priced';
          return <button type="button" key={product.id} className="secondary shop-product" data-item={product.id}
            aria-pressed={selected === product.id} disabled={busy} onClick={() => {
              choose(product.id); setNotice(''); setError(''); setArrival(0);
            }}>
            <span className="shop-product-art">
              <Image unoptimized src={`/shop/${product.id}.svg`} width="76" height="60" alt="" />
              <span className="shop-selection-mark" aria-hidden="true">✓</span>
            </span>
            <strong>{product.name}</strong>
            <small className="shop-product-status" data-state={productState}>
              {productState === 'wearing' ? '착용 중' : productState === 'owned' ? '보유 중' : product.price + 'P'}
            </small>
            {productState === 'unavailable' && <small className="shop-product-shortfall">{shortfall}P 더 모으면</small>}
          </button>;
        })}
      </div>
      {item && <button type="button" className="secondary shop-action" data-action={missing ? 'unavailable' : action}
        disabled={busy || !!missing} onClick={apply}>
        <span className="shop-action-icon" aria-hidden="true">{actionIcon}</span>
        <span>{label}</span>
      </button>}
      {error && <p className="shop-feedback" role="alert">{error}</p>}
      <p className="shop-result" role="status">{notice}</p>
      {notice && <Link className="shop-sky-link" href="/sky">내 밤하늘에서 보기 <span aria-hidden="true">↗</span></Link>}
    </>}
  </div>;
}
