"use client";

// 정책 추천. 공통 틀은 screen-kit.tsx
// - 대표 영역: 핵심 메시지 + 기준 지역 칩 / 요약 3칸: 추천 수 · 온라인 신청 · 마감 있음
// - 정책 카드: 방식·마감 칩, 요약, 추천 이유, 신청 조건은 접어 둠
// - 부가 기능(모든 정책 보기, 추천 기준 바꾸기, 청년센터)은 맨 아래 "더보기"
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request, type Mode } from '@/lib/mobile-data';
import { Hero, HeroIcon, MoreLinks, ScreenBar, Summary } from './screen-kit';

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

  const items = result?.items ?? [];
  const all = view === 'all';
  return <>
    <ScreenBar title={all ? '모든 정책' : '정책 추천'} {...(all ? { onBack: () => setView('recommended'), backLabel: '맞춤 추천으로' } : {})} />
    <Hero
      visual={<HeroIcon>✦</HeroIcon>}
      title={all ? '지금 신청할 수 있는 정책' : '내 속도에 맞는 지원'}
      message={all ? '단계와 관계없이 모두 살펴볼 수 있어요.' : '부담 없이 확인해 볼 만한 지원을 골랐어요. 천천히 살펴보세요.'}
      chip={result ? [result.basis.region, result.basis.updatedAt && `${result.basis.updatedAt} 기준`, result.usedFallback && '기본 추천'].filter(Boolean).join(' · ') : undefined}
    />
    {items.length > 0 && <Summary label="정책 요약" items={[
      { value: items.length, label: all ? '신청 가능' : '맞춤 추천' },
      { value: items.filter(p => p.burdenLabel.includes('온라인')).length, label: '온라인 신청' },
      { value: items.filter(p => p.deadline?.includes('마감')).length, label: '마감 있음' },
    ]} />}
    {mode === 'example' && <p className="small">가상 정책으로 화면을 체험하고 있어요.</p>}
    {loading && <p role="status">정책을 불러오고 있어요…</p>}
    {error && <section className="card"><p>잠시 후 다시 불러와 주세요.</p><button onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></section>}
    {result && items.length === 0 && <section className="card"><h2>지금 보여드릴 정책이 없어요</h2><p>다른 정책을 살펴보거나 내 정보를 확인해 주세요.</p></section>}
    {items.map(policy => <article className="card" key={policy.policyId}>
      <div className="card-tags">
        {[policy.scope, policy.burdenLabel].filter(Boolean).map(t => <span key={t}>{t}</span>)}
        {policy.deadline && <span className="gold">{policy.deadline}</span>}
      </div>
      <h2>{policy.title}</h2>
      <p>{policy.summary}</p>
      {policy.reason && <p className="policy-reason"><span aria-hidden="true">✦</span> {policy.reason}</p>}
      {policy.tags.length > 0 && <p className="small">{policy.tags.join(' · ')}</p>}
      {(policy.mayNotFit.length > 0 || policy.conditionsToCheck.length > 0) && <details>
        <summary>신청 조건 확인{policy.mayNotFit.length > 0 && ' · 맞지 않을 수 있어요'}</summary>
        {policy.mayNotFit.length > 0 && <><h3>맞지 않을 수 있는 조건</h3><ul>{policy.mayNotFit.map(c => <li key={c}>{c}</li>)}</ul></>}
        {policy.conditionsToCheck.length > 0 && <><h3>원문에서 확인할 조건</h3><ul>{policy.conditionsToCheck.map(c => <li key={c}>{c}</li>)}</ul></>}
      </details>}
      {policy.url && /^https?:\/\//i.test(policy.url) && <a className="primary" href={policy.url} target="_blank" rel="noopener noreferrer"
        onClick={() => { if (mode === 'api') void request(`policies/${policy.policyId}/click`, 'POST', {}).catch(() => {}); }}>정책 원문 확인</a>}
      {policy.needsInquiry && <Link className="secondary" href="/centers">청년센터에서 문의 준비하기</Link>}
    </article>)}
    <MoreLinks>
      <button type="button" onClick={() => setView(all ? 'recommended' : 'all')}>{all ? '맞춤 추천 보기' : '모든 정책 보기'}</button>
      <Link href="/profile#settings">추천 기준 바꾸기 (내 정보)</Link>
      <Link href="/centers">청년센터 살펴보기</Link>
    </MoreLinks>
  </>;
}
