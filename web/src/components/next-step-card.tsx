'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { client, type Help, type Mode } from '@/lib/mobile-data';
import type { NextPlan, NextRecommendation } from '@/lib/next-step';
import SkyControlIcon from './sky-control-icon';
import './next-step.css';

export function NextStepCard({ mode, attemptId, busy, run, onHelp }: {
  mode: Mode; attemptId: number; busy: boolean;
  run: (action: () => Promise<void>) => void; onHelp: (help: Help) => void;
}) {
  const [result, setResult] = useState<NextRecommendation | null>(null);
  const [selection, setSelection] = useState<{ plan: NextPlan | null } | null>(null);
  const stop = result?.options.find(option => option.action === 'stop');
  const choose = (key: string) => run(async () => {
    const chosen = await client(mode).chooseNext(attemptId, key); setSelection(chosen);
  });
  return <section className="card next-step-card" aria-labelledby="next-step-heading">
    {/* 설명 문장은 뺌: 고를 수 있는 것(더 쉽게·다른 날·다른 별·쉬어 가기)은 제안 목록에서 바로 보임 */}
    <h2 id="next-step-heading">다음으로 이어볼 별</h2>
    {!result && <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => {
      const next = await client(mode).nextSteps(attemptId);
      onHelp(next.help); setResult(next);
    })}>{busy ? '이어볼 별을 찾고 있어요…' : '다음으로 이어볼 별 찾아보기'}</button>}
    {result && !selection && <>
      <p className="small">{mode === 'example' ? '예시 모드 · 목록과 선택한 이유를 바탕으로 고른 기본 제안이에요.'
        : result.usedFallback ? '기본 규칙으로 고른 제안이에요.' : 'AI의 제안이에요. 다른 선택을 해도 괜찮아요.'}</p>
      {/* 별 제안은 카드, "오늘은 여기서 마치기"는 다른 종류의 선택이라 목록에서 떼어 "또는" 아래 조용한 한 줄로 */}
      <ul className="next-step-options">{result.options.filter(option => option.action !== 'stop').map(option => <li key={option.key}>
        {/* 종류 대신 그 별의 별자리 이름 (같은 별자리가 먼저인 게 보이게) */}
        {(option.constellationName || option.key === result.recommendedKey) && <div className="card-tags">
          {option.constellationName && <span>{option.constellationName}</span>}
          {option.key === result.recommendedKey && <span className="gold">우선 제안</span>}</div>}
        <h3>{option.title}</h3><p>{option.reason}</p>
        <button type="button" className="secondary" disabled={busy} onClick={() => choose(option.key)}>이 별로 골라 둘래요</button>
      </li>)}</ul>
      {stop && <>
        <p className="next-step-or" aria-hidden="true"><span>또는</span></p>
        <button type="button" className="text-button next-step-rest" disabled={busy} onClick={() => choose(stop.key)}>
          <span className="next-step-rest-icon" aria-hidden="true"><SkyControlIcon name="moon" /></span>
          <span className="next-step-rest-text"><b>오늘은 여기서 마칠래요</b>
            <small>{stop.key === result.recommendedKey ? '오늘은 쉬어 가는 걸 먼저 권해요. ' : ''}다음 별은 정하지 않아도 괜찮아요</small></span>
          <span className="next-step-rest-go" aria-hidden="true">›</span>
        </button>
      </>}
    </>}
    {selection && <div role="status">
      {selection.plan ? <>
        <h3>{selection.plan.title}</h3><p>다음으로 이어볼 별로 골라 뒀어요. 지금 하지 않아도 괜찮아요.</p>
        {selection.plan.preparationHref && <Link className="secondary" href={selection.plan.preparationHref}>센터에서 문의 문장 준비하기</Link>}
        <Link className="primary" href={`/stars/${selection.plan.starId}`}>이 별과 만나 보기 →</Link>
        <button type="button" className="text-button" disabled={busy} onClick={() => setSelection(null)}>다시 고르기</button>
      </> : <p>오늘의 기록은 그대로 남아요. 다음 별은 정하지 않고 마쳤어요.</p>}
    </div>}
  </section>;
}

export function PendingNextLink({ mode, inQuest = false }: { mode: Mode; inQuest?: boolean }) {
  const [plan, setPlan] = useState<NextPlan | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    client(mode).pendingNext().then(r => { if (active) { setPlan(r.plan); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [mode, retry]);
  if (error) return <button className="sky-pill small-pill" type="button" onClick={() => setRetry(r => r + 1)}>이어볼 별 다시 확인</button>;
  if (inQuest && plan) return <Link className="secondary quest-pending-link" href={`/stars/${plan.starId}`}>
    <strong>지난번에 고른 별 이어보기</strong><small>{plan.title}</small>
  </Link>;
  return plan ? <Link className="sky-pill gold" href={`/stars/${plan.starId}`} aria-label={`이어볼 별: ${plan.title}`}>✧ 이어볼 별</Link> : null;
}
