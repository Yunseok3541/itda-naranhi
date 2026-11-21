"use client";

// 청년센터 목록·상세. 공통 틀은 screen-kit.tsx
// - 목록: 대표 영역(핵심 메시지 + 기준 지역) → 센터 카드
// - 상세: 대표 영역(센터 이름·주소) → 센터 정보 · 프로그램 · 문의 문장 준비 · 앞까지 가 보기 카드
// - 저장한 초안은 센터 소개 바로 아래에서 다시 불러올 수 있음
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, request, type Help, type Mode } from '@/lib/mobile-data';
import { Hero, HeroIcon, MoreLinks, ScreenBar, Section } from './screen-kit';
import type { Center } from '@/app/api/_lib/centers-data';

type CenterInfo = Omit<Center, 'id'> & { centerId: number };
type CenterSummary = Pick<CenterInfo, 'centerId' | 'name' | 'address' | 'isSample'>;
type Draft = { draftId: number; draft: string; help?: Help; usedFallback?: boolean };

export default function CentersScreen({ mode, centerId, onError, onHelp, onClearError }: {
  mode: Mode; centerId?: number; onError: (error: unknown) => void; onHelp: (help: Help) => void; onClearError: () => void;
}) {
  const [centers, setCenters] = useState<CenterSummary[]>([]);
  const [center, setCenter] = useState<CenterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; focusDraft?: boolean } | null>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const inquiry = useRef<HTMLElement>(null);

  useEffect(() => {
    const input = draftInput.current;
    if (busy || !message?.focusDraft || !input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'center' });
  }, [busy, message]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setLoadError(''); setCenter(null);
      try {
        if (centerId !== undefined) {
          const data = await request<{ center: CenterInfo }>(`centers/${centerId}`);
          if (active) setCenter(data.center);
        } else {
          const data = await request<{ centers: CenterSummary[] }>('centers?region=11440');
          if (active) setCenters(data.centers);
        }
      } catch (error) { if (active) setLoadError(error instanceof Error ? error.message : '센터 정보를 불러오지 못했어요.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [centerId, retry]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage(null); onClearError();
    try { await action(); } catch (error) { onError(error); } finally { setBusy(false); }
  }

  async function createDraft() {
    if (!center) return;
    setDraftId(null);
    if (mode === 'example') {
      setDraft(`안녕하세요. ${center.name}에 처음 문의드려요. ${question.trim()} 알려주시면 감사하겠습니다.`);
      setMessage({ text: '예시 문장을 준비했어요. 보내기 전에 내용을 고쳐 주세요.', focusDraft: true });
      return;
    }
    const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centerId, question }) });
    const data = await response.json() as Draft & { error?: string; code?: string };
    if (data.help) onHelp(data.help);
    if (data.draft) setDraft(data.draft);
    if (!response.ok) throw new ApiError(data.error ?? '초안을 준비하지 못했어요.', response.status, data.code, data.help ?? null);
    setDraftId(data.draftId);
    setMessage({
      text: data.usedFallback ? '기본 문장으로 초안을 준비해 저장했어요.' : '초안을 준비해 저장했어요. 보내기 전에 확인해 주세요.',
      focusDraft: !!data.draft && !data.help,
    });
  }

  async function loadSavedDraft() {
    if (mode === 'example') {
      const saved = localStorage.getItem(`naranhi-example-inquiry-${centerId}`);
      if (!saved) { setMessage({ text: '아직 저장한 초안이 없어요.' }); return; }
      setDraft(saved);
    } else {
      const data = await request<{ drafts: Draft[] }>(`inquiries?centerId=${centerId}`);
      if (!data.drafts.length) { setMessage({ text: '아직 저장한 초안이 없어요.' }); return; }
      setDraft(data.drafts[0].draft); setDraftId(data.drafts[0].draftId);
    }
    setMessage({ text: '저장한 초안을 불러왔어요.', focusDraft: true });
  }

  const failed = loadError && <section className="card"><p role="alert">{loadError}</p><button onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></section>;
  const loadingNote = loading && <p role="status">센터 정보를 불러오고 있어요…</p>;

  // 목록
  if (centerId === undefined) return <>
    <ScreenBar title="청년센터" />
    <Hero visual={<HeroIcon tone="lavender">⌖</HeroIcon>} title="사람 곁으로, 천천히" message="들어가지 않아도 괜찮아요. 어떤 곳인지 먼저 살펴봐요." chip="서울 마포구 기준" />
    {loadingNote}{failed}
    {!loading && !loadError && <Section id="center-list" title="우리 동네 청년센터">
      {centers.length === 0 && <p>현재 표시할 센터가 없어요.</p>}
      {centers.map(item => <section className="card" key={item.centerId}>
        {item.isSample && <div className="card-tags"><span>가상 센터 · 실제 운영 정보 아님</span></div>}
        <h3>{item.name}</h3>
        <p>{item.address}</p>
        <Link className="secondary" href={`/centers/${item.centerId}`}>센터 자세히 보기</Link>
      </section>)}
    </Section>}
    <MoreLinks><Link href="/policies">나에게 맞는 정책 보기</Link></MoreLinks>
  </>;

  // 상세
  return <>
    <ScreenBar title={center?.name ?? '청년센터'} back="/centers" backLabel="청년센터 목록으로" />
    {loadingNote}{failed}
    {center && <>
      <Hero visual={<HeroIcon tone="lavender">⌖</HeroIcon>} title={center.name} message={center.address}
        chip={center.isSample ? '가상 센터 · 실제 장소와 운영 정보가 아니에요' : undefined} />
      <button className="secondary center-saved-draft" type="button" disabled={busy} onClick={() => {
        inquiry.current?.scrollIntoView({ block: 'start' });
        void run(loadSavedDraft);
      }}>저장한 초안 불러오기</button>
      <section className="card">
        <h2>센터 정보</h2>
        <p>운영시간: {center.hours ?? '확인된 정보가 없어요'}</p>
        {center.phone && <p>전화: {center.phone}</p>}
        {center.source && <p className="small">출처: <a href={center.source.url} target="_blank" rel="noopener noreferrer">{center.source.name}</a> · {center.source.basisDate} 기준</p>}
      </section>
      {center.programs.length > 0 && <Section id="center-programs" title="프로그램">
        {center.programs.map(program => <section className="card" key={program.title}><h3>{program.title}</h3><p>{program.summary}</p></section>)}
      </Section>}
      <section className="card" ref={inquiry}>
        <h2>문의 문장 준비하기</h2><p>궁금한 점을 적으면 초안을 함께 준비해요. 앱에서 실제로 전송하지 않아요.</p>
        <label>궁금한 점<textarea disabled={busy} maxLength={300} value={question} onChange={event => setQuestion(event.target.value)} placeholder="예약 없이 잠깐 둘러봐도 괜찮을까요?" /></label>
        <button disabled={busy || !question.trim()} onClick={() => run(createDraft)}>{busy ? '준비 중…' : '문의 초안 준비하기'}</button>
        {draft && <>
          <label>보내기 전에 확인할 초안<textarea ref={draftInput} disabled={busy} maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} /></label>
          <button disabled={busy || !draft.trim()} onClick={() => run(async () => {
            if (mode === 'example') localStorage.setItem(`naranhi-example-inquiry-${centerId}`, draft);
            else if (draftId !== null) await request(`inquiries/${draftId}`, 'PATCH', { draft });
            else throw new Error('초안을 먼저 다시 준비해 주세요.');
            setMessage({ text: mode === 'example' ? '초안을 이 브라우저에 저장했어요. 실제로 전송하지 않았어요.' : '수정한 초안을 저장했어요. 실제로 전송하지 않았어요.' });
          })}>초안만 저장하기</button>
        </>}
        {message && <p role="status">{message.text}</p>}
      </section>
      {center.isSample && <section className="card"><h2>앞까지 가 보기</h2><p>가상 장소의 시연이에요. 직접 기록으로 남길 수 있어요.</p><Link className="secondary" href="/stars/17">앞까지 가 본 별 기록하기</Link></section>}
      <MoreLinks>
        {center.url && /^https?:\/\//i.test(center.url) && <a href={center.url} target="_blank" rel="noopener noreferrer">센터 홈페이지</a>}
        <Link href="/policies">나에게 맞는 정책 보기</Link>
      </MoreLinks>
    </>}
  </>;
}
