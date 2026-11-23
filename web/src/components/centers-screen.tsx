"use client";

// 청년센터 목록·상세. 공통 틀은 screen-kit.tsx
// - 목록: 대표 영역(핵심 메시지 + 기준 지역) → 센터 카드
// - 상세: 대표 영역(센터 이름·주소) → 센터 정보 · 프로그램 · 문의 문장 준비 · 앞까지 가 보기 카드
// - 저장한 초안은 센터 소개 바로 아래에서 다시 불러올 수 있음
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, request, type Help, type Mode } from '@/lib/mobile-data';
import { cachedCenters, loadCenters, type CenterSummary } from '@/lib/centers-list';
import { Hero, HeroIcon, MoreLinks, ScreenBar, Section } from './screen-kit';
import SkyControlIcon from './sky-control-icon';
import type { Center } from '@/app/api/_lib/centers-data';

type CenterInfo = Omit<Center, 'id'> & { centerId: number };
type Draft = { draftId: number; draft: string; help?: Help; usedFallback?: boolean };

export default function CentersScreen({ mode, centerId, onError, onHelp, onClearError }: {
  mode: Mode; centerId?: number; onError: (error: unknown) => void; onHelp: (help: Help) => void; onClearError: () => void;
}) {
  // 어디서 들어왔는지(?from=policies): 정책 화면 → 목록의 뒤로 가기는 정책 화면으로, 그 밖(기본) → 내 밤하늘로
  // 페이지가 서버에서 읽지 않고 여기서 읽음 → 페이지를 미리 만들어 둘 수 있어 누르자마자 넘어감 (app/centers/page.tsx)
  const from = useSearchParams().get('from') === 'policies' ? 'policies' : 'sky';
  // 목록을 이미 받아 뒀으면(정책 화면에서 미리 불러 둠·다시 연 화면) 대기 문구 없이 바로 그림
  const [centers, setCenters] = useState<CenterSummary[]>(() => cachedCenters() ?? []);
  const [center, setCenter] = useState<CenterInfo | null>(null);
  const [loading, setLoading] = useState(() => centerId !== undefined || !cachedCenters());
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [question, setQuestion] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
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
      setLoadError('');
      try {
        if (centerId !== undefined) {
          setLoading(true); setCenter(null);
          const data = await request<{ center: CenterInfo }>(`centers/${centerId}`);
          if (active) setCenter(data.center);
        } else {
          const cached = cachedCenters();
          if (!cached) setLoading(true);
          const list = cached ?? await loadCenters();
          if (active) setCenters(list);
        }
      } catch {
        if (active) setLoadError('센터 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
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
    <ScreenBar title="청년센터" {...(from === 'policies' ? { back: '/policies', backLabel: '정책 추천으로 돌아가기' } : {})} />
    <Hero visual={<HeroIcon tone="lavender">⌖</HeroIcon>} title="사람 곁으로, 천천히" message="들어가지 않아도 괜찮아요. 어떤 곳인지 먼저 살펴봐요." chip="서울 마포구 기준" />
    {failed}
    {/* 불러오는 동안에도 제목은 그 자리에 두어 목록이 들어올 때 화면이 덜 밀리게 */}
    {!loadError && <Section id="center-list" title="우리 동네 청년센터">
      {loadingNote}
      {!loading && centers.length === 0 && <p>현재 표시할 센터가 없어요.</p>}
      {!loading && centers.map(item => <section className="card" key={item.centerId}>
        {item.isSample && <div className="card-tags"><span>가상 센터 · 실제 운영 정보 아님</span></div>}
        <h3>{item.name}</h3>
        <p>{item.address}</p>
        <Link className="secondary" href={`/centers/${item.centerId}${from === 'policies' ? '?from=policies' : ''}`}>센터 자세히 보기</Link>
      </section>)}
    </Section>}
    <MoreLinks><Link href="/policies">나에게 맞는 정책 보기</Link></MoreLinks>
  </>;

  // 상세
  return <>
    <ScreenBar title={center?.name ?? '청년센터'} back={from === 'policies' ? '/centers?from=policies' : '/centers'} backLabel="청년센터 목록으로" />
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
        {center.phone && <CenterPhone name={center.name} phone={center.phone}
          onPrepare={() => inquiry.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })} />}
        {center.source && <p className="small">출처: <a href={center.source.url} target="_blank" rel="noopener noreferrer">{center.source.name}</a> · {center.source.basisDate} 기준</p>}
      </section>
      {center.programs.length > 0 && <Section id="center-programs" title="프로그램">
        {center.programs.map(program => <section className="card" key={program.title}><h3>{program.title}</h3><p>{program.summary}</p></section>)}
      </Section>}
      <section className="card" ref={inquiry}>
        <h2>문의 문장 준비하기</h2><p>궁금한 점을 적으면 초안을 함께 준비해요. 앱에서 실제로 전송하지 않아요.</p>
        <label>궁금한 점<textarea disabled={busy} maxLength={300} value={question} onChange={event => setQuestion(event.target.value)} placeholder="예약 없이 잠깐 둘러봐도 괜찮을까요?" /></label>
        <button disabled={busy || !question.trim()} onClick={() => run(createDraft)}>{busy ? '준비 중…' : '문의 초안 준비하기'}</button>
        {draft !== null && <>
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

/** 센터 전화: 누르면 바로 걸지 않고 확인 창을 한 번 띄움.
 *  전화를 부담스러워하는 사용자를 생각한 앱이라 실수로 걸리지 않게 하고, 문의 문장을 먼저 준비하는 길도 같이 보여 줌.
 *  (109·1577-0199 같은 상담 번호도 같은 확인 창을 띄움 — help-lines.tsx, 고민기록 #61) */
function CenterPhone({ name, phone, onPrepare }: { name: string; phone: string; onPrepare: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const tel = phone.replace(/[^\d+]/g, '');
  const close = () => dialog.current?.close();
  return <>
    <p className="center-phone">전화
      <button type="button" className="secondary center-phone-button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <SkyControlIcon name="phone" />{phone}
      </button>
    </p>
    <dialog ref={dialog} className="screen-help-dialog center-call-dialog" aria-labelledby={titleId}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <h2 id={titleId}>{name}에 전화할까요?</h2>
      <p className="center-call-number"><SkyControlIcon name="phone" />{phone}</p>
      <p className="small">통화가 부담되면 할 말을 먼저 적어 볼 수 있어요. 전화하지 않아도 괜찮아요.</p>
      <a className="primary center-call-go" href={`tel:${tel}`} onClick={close}>전화 걸기</a>
      <button type="button" className="secondary" onClick={() => { close(); onPrepare(); }}>문의 문장 먼저 준비하기</button>
      <button type="button" className="text-button center-call-cancel" onClick={close}>닫기</button>
    </dialog>
  </>;
}
