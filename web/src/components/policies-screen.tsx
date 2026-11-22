"use client";

// 정책 추천. 공통 틀은 screen-kit.tsx
// - 대표 영역: 핵심 메시지 + 기준 지역 칩
// - 정책 카드: 방식·마감 칩, 요약, 추천 이유, 신청 조건은 접어 둠
// - 상단 보기 전환: [맞춤 추천] / [모든 정책] / [찜한 정책]. 추천·목록 데이터는 보기별로 기억한다.
// - [모든 정책]: 검색·지역·신청 방식 필터, 24개씩 더 보기. 머리줄과 보기 전환은 스크롤해도 위에 붙어 있음
// - 상단에서 추천 기준 변경과 청년센터로 이동할 수 있다.
// - 원문 근거 칩: 원문 문장에서 찾은 항목만 "있음", 못 찾으면 "확인 필요" (AI 점수는 보여 주지 않음, 고민기록 #37)
// - [신청 도와줘]: 신청 도우미 창 (apply-helper.tsx, 고민기록 #39)
// - [나랑 안 맞아요]: 이유를 고르면 그 정책은 다시 추천하지 않음. 지역·조건 이유는 피드백 루프로 (고민기록 #38)
import Link from 'next/link';
import { useEffect, useLayoutEffect, useState } from 'react';
import { client, policyCriteriaVersion, request, type Help, type Mode } from '@/lib/mobile-data';
import type { StartAnswers } from '@/lib/profile';
import type { HelperPolicy } from '@/lib/apply-helper';
import ApplyHelper from './apply-helper';
import GlassSelect from './glass-select';
import { Hero, HeroIcon, ScreenBar } from './screen-kit';
import HelpLines from './help-lines';

type Policy = {
  policyId: number; title: string; summary: string; reason: string; burdenLabel: string;
  scope: string; deadline: string | null; url: string | null; tags: string[];
  needsInquiry: boolean; conditionsToCheck: string[]; mayNotFit: string[]; burden?: HelperPolicy['burden'];
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
type Feed = 'recommended' | 'all';
type View = Feed | 'saved';
type Counts = { recommended: number | null; all: number | null };
// checkinNeeds: 오늘 체크인에서 읽어 추천에 참고한 것 (고민기록 #47). 맞춤 추천에만
type Result = { view?: Feed; counts?: Counts; items: Policy[]; usedFallback?: boolean; checkinNeeds?: { key: string; label: string }[]; basis: { region: string; updatedAt: string | null } };
const VIEWS: { value: View; label: string }[] = [
  { value: 'recommended', label: '맞춤 추천' },
  { value: 'all', label: '모든 정책' },
  { value: 'saved', label: '찜한 정책' },
];
const pageSize = 24;
const emptyFilters = { query: '', scope: '', method: '' };

function savedPolicyKey(mode: Mode) {
  return `naranhi-saved-policies-${mode}`;
}

type SavedPolicies = { ids: number[]; items: Policy[] };
function readSavedPolicies(mode: Mode): SavedPolicies {
  try {
    const data = JSON.parse(localStorage.getItem(savedPolicyKey(mode)) ?? '[]');
    const ids = Array.isArray(data) ? data : data?.ids;
    return {
      ids: Array.isArray(ids) ? [...new Set(ids.filter(Number.isSafeInteger))] : [],
      items: !Array.isArray(data) && Array.isArray(data?.items) ? data.items : [],
    };
  } catch { return { ids: [], items: [] }; }
}

const example: Result = {
  items: [{ policyId: 1, title: '예시 생활 지원 정책', summary: '정책 화면을 체험하기 위한 가상 정보예요. 실제 모집 중인 정책이 아니에요.',
    reason: '집에서 내용을 확인해 볼 수 있는 지원을 살펴봐요.', burdenLabel: '온라인 신청', scope: '예시 지역', deadline: null,
    url: null, tags: ['생활 지원'], needsInquiry: false, conditionsToCheck: ['실제 정책의 신청 조건은 원문에서 확인해 주세요.'], mayNotFit: [],
    evidence: [{ item: '온라인 신청', status: 'yes' }, { item: '방문', status: 'unknown' }, { item: '상담·면접', status: 'unknown' }, { item: '서류 제출', status: 'yes' }] }],
  basis: { region: '예시 지역', updatedAt: null },
};

// 예시 정책은 모두 같은 가상의 온라인 신청 절차를 사용한다.
const exampleCatalog: { need: NonNullable<StartAnswers['needs']>[number]; policy: Policy }[] = [
  { need: 'money_job', policy: example.items[0] },
  { need: 'health', policy: { ...example.items[0], policyId: 2, title: '예시 마음건강 상담 지원', reason: '몸·마음 건강을 돌보는 데 도움이 되는 상담을 살펴봐요.', scope: '예시 전국', tags: ['몸·마음 건강'] } },
  { need: 'family', policy: { ...example.items[0], policyId: 3, title: '예시 가족 상담 지원', reason: '가족과의 관계에 관해 이야기할 수 있는 곳을 살펴봐요.', tags: ['가족과의 관계'] } },
  { need: 'people', policy: { ...example.items[0], policyId: 4, title: '예시 청년 소모임 지원', reason: '다른 사람과 함께할 수 있는 작은 모임을 살펴봐요.', tags: ['사람 만나기'] } },
];

async function examplePolicies(view: Feed): Promise<Result> {
  const needs = view === 'recommended' ? (await client('example').profile()).startAnswers?.needs : null;
  const matches = exampleCatalog.filter(({ need }) => needs?.includes(need)).map(({ policy }) => policy);
  const recommended = matches.length ? matches : example.items;
  return {
    ...example,
    items: view === 'all' ? exampleCatalog.map(({ policy }) => policy) : recommended,
    counts: { all: exampleCatalog.length, recommended: view === 'all' ? null : recommended.length },
  };
}

// 예시 모드 신청 도우미가 쓰는 가상 원문
const exampleHelperPolicy: HelperPolicy = {
  title: '예시 생활 지원 정책', burden: 'online',
  applyText: '온라인 신청→서류 확인→결과 안내', reviewText: null, docsText: '신분증 사본, 주민등록등본',
};

export default function PoliciesScreen({ mode, onError, onClearError }: { mode: Mode; onError: (error: unknown) => void; onClearError: () => void }) {
  const [view, setView] = useState<View>('recommended');
  const [filters, setFilters] = useState(emptyFilters);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  // 보기별로 불러온 결과 (모드가 바뀌면 버림). 같은 날 맞춤 추천은 서버에서도 같은 결과라 다시 부르지 않아도 됨
  const [loaded, setLoaded] = useState<{ mode: Mode; version: number; byView: Partial<Record<Feed, Result>> }>({ mode, version: 0, byView: {} });
  // 아직 열지 않은 보기의 개수를 버튼에 보여 줄 때 쓰는 값
  const [serverCounts, setServerCounts] = useState<Counts>({ recommended: null, all: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  // 피드백을 보낸 정책: 맞춤 추천에서는 카드 대신 고마움 문장만 남긴다
  const [sent, setSent] = useState<Record<number, FeedbackResult>>({});
  const [helping, setHelping] = useState<Policy | null>(null);
  const [checkinOffBusy, setCheckinOffBusy] = useState(false);
  const [savedPolicies, setSavedPolicies] = useState(() => ({
    example: readSavedPolicies('example'), api: readSavedPolicies('api'),
  }));
  const [saveMessage, setSaveMessage] = useState('');

  function toggleSavedPolicy(policyId: number, policy?: Policy) {
    const current = readSavedPolicies(mode);
    const wasSaved = current.ids.includes(policyId);
    const next: SavedPolicies = wasSaved
      ? { ids: current.ids.filter(id => id !== policyId), items: current.items.filter(item => item.policyId !== policyId) }
      : { ids: [...current.ids, policyId], items: policy ? [...current.items, policy] : current.items };
    try {
      localStorage.setItem(savedPolicyKey(mode), JSON.stringify(next));
      setSavedPolicies({ ...savedPolicies, [mode]: next });
      setSaveMessage(wasSaved ? '찜을 해제했어요.' : '이 브라우저에 정책을 찜했어요.');
    } catch {
      setSaveMessage('찜 상태를 저장하지 못했어요. 다시 시도해 주세요.');
    }
  }

  const feed = view === 'saved' ? 'all' : view;
  useEffect(() => {
    let active = true;
    async function load() {
      // 추천 기준을 바꾸고 돌아왔으면 기억해 둔 두 보기를 모두 버리고 새로 불러옴 (서버도 오늘 추천을 지웠음)
      const version = policyCriteriaVersion();
      const stale = version !== loaded.version;
      if (stale) {
        setLoaded({ mode, version, byView: {} });
        setServerCounts({ recommended: null, all: null });
        setFilters(emptyFilters);
        setVisibleCount(pageSize);
        if (view !== 'recommended') { setView('recommended'); return; }
      }
      const byView = !stale && loaded.mode === mode ? loaded.byView : {};
      if (byView[feed]) { setLoading(false); setError(''); return; } // 이미 불러온 보기
      setLoading(true); setError(''); onClearError();
      try {
        const data = mode === 'example' ? await examplePolicies(feed) : await request<Result>(`policies${feed === 'all' ? '?view=all' : ''}`);
        if (!active) return;
        setLoaded(prev => ({ mode, version, byView: { ...(prev.mode === mode && prev.version === version ? prev.byView : {}), [feed]: data } }));
        if (data.counts) setServerCounts(data.counts);
      } catch (error) {
        if (active) { setError(error instanceof Error ? error.message : '정책을 불러오지 못했어요.'); onError(error); }
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
    // onError reports into the parent; changes to the parent must not reload recommendations.
    // `loaded` is read only to skip views that are already loaded; a new result must not trigger another load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, view, feed, retry]);

  const byView = loaded.mode === mode ? loaded.byView : {};
  const result = byView[feed] ?? null;
  const visible = (r: Result | undefined, v: Feed) => (r?.items ?? []).filter(p => v === 'all' || !sent[p.policyId] || sent[p.policyId].help);
  const saved = savedPolicies[mode];
  const savedItems = new Map([...saved.items, ...(byView.recommended?.items ?? []), ...(byView.all?.items ?? [])].map(item => [item.policyId, item]));
  const favorites = view === 'saved';
  const items = favorites ? saved.ids.flatMap(id => savedItems.get(id) ?? []) : visible(result ?? undefined, feed);
  const unavailable = favorites && !loading ? saved.ids.filter(id => !savedItems.has(id)) : [];
  const sentNotes = view === 'recommended' ? Object.entries(sent).filter(([, r]) => !r.help) : [];
  const all = view === 'all';
  // 버튼 옆 개수: 불러온 보기는 화면에 보이는 수, 아직 안 연 보기는 서버 counts (맞춤 추천을 아직 안 만들었으면 null → 숫자 없음)
  const count: Record<View, number | null> = {
    recommended: byView.recommended ? visible(byView.recommended, 'recommended').length : serverCounts.recommended,
    all: byView.all ? byView.all.items.length : serverCounts.all,
    saved: saved.ids.length,
  };
  const scopes = [...new Set(items.map(policy => policy.scope).filter(Boolean))];
  const methods = [...new Set(items.map(policy => policy.burdenLabel).filter(Boolean))];
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = all ? items.filter(policy =>
    (!filters.scope || policy.scope === filters.scope) &&
    (!filters.method || policy.burdenLabel === filters.method) &&
    (!query || [policy.title, policy.summary, ...policy.tags].join(' ').toLocaleLowerCase().includes(query))
  ) : items;

  function updateFilters(next: typeof emptyFilters) {
    setFilters(next);
    setVisibleCount(pageSize);
  }

  // 보기를 바꾸면 필터를 비우고 맨 위로
  function selectView(next: View) {
    if (next === view) return;
    setView(next);
    updateFilters(emptyFilters);
    window.scrollTo(0, 0);
  }

  function retryView() {
    setLoaded(prev => {
      const next = { ...prev.byView };
      delete next[feed];
      return { ...prev, byView: next };
    });
    setRetry(value => value + 1);
  }
  // "오늘은 참고하지 않기": 오늘 체크인의 필요한 것을 비우고 맞춤 추천을 다시 만든다 (내일 체크인부터는 다시 참고)
  async function stopCheckinHint() {
    setCheckinOffBusy(true);
    try {
      await request('policies/checkin-needs', 'DELETE');
      retryView();
    } catch (error) { onError(error); }
    finally { setCheckinOffBusy(false); }
  }
  return <>
    {/* 머리줄은 스크롤해도 위에 붙어 있음 (FE_QA: 쭉 내리면 뒤로 가기가 사라짐). 보기 전환은 배경 위 버튼으로 함께 스크롤 */}
    <div className="policy-screen-header">
      <ScreenBar title={favorites ? '찜한 정책' : all ? '모든 정책' : '정책 추천'}
        {...(view !== 'recommended' ? { onBack: () => selectView('recommended'), backLabel: '맞춤 추천으로' } : {})} />
    </div>
    <div className="policy-view-switch" role="group" aria-label="정책 보기">
        {VIEWS.map(v => <button key={v.value} type="button" className="secondary" aria-pressed={view === v.value}
          onClick={() => selectView(v.value)}>
          {v.label}
          {count[v.value] !== null && <span className="policy-view-count">{count[v.value]}</span>}
        </button>)}
    </div>
    <nav className="policy-quick-links" aria-label="정책과 센터 바로가기">
      <Link className="secondary" href="/policies/criteria">추천 기준 바꾸기</Link>
      <Link className="secondary" href="/centers">청년센터 살펴보기</Link>
    </nav>
    {!favorites && <Hero
      visual={<HeroIcon>✦</HeroIcon>}
      title={all ? '지금 신청할 수 있는 정책' : '내 속도에 맞는 지원'}
      message={all ? '단계와 관계없이 모두 살펴볼 수 있어요.' : '부담 없이 확인해 볼 만한 지원을 골랐어요. 천천히 살펴보세요.'}
      chip={result ? [result.basis.region, result.basis.updatedAt && `${result.basis.updatedAt} 기준`, result.usedFallback && '기본 추천'].filter(Boolean).join(' · ') : undefined}
    />}
    {favorites && saved.ids.length === 0 && <p className="card">찜한 정책이 없어요. 정책 카드의 별(☆)을 누르면 여기에 담겨요.</p>}
    {unavailable.map(id => <section className="card" key={id}>
      <p>지금 상세 정보를 불러올 수 없는 찜한 정책이에요.</p>
      <button type="button" className="secondary" onClick={() => toggleSavedPolicy(id)}>이 정책 찜 해제</button>
    </section>)}
    {view === 'recommended' && mode === 'api' && (result?.checkinNeeds?.length ?? 0) > 0 && <section className="policy-checkin-hint" aria-live="polite">
      <p><span aria-hidden="true">✦</span> 오늘 체크인을 참고했어요 · {result!.checkinNeeds!.map(n => n.label).join(' · ')}</p>
      <button type="button" onClick={() => void stopCheckinHint()} disabled={checkinOffBusy}>{checkinOffBusy ? '바꾸는 중…' : '오늘은 참고하지 않기'}</button>
    </section>}
    {mode === 'example' && <p className="small">가상 정책으로 화면을 체험하고 있어요.</p>}
    {items.some(p => p.evidence?.length) && <p className="small policy-legend">
      <span className="yes">원문에 있음</span> 공고에 적혀 있음 · <span className="unknown">확인 필요</span> 공고에서 못 찾음
    </p>}
    {loading && <p role="status">정책을 불러오고 있어요…</p>}
    {error && <section className="card"><p>잠시 후 다시 불러와 주세요.</p><button onClick={retryView}>다시 불러오기</button></section>}
    {!favorites && result && items.length === 0 && <section className="card"><h2>지금 보여드릴 정책이 없어요</h2><p>다른 정책을 살펴보거나 내 정보를 확인해 주세요.</p></section>}
    {all && result && items.length > 0 && <section className="card policy-filters" aria-label="정책 필터">
      <label>정책 검색<input type="search" placeholder="예: 월세, 일자리" value={filters.query} onChange={event => updateFilters({ ...filters, query: event.target.value })} /></label>
      <div className="choices">
        <GlassSelect label="지원 지역" value={filters.scope} onChange={scope => updateFilters({ ...filters, scope })}
          options={[{ value: '', label: '전체 지역' }, ...scopes.map(scope => ({ value: scope, label: scope }))]} />
        <GlassSelect label="신청 방식" value={filters.method} onChange={method => updateFilters({ ...filters, method })}
          options={[{ value: '', label: '전체 방식' }, ...methods.map(method => ({ value: method, label: method }))]} />
      </div>
      <div className="policy-filter-status">
        <span role="status">{filtered.length}개 정책</span>
        {(query || filters.scope || filters.method) && <button className="text-button" onClick={() => updateFilters(emptyFilters)}>필터 초기화</button>}
      </div>
      {filtered.length === 0 && <p>조건에 맞는 정책이 없어요.</p>}
    </section>}
    <span className="sr-only" role="status">{saveMessage}</span>
    {(all ? filtered.slice(0, visibleCount) : filtered).map(policy => {
      const isSaved = saved.ids.includes(policy.policyId);
      return <article className="card" key={`${view}-${policy.policyId}`} /* 보기마다 새로 그려 떠오르는 효과(screen-rise)가 탭을 바꿀 때도 보이게 */>
      <div className="policy-card-heading">
        <div>
          <div className="card-tags">
            {[policy.scope, policy.burdenLabel].filter(Boolean).map(t => <span key={t}>{t}</span>)}
            {policy.deadline && <span className="gold">{policy.deadline}</span>}
          </div>
          <h2>{policy.title}</h2>
        </div>
        <button type="button" className="policy-save" aria-pressed={isSaved}
          aria-label={`${policy.title} 찜`} onClick={() => toggleSavedPolicy(policy.policyId, policy)}>
          {/* 찜은 별 (하트는 위쪽 "도움받을 곳" 아이콘이라 겹치지 않게). 찜하면 금빛으로 채움 */}
          <svg className="policy-save-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.6 6 6.4.6-4.9 4.2 1.5 6.3L12 16.6l-5.6 3.3 1.5-6.3L3 9.4l6.4-.6z" /></svg>
        </button>
      </div>
      <p>{policy.summary}</p>
      {favorites && result && !result.items.some(active => active.policyId === policy.policyId) &&
        <p className="small">찜할 때 저장한 정보예요. 신청 가능 여부는 원문에서 확인해 주세요.</p>}
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
      <div className="policy-support-actions">
        <button type="button" className="secondary" onClick={() => setHelping(policy)}>신청 도와줘</button>
        {policy.needsInquiry && <Link className="secondary" href="/centers">청년센터에서 문의 준비하기</Link>}
      </div>
      {sent[policy.policyId]
        ? <SentNote result={sent[policy.policyId]} />
        : <NotForMe policyId={policy.policyId} mode={mode} onSent={r => setSent(prev => ({ ...prev, [policy.policyId]: r }))} />}
    </article>;
    })}
    {all && visibleCount < filtered.length && <button className="secondary" onClick={() => setVisibleCount(count => count + pageSize)}>정책 더 보기</button>}
    {sentNotes.length > 0 && <section className="card" aria-live="polite">
      {sentNotes.map(([id, r]) => <p key={id} className="small">{r.message}</p>)}
    </section>}
    {helping && <ApplyHelper policyId={helping.policyId} title={helping.title} mode={mode} examplePolicy={{ ...exampleHelperPolicy, title: helping.title }} onClose={() => setHelping(null)} />}
  </>;
}

function SentNote({ result }: { result: FeedbackResult }) {
  return <div className="policy-feedback" role="status">
    <p>{result.message}</p>
    {result.help && <div className="help"><h3>{result.help.title}</h3><HelpLines lines={result.help.lines} /></div>}
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
  // 다른 화면으로 갔다 돌아오면 이유 고르기는 접혀 있게 (고른 이유·한 줄은 남김) (cacheComponents로 숨겨진 화면도 상태가 남음, use-collapse-on-hide.ts 참고)
  useLayoutEffect(() => () => { setOpen(false); setError(''); }, []);

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

  if (!open) return <button type="button" className="policy-not-for-me" onClick={() => setOpen(true)}>
    나랑 안 맞아요
    {mode === 'api' && <small>이유를 알려 주면 다시 추천하지 않아요</small>}
  </button>;
  return <fieldset className="policy-feedback">
    <legend>어떤 점이 안 맞나요?</legend>
    {reasons.map(r => <label key={r.value}>
      <input type="radio" name={`reason-${policyId}`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} /> {r.label}
    </label>)}
    <label className="small">한 줄 더 알려 주기 (선택)
      <input type="text" maxLength={200} value={text} onChange={e => setText(e.target.value)} placeholder="예: 저는 서울에 살아요" />
    </label>
    {error && <p role="alert">{error}</p>}
    {help && <div className="help"><h3>{help.title}</h3><HelpLines lines={help.lines} /></div>}
    <div className="policy-feedback-actions">
      <button type="button" className="secondary" onClick={() => { setOpen(false); setReason(null); setText(''); setError(''); }}>그만두기</button>
      <button type="button" onClick={() => void send()} disabled={!reason || busy}>{busy ? '보내는 중…' : '알려 주기'}</button>
    </div>
  </fieldset>;
}
