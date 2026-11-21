"use client";
// 마음 짚기 (선택, 4주마다): 소개 → 한 화면에 질문 하나씩 14개 → 다 짚었어요(저장) → 결과
// 문항·점수·비교 문장: lib/mind-check.ts. 기획: docs/기획/아이디어_v4.md 3장 "마음 짚기", 고민기록 #56·#57
// 화면 원칙 (docs/기능발견성-조사.md)
// - 질문은 하나씩, 답을 누르면 바로 다음으로 (F-② 순서대로, E 누르면 바로 반응). 처음에 "답을 고르면 넘어가요"를 먼저 알림
// - 묶음마다 다른 그림 말: 외로움 = 빈도 점, 곁에 있는 사람 = 별 무리, 지난 2주 마음 = 달 모양 (같은 일을 하는 단추는 같은 모양, 그림만 다름)
// - 순서는 숫자 대신 별 3개가 하나씩 켜짐 (screen-kit StarProgress, 처음 시작 안내의 점과 같은 자리·크기)
// - 넘기기·이전은 아래쪽 (C 엄지 영역), 끝나면 "다 짚었어요 + 저장하고 결과 보기" (F-② 완료 + 구체적인 단추)
// - 결과는 점수 숫자 없이 묶음마다 뜻이 있는 문장 (F-③). WHO-5가 낮은 편이면 상담받을 곳 안내 (진단이 아님)
import Link from 'next/link';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import { emptyAnswers, isMindCheckDue, itemCount, mindDay, SCALES, scoreMind, type MindAnswers, type MindResult, type Scale } from '@/lib/mind-check';
import { HELP_MESSAGE } from '@/lib/safety';
import { FrequencyDots, MindScopeArt, MoonPhase, ScaleGlyph, StarCluster } from './mind-check-art';
import { HelpContext, Hero, ScreenBar, StarProgress } from './screen-kit';
import HelpLines from './help-lines';
import SkyControlIcon from './sky-control-icon';
import './mind-check.css';

const NOT_DIAGNOSIS = '의료적인 진단이 아니에요. 지금의 상태를 가볍게 기록하는 용도예요.';
const STEPS = SCALES.map(s => s.step);
/** 답을 누른 뒤 다음 질문으로 넘어가기까지 (고른 답이 켜지는 걸 볼 시간) */
const ADVANCE_MS = 280;

type Question = { scale: Scale; scaleIndex: number; index: number; group?: string; item: string };
const QUESTIONS: Question[] = SCALES.flatMap((scale, scaleIndex) =>
  scale.groups.flatMap((group, g) => group.items.map((item, k) => ({
    scale, scaleIndex, group: group.title, item,
    index: scale.groups.slice(0, g).reduce((n, x) => n + x.items.length, 0) + k,
  }))));

const day = mindDay;

/** 결과 칸: 묶음마다 그림 + 이름 + 뜻 (처음이면 기록했는지, 두 번째부터 지난번과 달라진 점) */
function ResultTiles({ result }: { result: MindResult }) {
  return <ul className="mind-tiles">
    {SCALES.map(s => {
      const change = result.changes?.find(c => c.scale === s.id);
      const text = result.changes === null
        ? (result.scores[s.id] !== null ? '이번 마음을 기록했어요.' : '이번엔 넘겼어요.')
        : change?.text ?? '이번이나 지난번에 다 답하지 않아 비교하지 않았어요.';
      const mark = change ? (change.trend === 'better' ? '✦' : change.trend === 'worse' ? '☁' : '·') : '';
      return <li key={s.id} data-trend={change?.trend} data-empty={result.scores[s.id] === null || undefined}>
        <span className="mind-tile-glyph"><ScaleGlyph scale={s.id} /></span>
        <span className="mind-tile-text"><strong>{s.step}</strong><span>{text}</span></span>
        <span className="mind-tile-mark" aria-hidden="true">{mark}</span>
      </li>;
    })}
  </ul>;
}

function Choices({ question, value, disabled, onPick, labelledBy }: {
  question: Question; value: number | null; disabled: boolean; onPick: (v: number) => void; labelledBy: string;
}) {
  const id = question.scale.id;
  return <div className={`mind-choices mind-choices-${id}`} role="group" aria-labelledby={labelledBy}>
    {question.scale.options.map(([v, label]) => <button key={v} type="button" className="secondary mind-choice"
      aria-pressed={value === v} disabled={disabled} onClick={() => onPick(v)}>
      <span className="mind-choice-glyph">{id === 'ucla' ? <FrequencyDots value={v} /> : id === 'lsns' ? <StarCluster value={v} /> : <MoonPhase value={v} />}</span>
      <span className="mind-choice-label">{label}</span>
      <span className="mind-choice-check" aria-hidden="true">✓</span>
    </button>)}
  </div>;
}

/** from: 어디서 들어왔는지. sky = "오늘의 별" 권유 카드 → 뒤로 가기는 내 밤하늘로, profile(기본) → 프로필로 */
export default function MindCheckScreen({ mode, from = 'profile' }: { mode: Mode; from?: 'sky' | 'profile' }) {
  const help = useContext(HelpContext);
  const [latest, setLatest] = useState<MindResult | null | undefined>(undefined); // undefined = 불러오는 중
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<'intro' | 'ask' | 'result'>('intro');
  /** 질문 번호 (QUESTIONS.length = 다 짚었어요) */
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [answers, setAnswers] = useState<MindAnswers>(emptyAnswers);
  const [advancing, setAdvancing] = useState(false);
  /** "넘긴 질문 답하기"로 들어옴 → 넘긴 질문만 차례로 보고 다시 "다 짚었어요"로 */
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // 다른 화면으로 갔다 돌아오면 소개부터 (cacheComponents로 숨겨진 화면도 상태가 남음, 프로필 화면과 같은 방식)
  // 다시 보일 때 아래 불러오기 효과도 다시 돌아 최근 기록을 새로 읽음
  useLayoutEffect(() => () => { window.clearTimeout(timer.current); setView('intro'); setAdvancing(false); setError(''); }, []);
  useEffect(() => {
    let active = true;
    client(mode).mindCheck().then(r => { if (active) { setLatest(r.latest); setLoadError(''); } })
      .catch(e => { if (active) setLoadError(e instanceof Error ? e.message : '마음 짚기 기록을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [mode, reload]);
  // 질문·화면이 바뀌면 맨 위 제목으로 (화면 읽기 프로그램도 새 질문부터 읽음)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }); }, [view, pos]);

  const scores = scoreMind(answers);
  const canSave = Object.values(scores).some(v => v !== null);
  const answered = (s: Scale) => answers[s.id].filter(v => v !== null).length;

  function go(next: number) {
    setDir(next >= pos ? 'fwd' : 'back');
    setPos(next);
    setError('');
  }
  function answer(question: Question, value: number | null) {
    const next = { ...answers, [question.scale.id]: answers[question.scale.id].map((v, i) => i === question.index ? value : v) };
    setAnswers(next);
    return next;
  }
  /** 다음 질문 번호. 넘긴 질문 답하는 중이면 다음 넘긴 질문, 없으면 다 짚었어요 */
  function nextPos(a: MindAnswers) {
    if (!reviewing) return pos + 1;
    const i = QUESTIONS.findIndex((q, k) => k > pos && a[q.scale.id][q.index] === null);
    return i < 0 ? QUESTIONS.length : i;
  }
  function pick(question: Question, value: number) {
    if (advancing) return;
    const a = answer(question, value);
    setAdvancing(true);
    timer.current = window.setTimeout(() => { setAdvancing(false); go(nextPos(a)); }, ADVANCE_MS);
  }
  function start() {
    setAnswers(emptyAnswers()); setReviewing(false); setDir('fwd'); setPos(0); setError(''); setView('ask');
  }
  async function save() {
    if (busy || !canSave) return;
    setBusy(true); setError('');
    try {
      const r = await client(mode).saveMindCheck(answers);
      setLatest(r.latest);
      setView('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요. 답은 그대로 있어요. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  }

  const bar = <ScreenBar title="마음 짚기" back={from === 'sky' ? '/sky' : '/profile'} backLabel={from === 'sky' ? '내 밤하늘로' : '프로필로 돌아가기'}
    onBack={view === 'ask' ? () => setView('intro') : undefined} />;

  // ── 질문 하나씩 ──
  if (view === 'ask' && pos < QUESTIONS.length) {
    const q = QUESTIONS[pos];
    const lsns = q.scale.id === 'lsns';
    return <div className="mind-check">
      {bar}
      <section className="card mind-question" aria-labelledby="mind-q-title">
        <div className="mind-question-top">
          <StarProgress steps={STEPS} current={q.scaleIndex} label="마음 짚기 순서" />
          <span className="mind-question-topic">{q.scale.step}</span>
        </div>
        <div key={pos} className="mind-question-body step-slide" data-dir={dir}>
          <p className="mind-question-lead">{lsns ? q.group : q.scale.prompt}</p>
          <h2 id="mind-q-title" ref={heading} tabIndex={-1}>{q.item}</h2>
          {lsns && <p className="mind-question-ask">{q.scale.prompt}</p>}
          <Choices question={q} value={answers[q.scale.id][q.index]} disabled={advancing} labelledBy="mind-q-title" onPick={v => pick(q, v)} />
        </div>
      </section>
      {pos === 0 && <p className="small mind-hint">답을 고르면 다음 질문으로 넘어가요.</p>}
      <nav className="mind-nav" aria-label="질문 이동">
        <button type="button" className="text-button" disabled={advancing} onClick={() => pos === 0 ? setView('intro') : go(pos - 1)}>
          <span aria-hidden="true">‹</span> 이전</button>
        <button type="button" className="text-button" disabled={advancing} onClick={() => go(nextPos(answer(q, null)))}>
          넘기기 <span aria-hidden="true">›</span></button>
      </nav>
    </div>;
  }

  // ── 다 짚었어요 (저장 전 확인) ──
  if (view === 'ask') {
    const firstSkipped = QUESTIONS.findIndex(q => answers[q.scale.id][q.index] === null);
    return <div className="mind-check">
      {bar}
      <section className="card mind-finish" aria-labelledby="mind-finish-title">
        <StarProgress steps={STEPS} current={STEPS.length} label="마음 짚기 순서" large />
        <h2 id="mind-finish-title" ref={heading} tabIndex={-1}>다 짚었어요</h2>
        <p>{latest ? '저장하면 지난번과 달라진 점을 보여 드릴게요.' : '저장해 두면 4주 뒤에 달라진 점을 비교할 수 있어요.'}</p>
        <ul className="mind-tiles">
          {SCALES.map(s => {
            const n = answered(s), total = itemCount(s);
            return <li key={s.id} data-empty={n < total || undefined}>
              <span className="mind-tile-glyph"><ScaleGlyph scale={s.id} /></span>
              <span className="mind-tile-text"><strong>{s.step}</strong>
                <span>{n === total ? '모두 답했어요' : n === 0 ? '이번엔 넘겼어요' : `${total - n}문항을 넘겨서 이번엔 비교하지 않아요`}</span></span>
              <span className="mind-tile-mark" aria-hidden="true">{n === total ? '✓' : ''}</span>
            </li>;
          })}
        </ul>
        {!canSave && <p className="small">한 묶음 이상 모두 답해야 저장할 수 있어요.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" disabled={busy || !canSave} onClick={save}>{busy ? '저장 중…' : '저장하고 결과 보기'}</button>
        {firstSkipped >= 0 && <button type="button" className="secondary" disabled={busy} onClick={() => { setReviewing(true); go(firstSkipped); }}>넘긴 질문 답하기</button>}
      </section>
      <nav className="mind-nav" aria-label="질문 이동">
        <button type="button" className="text-button" disabled={busy} onClick={() => go(QUESTIONS.length - 1)}><span aria-hidden="true">‹</span> 이전</button>
      </nav>
    </div>;
  }

  // ── 결과 ──
  if (view === 'result' && latest) {
    const worse = latest.changes?.some(c => c.trend === 'worse');
    return <div className="mind-check">
      {bar}
      <Hero visual={<MindScopeArt size={112} />} title={<span ref={heading} tabIndex={-1}>마음을 짚었어요</span>}
        message="짚어 줘서 고마워요." chip={day(latest.checkedAt)} />
      <section className="card mind-result" aria-labelledby="mind-result-title">
        <h2 id="mind-result-title">{latest.changes === null ? '처음 짚은 마음' : '지난번과 달라진 점'}</h2>
        <ResultTiles result={latest} />
        {latest.changes === null && <p className="small">4주쯤 뒤 다시 짚으면 여기에서 달라진 점을 보여 드려요.</p>}
        {worse && <p className="small">달라지는 건 자연스러운 일이에요. 오늘의 별은 할 수 있는 만큼만 골라도 괜찮아요.</p>}
      </section>
      {latest.lowWellbeing && <section className="card mind-care" aria-labelledby="mind-care-title">
        <h2 id="mind-care-title"><SkyControlIcon name="help" /> 요즘 마음이 많이 지쳐 있을 수 있어요</h2>
        <p>혼자 감당하지 않아도 돼요. 이야기를 나눌 수 있는 곳이 있어요.</p>
        <HelpLines lines={HELP_MESSAGE.lines} />
        {help && <button type="button" className="secondary" onClick={help.toggle} aria-expanded={help.open}>도움받을 곳 열기</button>}
      </section>}
      <p className="mind-next"><span>다음 마음 짚기</span><strong>{day(latest.nextAt)}쯤</strong></p>
      <p className="small mind-note">{NOT_DIAGNOSIS}</p>
      <div className="mind-actions">
        <Link className="primary" href="/sky">내 밤하늘로</Link>
        <Link className="secondary" href="/profile">프로필로</Link>
      </div>
    </div>;
  }

  // ── 소개 ──
  const due = !latest || isMindCheckDue(latest);
  return <div className="mind-check">
    {bar}
    <Hero visual={<MindScopeArt size={132} />} title={<span ref={heading} tabIndex={-1}>마음 짚기</span>}
      message="4주마다 내 마음을 가만히 짚어 보는 시간이에요." />
    {latest && <section className="card mind-last" aria-labelledby="mind-last-title">
      <div className="mind-last-head"><h2 id="mind-last-title">지난 마음 짚기</h2><span className="screen-chip">{day(latest.checkedAt)}</span></div>
      <ResultTiles result={latest} />
      <p className="small">{due ? '4주가 지났어요. 다시 짚어 볼 때예요.' : `다음은 ${day(latest.nextAt)}쯤 권해 드릴게요. 그 전에 다시 해도 괜찮아요.`}</p>
    </section>}
    <section aria-labelledby="mind-topics-title">
      <h2 id="mind-topics-title" className="screen-section">짚어 볼 세 가지</h2>
      <ol className="mind-topics">
        {SCALES.map(s => <li key={s.id}>
          <span className="mind-topic-glyph"><ScaleGlyph scale={s.id} /></span>
          <strong>{s.step}</strong><small>{itemCount(s)}문항</small>
        </li>)}
      </ol>
    </section>
    <ul className="mind-promises" aria-label="알아 두기">
      <li><span aria-hidden="true">◷</span>2~3분</li>
      <li><span aria-hidden="true">✓</span>점수로 나를 판단하지 않아요</li>
      <li><span aria-hidden="true">›</span>어려운 질문은 넘겨도 돼요</li>
    </ul>
    {loadError && <div className="mind-load-error"><p className="error" role="alert">{loadError}</p>
      <button type="button" className="secondary" onClick={() => setReload(n => n + 1)}>다시 불러오기</button></div>}
    {latest === undefined && !loadError && <p role="status">지난 기록을 확인하고 있어요…</p>}
    {latest !== undefined && <button type="button" className="mind-start" onClick={start}>{latest ? '다시 짚어 보기' : '짚어 보기 시작'}</button>}
    <p className="small mind-note">{NOT_DIAGNOSIS} 저장한 기록은 다음 마음 짚기에서 달라진 점을 비교하는 데 쓰여요.</p>
  </div>;
}
