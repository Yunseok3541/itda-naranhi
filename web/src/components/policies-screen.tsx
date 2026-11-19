"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request, type Mode } from '@/lib/mobile-data';

type Policy = {
  policyId: number; title: string; summary: string; reason: string; burdenLabel: string;
  scope: string; deadline: string | null; url: string | null; tags: string[];
  needsInquiry: boolean; conditionsToCheck: string[]; mayNotFit: string[];
};
type Result = { items: Policy[]; usedFallback?: boolean; basis: { region: string; updatedAt: string | null } };

const example: Result = {
  items: [{ policyId: 1, title: '예시 생활 지원 정책', summary: '정책 화면을 체험하기 위한 가상 정보예요. 실제 모집 중인 정책이 아니에요.',
    reason: '집에서 내용을 확인해 볼 수 있는 지원을 살펴봐요.', burdenLabel: '온라인 신청', scope: '예시 지역', deadline: null,
    url: null, tags: ['생활 지원'], needsInquiry: false, conditionsToCheck: ['실제 정책의 신청 조건은 원문에서 확인해 주세요.'], mayNotFit: [] }],
  basis: { region: '예시 지역', updatedAt: null },
};

export default function PoliciesScreen({ mode, onError, onClearError }: { mode: Mode; onError: (error: unknown) => void; onClearError: () => void }) {
  const [view, setView] = useState<'recommended' | 'all'>('recommended');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(''); setResult(null); onClearError();
      try {
        const data = mode === 'example' ? example : await request<Result>(`policies${view === 'all' ? '?view=all' : ''}`);
        if (active) setResult(data);
      } catch (error) {
        if (active) { setError(error instanceof Error ? error.message : '정책을 불러오지 못했어요.'); onError(error); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
    // onError reports into the parent; changes to the parent must not reload recommendations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view, retry]);

  return <>
    <h1>나에게 맞는 정책</h1>
    <p>내 속도에 맞는 지원을 천천히 살펴보세요.</p>
    <Link className="text-button" href="/profile">내 정보에서 추천 기준 바꾸기</Link>
    <div className="choices" aria-label="정책 보기 방식">
      <button className="secondary" aria-pressed={view === 'recommended'} onClick={() => setView('recommended')}>맞춤 추천</button>
      <button className="secondary" aria-pressed={view === 'all'} onClick={() => setView('all')}>모든 정책 보기</button>
    </div>
    {mode === 'example' && <p className="small">가상 정책으로 화면을 체험하고 있어요.</p>}
    {loading && <p role="status">정책을 불러오고 있어요…</p>}
    {error && <section className="card"><p>잠시 후 다시 불러와 주세요.</p><button onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></section>}
    {result && <>
      <p className="small">{result.basis.region}{result.basis.updatedAt && ` · ${result.basis.updatedAt} 기준`}{result.usedFallback && ' · 기본 추천'}</p>
      {result.items.length === 0 && <section className="card"><h2>지금 보여드릴 정책이 없어요</h2><p>다른 정책을 살펴보거나 내 정보를 확인해 주세요.</p></section>}
      {result.items.map(policy => <article className="card" key={policy.policyId}>
        <p className="small">{[policy.scope, policy.burdenLabel, policy.deadline].filter(Boolean).join(' · ')}</p>
        <h2>{policy.title}</h2><p>{policy.summary}</p><p>{policy.reason}</p>
        {policy.tags.length > 0 && <p className="small">{policy.tags.join(' · ')}</p>}
        {policy.mayNotFit.length > 0 && <><h3>맞지 않을 수 있는 조건</h3><ul>{policy.mayNotFit.map(condition => <li key={condition}>{condition}</li>)}</ul></>}
        {policy.conditionsToCheck.length > 0 && <><h3>확인할 신청 조건</h3><ul>{policy.conditionsToCheck.map(condition => <li key={condition}>{condition}</li>)}</ul></>}
        {policy.url && /^https?:\/\//i.test(policy.url) && <a className="primary" href={policy.url} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (mode === 'api') void request(`policies/${policy.policyId}/click`, 'POST', {}).catch(() => {}); }}>정책 원문 확인</a>}
        {policy.needsInquiry && <Link className="secondary" href="/centers">청년센터에서 문의 준비하기</Link>}
      </article>)}
    </>}
  </>;
}
