"use client";
// 마음 짚기 권유 카드: "오늘의 별"에서 추천 별 아래에 (고민기록 #58)
// - 한 번도 짚지 않은 사람에게 한 번. "나중에 할래요"를 누르면 이 브라우저에서는 다시 묻지 않음 (프로필에서 언제든)
// - 도움받을 곳 안내가 뜬 날(위기 표현)에는 보여 주지 않음 → 부르는 쪽(quest-screen.tsx)에서 그리지 않음
// - 실제 API 모드에서 DB 변경 SQL(20261124_mind_check.sql) 적용 전이면 조회가 실패 → 권하지 않음
// - 흐름을 막지 않게 추천 별 다음에 두되, 창 아래쪽에 붙여 처음부터 보이게 (추천 별이 길어 스크롤해야만 보였음. 기능발견성 ④·C 엄지 영역)
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import { MindScopeArt } from './mind-check-art';
import './mind-check.css';

const OFFER_KEY = 'naranhi-mind-offer-v1';

export default function MindCheckOffer({ mode, onGo }: { mode: Mode; onGo?: () => void }) {
  const [show, setShow] = useState(false);
  const [later, setLater] = useState(false);

  // "나중에 할래요" 뒤 안내는 같은 자리에 잠깐 보였다가 사라짐
  useEffect(() => {
    if (!later) return;
    const timer = window.setTimeout(() => setLater(false), 4000);
    return () => window.clearTimeout(timer);
  }, [later]);

  useEffect(() => {
    let active = true;
    if (localStorage.getItem(OFFER_KEY) === 'later') return;
    client(mode).mindCheck()
      .then(r => { if (active && r.latest === null) setShow(true); })
      .catch(() => { /* 못 불러오면 권하지 않음 (프로필에서 들어가는 길은 그대로) */ });
    return () => { active = false; };
  }, [mode]);

  if (later) return <p className="small mind-offer-later" role="status">알겠어요. 마음 짚기는 프로필에서 언제든 할 수 있어요.</p>;
  if (!show) return null;
  return <section className="card mind-offer" aria-labelledby="mind-offer-title">
    <div className="mind-offer-head">
      <span className="mind-offer-art" aria-hidden="true"><MindScopeArt size={46} /></span>
      <div>
        <h3 id="mind-offer-title">마음 짚기도 해 볼래요?</h3>
        <p className="small">4주마다 내 마음을 짚어 보는 14문항 · 2~3분</p>
      </div>
    </div>
    <div className="mind-offer-actions">
      <Link className="primary" href="/mind-check?from=sky" onClick={event => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onGo?.();
      }}>짚어 보기</Link>
      <button type="button" className="secondary" onClick={() => { localStorage.setItem(OFFER_KEY, 'later'); setShow(false); setLater(true); }}>나중에 할래요</button>
    </div>
  </section>;
}
