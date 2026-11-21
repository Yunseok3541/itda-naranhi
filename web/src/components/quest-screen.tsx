"use client";
// 퀘스트(오늘의 별): 한 줄 체크인 → 마음 날씨 → 오늘의 별 추천. 공통 틀은 screen-kit.tsx
// - 캐릭터가 건네는 오늘의 질문으로 한 줄 기록을 시작
// - 요약 칸은 넣지 않음 (이 화면은 입력이 중심)
// - 부가 기능: 날씨 직접 바꾸기는 접어 둠
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { client, weatherNames, type Checkin, type Help, type Mode, type Recommendation } from '@/lib/mobile-data';
import { TODAY_RANGE } from '@/lib/profile';
import GlassSelect from './glass-select';
import { Section, Steps } from './screen-kit';
import SkyControlIcon from './sky-control-icon';

const WEATHER_OPTIONS = Object.entries(weatherNames).map(([value, label]) => ({ value, label }));
const GREETINGS = ['오늘 하루는 어땠어요?', '지금 마음은 어떤 날씨예요?', '오늘은 어떤 하루인가요?', '요즘 어떻게 지내요?'];

export default function QuestScreen({ mode, busy, run, onHelp, onError, dialog, onTotalPoints }: {
  mode: Mode;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  onHelp: (help: Help) => void;
  onError: (message: string) => void;
  dialog: { titleId: string; onClose: () => void; feedback: ReactNode };
  onTotalPoints?: (points: number) => void;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('home');
  const [check, setCheck] = useState<Checkin | null>(null);
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [fallback, setFallback] = useState(false);
  const [step, setStep] = useState(0);
  const [greeting] = useState(() => GREETINGS[Math.floor(Date.now() / 86_400_000) % GREETINGS.length]);
  const savedInput = useRef<{ text: string; choice: string } | null>(null);
  const entry = useRef<HTMLElement>(null);
  const weatherHeading = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const weather = check ? weatherNames[check.weather] || check.weather : null;
  const checkinId = check?.checkinId;
  const showEntry = step === 0;
  const hasHelp = !!check?.help;
  useEffect(() => {
    const target = step === 0 && savedInput.current ? entry.current
      : step === 1 && !hasHelp ? weatherHeading.current
      : step === 2 ? results.current : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    const body = target.closest('.quest-dialog-body');
    if (body) body.scrollTop = 0;
    else target.scrollIntoView({ block: 'nearest' });
  }, [step, hasHelp]);

  function saveEntry() {
    const value = text.trim();
    if (checkinId != null && savedInput.current?.text === value && savedInput.current.choice === choice) {
      setStep(1);
      return;
    }
    run(async () => {
      const r = await client(mode).checkin(value, choice);
      setCheck(r);
      onHelp(r.help);
      if (typeof r.totalPoints === 'number') onTotalPoints?.(r.totalPoints);
      if (r.checkinId === null) {
        onError('저장하지 못했어요. 입력은 그대로 있어요. 다시 저장해 주세요.');
        return;
      }
      savedInput.current = { text: value, choice };
      setStep(1);
    });
  }

  function goBack() {
    setStep(current => Math.max(0, current - 1));
  }

  const content = <>
    <Steps label="오늘의 별 찾는 순서" steps={['한 줄 기록', '마음 날씨', '오늘의 별']} current={step} />

    {showEntry && <section ref={entry} className="card quest-entry" tabIndex={-1}>
      <h3 className="quest-greeting">{greeting}</h3>
      <label>마음에 떠오른 한 줄<textarea disabled={busy} maxLength={300} value={text} onChange={e => setText(e.target.value)} placeholder="가상 내용으로 적어 주세요" /></label>
      <fieldset><legend>오늘의 활동 범위</legend>
        <p className="small">지금 고른 범위를 기준으로 오늘의 별을 추천해요.</p>
        <div className="choices quest-range-options">{TODAY_RANGE.map(([v, l]) => <button key={v} type="button" disabled={busy} className="secondary" aria-pressed={choice === v} onClick={() => setChoice(v)}>{l}</button>)}</div>
      </fieldset>
      <button className="quest-action" disabled={busy || !text.trim()} onClick={saveEntry}>{busy ? '저장 중…' : check?.checkinId === null ? '다시 저장하기' : '다음'}</button>
    </section>}

    {check && step !== 2 && (step === 1 || checkinId === null) && <section className="card quest-weather-card">
      <div className="quest-weather-reading">
        <div className="card-tags"><span>{mode === 'example' ? '예시 날씨' : check.usedFallback ? '기본 날씨' : 'AI가 고른 날씨'}</span></div>
        {check.pointsEarned === 100 && <p className="checkin-reward" role="status">+100 포인트</p>}
        <h2 ref={weatherHeading} tabIndex={-1}>마음 날씨 · {weather}</h2>
        <p className="small">오늘의 한 줄을 날씨로 빗대 본 거예요. 진단이 아닌 참고 기록이에요.</p>
      </div>
      {check.checkinId !== null && <>
        <details className="quest-weather-options">
          <summary>날씨 바꾸기</summary>
          <GlassSelect label="내 마음에 가까운 날씨" options={WEATHER_OPTIONS} disabled={busy} value={check.weather}
            onChange={next => {
              if (next === check.weather) return;
              run(async () => {
                await client(mode).weather(check.checkinId!, next);
                setCheck({ ...check, weather: next });
              });
            }} />
        </details>
        <button className="quest-action" disabled={busy} onClick={() => run(async () => {
          const result = await client(mode).recommendations(check.checkinId!);
          setItems(result.items);
          setFallback(result.usedFallback);
          setStep(2);
        })}>오늘의 별 추천받기</button>
      </>}
    </section>}

    {step === 2 && items && <div ref={results} tabIndex={-1}>
      <Section id="quest-stars" title="추천 별">
      <p className="small">{mode === 'example' ? '예시 추천이에요.' : fallback ? '기본 추천이에요.' : 'AI가 만든 추천은 틀릴 수 있어요.'}</p>
      {items.length
        ? items.map(i => <Link className="card recommendation" key={i.starId} href={`/stars/${i.starId}`} onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) dialog.onClose();
          }}>
            <div className="card-tags"><span className="gold">✦ 오늘의 별</span></div>
            <h3>{i.title}</h3><p>{i.reason}</p><strong>이 별 만나기</strong>
          </Link>)
        : <section className="card"><h3>오늘은 쉬어 가도 괜찮아요</h3>
          <button type="button" className="secondary" onClick={dialog.onClose}>내 밤하늘로</button></section>}
    </Section></div>}
  </>;

  return <>
    <header className="quest-dialog-header">
      {step > 0 && <button type="button" className="text-button quest-dialog-back" aria-label="이전 단계" disabled={busy} onClick={goBack}>
        <SkyControlIcon name="back" />
      </button>}
      <h2 id={dialog.titleId}><SkyControlIcon name="star" /> 오늘의 별</h2>
      <button type="button" className="text-button quest-dialog-close" aria-label="오늘의 별 닫기" onClick={dialog.onClose}>
        <SkyControlIcon name="close" />
      </button>
    </header>
    <div className="quest-dialog-body">{dialog.feedback}{content}</div>
  </>;
}
