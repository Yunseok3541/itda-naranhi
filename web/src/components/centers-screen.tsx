"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, request, type Help, type Mode } from '@/lib/mobile-data';
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
  const [message, setMessage] = useState('');

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
    setBusy(true); setMessage(''); onClearError();
    try { await action(); } catch (error) { onError(error); } finally { setBusy(false); }
  }

  async function createDraft() {
    if (!center) return;
    setDraftId(null);
    if (mode === 'example') {
      setDraft(`안녕하세요. ${center.name}에 처음 문의드려요. ${question.trim()} 알려주시면 감사하겠습니다.`);
      setDraftId(null); setMessage('예시 문장을 준비했어요. 보내기 전에 내용을 고쳐 주세요.');
      return;
    }
    const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centerId, question }) });
    const data = await response.json() as Draft & { error?: string; code?: string };
    if (data.help) onHelp(data.help);
    if (data.draft) setDraft(data.draft);
    if (!response.ok) throw new ApiError(data.error ?? '초안을 준비하지 못했어요.', response.status, data.code, data.help ?? null);
    setDraftId(data.draftId);
    setMessage(data.usedFallback ? '기본 문장으로 초안을 준비해 저장했어요.' : '초안을 준비해 저장했어요. 보내기 전에 확인해 주세요.');
  }

  return <>
    {centerId !== undefined && <Link className="text-button" href="/centers">청년센터 목록</Link>}
    <h1>{center?.name ?? (centerId === undefined ? '사람 곁으로, 천천히' : '청년센터 상세')}</h1>
    {loading && <p role="status">센터 정보를 불러오고 있어요…</p>}
    {loadError && <section className="card"><p role="alert">{loadError}</p><button onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></section>}
    {!loading && !loadError && centerId === undefined && <>
      <h2>우리 동네 청년센터</h2>
      {centers.length === 0 && <p>현재 표시할 센터가 없어요.</p>}
      {centers.map(item => <section className="card" key={item.centerId}>
        <h3>{item.name}</h3>{item.isSample && <p className="small">가상 센터 · 실제 운영 정보가 아니에요.</p>}
        <p>{item.address}</p><Link className="secondary" href={`/centers/${item.centerId}`}>센터 상세 보기</Link>
      </section>)}
    </>}
    {center && <>
      <section className="card">
        {center.isSample && <p className="small">가상 센터 · 실제 장소와 운영 정보가 아니에요.</p>}
        <p>{center.address}</p><p>운영시간: {center.hours ?? '확인된 정보가 없어요'}</p>
        {center.phone && <p>전화: {center.phone}</p>}
        {center.url && /^https?:\/\//i.test(center.url) && <a className="secondary" href={center.url} target="_blank" rel="noopener noreferrer">센터 홈페이지</a>}
        {center.programs.map(program => <div key={program.title}><h3>{program.title}</h3><p>{program.summary}</p></div>)}
        {center.source && <p className="small">출처: <a href={center.source.url} target="_blank" rel="noopener noreferrer">{center.source.name}</a> · {center.source.basisDate} 기준</p>}
      </section>
      <section className="card">
        <h2>문의 문장 준비하기</h2><p>궁금한 점을 적으면 초안을 함께 준비해요. 앱에서 실제로 전송하지 않아요.</p>
        <label>궁금한 점<textarea disabled={busy} maxLength={300} value={question} onChange={event => setQuestion(event.target.value)} placeholder="예약 없이 잠깐 둘러봐도 괜찮을까요?" /></label>
        <button disabled={busy || !question.trim()} onClick={() => run(createDraft)}>{busy ? '준비 중…' : '문의 초안 준비하기'}</button>
        {draft && <>
          <label>보내기 전에 확인할 초안<textarea disabled={busy} maxLength={1000} value={draft} onChange={event => setDraft(event.target.value)} /></label>
          <button disabled={busy || !draft.trim()} onClick={() => run(async () => {
            if (mode === 'example') localStorage.setItem(`naranhi-example-inquiry-${centerId}`, draft);
            else if (draftId !== null) await request(`inquiries/${draftId}`, 'PATCH', { draft });
            else throw new Error('초안을 먼저 다시 준비해 주세요.');
            setMessage(mode === 'example' ? '초안을 이 브라우저에 저장했어요. 실제로 전송하지 않았어요.' : '수정한 초안을 저장했어요. 실제로 전송하지 않았어요.');
          })}>초안만 저장하기</button>
        </>}
        <button className="secondary" disabled={busy} onClick={() => run(async () => {
          if (mode === 'example') {
            const saved = localStorage.getItem(`naranhi-example-inquiry-${centerId}`);
            if (!saved) { setMessage('아직 저장한 초안이 없어요.'); return; }
            setDraft(saved);
          } else {
            const data = await request<{ drafts: Draft[] }>(`inquiries?centerId=${centerId}`);
            if (!data.drafts.length) { setMessage('아직 저장한 초안이 없어요.'); return; }
            setDraft(data.drafts[0].draft); setDraftId(data.drafts[0].draftId);
          }
          setMessage('저장한 초안을 불러왔어요.');
        })}>저장한 초안 불러오기</button>
        {message && <p role="status">{message}</p>}
      </section>
      {center.isSample && <section className="card"><h2>앞까지 가 보기</h2><p>가상 장소의 시연이에요. 직접 기록으로 남길 수 있어요.</p><Link className="secondary" href="/stars/17">앞까지 가 본 별 기록하기</Link></section>}
    </>}
  </>;
}
