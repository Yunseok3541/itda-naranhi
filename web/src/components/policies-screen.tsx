"use client";

// 정책 추천. 공통 틀은 screen-kit.tsx
// - 대표 영역: 핵심 메시지 + 기준 지역 칩 / 요약 3칸: 추천 수 · 온라인 신청 · 마감 있음
// - 정책 카드: 방식·마감 칩, 요약, 추천 이유, 신청 조건은 접어 둠
// - 부가 기능(모든 정책 보기, 추천 기준 바꾸기, 청년센터)은 맨 아래 "더보기"
// - 원문 근거 칩: 원문 문장에서 찾은 항목만 "있음", 못 찾으면 "확인 필요" (AI 점수는 보여 주지 않음, 고민기록 #37)
// - [나랑 안 맞아요]: 이유를 고르면 그 정책은 다시 추천하지 않음. 지역·조건 이유는 피드백 루프로 (고민기록 #38)
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request, type Help, type Mode } from '@/lib/mobile-data';
import { Hero, HeroIcon, MoreLinks, ScreenBar, Summary } from './screen-kit';

type Policy = {
  policyId: number; title: string; summary: string; reason: string; burdenLabel: string;
  scope: string; deadline: string | null; url: string | null; tags: string[];
  needsInquiry: boolean; conditionsToCheck: string[]; mayNotFit: string[];
  evidence?: { item: string; status: 'yes' | 'unknown' }[];
};
type FeedbackReason = 'region' | 'eligibility' | 'not_needed' | 'too_hard' | 'other';
type FeedbackResult = { message: string; help: Help };
const reasons: { value: FeedbackReason; label: string }[] = [
  { value: 'region', label: '지역이 달라요' },
  { value: 'eligibility', label: '나이·조건이 안 맞아요' },
  { value: 'not_needed', label: '지금은 필요 없어요' },
  { value: 'too_hard', label: '너무 부담돼요' },
  { value: 'other', label: '다른 이유' },
];
type Result = { items: Policy[]; usedFallback?: boolean; basis: { region: string; updatedAt: string | null } };

const example: Result = {
  items: [{ policyId: 1, title: '예시 생활 지원 정책', summary: '정책 화면을 체험하기 위한 가상 정보예요. 실제 모집 중인 정책이 아니에요.',
    reason: '집에서 내용을 확인해 볼 수 있는 지원을 살펴봐요.', burdenLabel: '온라인 신청', scope: '예시 지역', deadline: null,
    url: null, tags: ['생활 지원'], needsInquiry: false, conditionsToCheck: ['실제 정책의 신청 조건은 원문에서 확인해 주세요.'], mayNotFit: [],
    evidence: [{ item: '온라인 신청', status: 'yes' }, { item: '방문', status: 'unknown' }, { item: '상담·면접', status: 'unknown' }, { item: '서류 제출', status: 'yes' }] }],
  basis: { region: '예시 지역', updatedAt: null },
};

export default function PoliciesScreen({ mode, onError, onClearError }: { mode: Mode; onError: (error: unknown) => void; onClearError: () => void }) {
  const [view, setView] = useState<'recommended' | 'all'>('recommended');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  // 피드백을 보낸 정책: 맞춤 추천에서는 카드 대신 고마움 문장만 남긴다
  const [sent, setSent] = useState<Record<number, FeedbackResult>>({});

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

  const items = (result?.items ?? []).filter(p => view === 'all' || !sent[p.policyId] || sent[p.policyId].help);
  const sentNotes = view === 'all' ? [] : Object.entries(sent).filter(([, r]) => !r.help);
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
      {policy.evidence && policy.evidence.length > 0 && <div className="policy-evidence" aria-label="원문에서 확인한 항목">
        {policy.evidence.map(e => <span key={e.item} className={e.status === 'yes' ? 'yes' : 'unknown'}>
          {e.item} · {e.status === 'yes' ? '원문에 있음' : '확인 필요'}
        </span>)}
      </div>}
      {(policy.mayNotFit.length > 0 || policy.conditionsToCheck.length > 0) && <details>
        <summary>신청 조건 확인{policy.mayNotFit.length > 0 && ' · 맞지 않을 수 있어요'}</summary>
        {policy.mayNotFit.length > 0 && <><h3>맞지 않을 수 있는 조건</h3><ul>{policy.mayNotFit.map(c => <li key={c}>{c}</li>)}</ul></>}
        {policy.conditionsToCheck.length > 0 && <><h3>원문에서 확인할 조건</h3><ul>{policy.conditionsToCheck.map(c => <li key={c}>{c}</li>)}</ul></>}
      </details>}
      {policy.url && /^https?:\/\//i.test(policy.url) && <a className="primary" href={policy.url} target="_blank" rel="noopener noreferrer"
        onClick={() => { if (mode === 'api') void request(`policies/${policy.policyId}/click`, 'POST', {}).catch(() => {}); }}>정책 원문 확인</a>}
      {policy.needsInquiry && <Link className="secondary" href="/centers">청년센터에서 문의 준비하기</Link>}
      {sent[policy.policyId]
        ? <SentNote result={sent[policy.policyId]} />
        : <NotForMe policyId={policy.policyId} mode={mode} onSent={r => setSent(prev => ({ ...prev, [policy.policyId]: r }))} />}
    </article>)}
    {sentNotes.length > 0 && <section className="card" aria-live="polite">
      {sentNotes.map(([id, r]) => <p key={id} className="small">{r.message}</p>)}
    </section>}
    <MoreLinks>
      <button type="button" onClick={() => setView(all ? 'recommended' : 'all')}>{all ? '맞춤 추천 보기' : '모든 정책 보기'}</button>
      <Link href="/profile#settings">추천 기준 바꾸기 (내 정보)</Link>
      <Link href="/centers">청년센터 살펴보기</Link>
    </MoreLinks>
  </>;
}

function SentNote({ result }: { result: FeedbackResult }) {
  return <div className="policy-feedback" role="status">
    <p>{result.message}</p>
    {result.help && <div className="help"><h3>{result.help.title}</h3>{result.help.lines.map(line => <p key={line}>{line}</p>)}</div>}
  </div>;
}

// [나랑 안 맞아요] 이유 고르기 → 한 줄(선택) → 보내기. 예시 모드는 서버에 보내지 않음
function NotForMe({ policyId, mode, onSent }: { policyId: number; mode: Mode; onSent: (result: FeedbackResult) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState<Help>(null);

  async function send() {
    if (!reason || busy) return;
    setBusy(true); setError(''); setHelp(null);
    try {
      const result = mode === 'api'
        ? await request<FeedbackResult>(`policies/${policyId}/feedback`, 'POST', { reason, ...(text.trim() ? { text: text.trim() } : {}) })
        : { message: '알겠어요. 예시 화면이라 실제로 저장하지는 않아요.', help: null };
      onSent(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '지금은 저장하지 못했어요.');
      setHelp((e as { help?: Help }).help ?? null);
    } finally { setBusy(false); }
  }

  if (!open) return <button type="button" className="policy-not-for-me" onClick={() => setOpen(true)}>나랑 안 맞아요</button>;
  return <fieldset className="policy-feedback">
    <legend>어떤 점이 안 맞나요?</legend>
    {reasons.map(r => <label key={r.value}>
      <input type="radio" name={`reason-${policyId}`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
    </label>)}
    <label className="small">한 줄 더 알려 주기 (선택)
      <input type="text" maxLength={200} value={text} onChange={e => setText(e.target.value)} placeholder="예: 저는 서울에 살아요" />
    </label>
    {error && <p role="alert">{error}</p>}
    {help && <div className="help"><h3>{help.title}</h3>{help.lines.map(line => <p key={line}>{line}</p>)}</div>}
    <div className="policy-feedback-actions">
      <button type="button" className="secondary" onClick={() => { setOpen(false); setReason(null); setText(''); setError(''); }}>그만두기</button>
      <button type="button" onClick={() => void send()} disabled={!reason || busy}>{busy ? '보내는 중…' : '알려 주기'}</button>
    </div>
  </fieldset>;
}
