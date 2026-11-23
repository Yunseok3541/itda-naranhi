"use client";
// 퀘스트(오늘의 별): 한 줄 체크인 → 마음 날씨 → 오늘의 별 추천. 공통 틀은 screen-kit.tsx
// - 캐릭터가 건네는 오늘의 질문으로 한 줄 기록을 시작
// - 요약 칸은 넣지 않음 (이 화면은 입력이 중심)
// - 마음 날씨는 게이지로 바로 옮겨 고침 (weather-gauge.tsx, 접어 두던 "날씨 바꾸기" 대신)
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { client, weatherNames, type Checkin, type Help, type Mode, type Recommendation } from '@/lib/mobile-data';
import { TODAY_RANGE } from '@/lib/profile';
import { Section, Steps } from './screen-kit';
import SkyControlIcon from './sky-control-icon';
import MindCheckOffer from './mind-check-offer';
import { readReturnVisit, recommendationDay, saveReturnVisit } from '@/lib/today-recommendation-return';
import { PendingNextLink } from './next-step-card';
import WeatherGauge from './weather-gauge';

const GREETINGS = ['오늘 하루는 어땠어요?', '지금 마음은 어떤 날씨예요?', '오늘은 어떤 하루인가요?', '요즘 어떻게 지내요?'];

export default function QuestScreen({ restoreRecommendations = false, open, mode, busy, run, onHelp, onError, dialog, onTotalPoints, onSaved }: {
  restoreRecommendations?: boolean;
  open: boolean;
  mode: Mode;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  onHelp: (help: Help) => void;
  onError: (message: string) => void;
  dialog: { titleId: string; onClose: () => void; feedback: ReactNode };
  onTotalPoints?: (points: number) => void;
  onSaved: () => void;
}) {
  const [restored] = useState(() => restoreRecommendations ? readReturnVisit(mode) : null);
  const [text, setText] = useState(restored?.text ?? '');
  const [choice, setChoice] = useState(restored?.choice ?? 'home');
  const [check, setCheck] = useState<Checkin | null>(restored?.check ?? null);
  const [items, setItems] = useState<Recommendation[] | null>(restored?.items ?? null);
  const [fallback, setFallback] = useState(restored?.fallback ?? false);
  const [step, setStep] = useState(restored ? 2 : 0);
  const [greeting] = useState(() => GREETINGS[Math.floor(Date.now() / 86_400_000) % GREETINGS.length]);
  const savedInput = useRef<{ text: string; choice: string } | null>(restored?.check ? { text: restored.text?.trim() ?? '', choice: restored.choice ?? 'home' } : null);
  const entry = useRef<HTMLElement>(null);
  const weatherHeading = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLDivElement>(null);
  // 게이지로 고른, 아직 저장하지 않은 날씨 (null = 저장된 날씨 그대로). 누르고 있는 동안(holding)은 저장하지 않음
  const [picked, setPicked] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const shownWeather = picked ?? check?.weather;
  const weather = shownWeather ? weatherNames[shownWeather] || shownWeather : null;
  const weatherSource = mode === 'example' ? '예시 날씨' : check?.usedFallback ? '기본 날씨' : 'AI가 고른 날씨';
  /** 처음 받은 날씨에서 옮겼는지 (꼬리표 "내가 고른 날씨", 되돌리기) */
  const weatherChanged = !!check?.aiWeather && shownWeather !== check.aiWeather;
  const checkinId = check?.checkinId;
  const showEntry = step === 0;
  const entryHint = useId();
  const hasHelp = !!check?.help || (!check && !!restored?.needsHelp);
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

  // 손을 떼면(또는 방향키가 멈추면) 고른 날씨를 한 번 저장. 실패하면 저장된 날씨로 되돌아감 (오류 문구는 run이 보여 줌)
  // 다른 저장이 진행 중이면 기다렸다가 끝난 뒤 저장
  useEffect(() => {
    const checkinId = check?.checkinId;
    if (picked === null || holding || busy || checkinId == null || picked === check?.weather) return;
    const next = picked;
    run(async () => {
      try {
        await client(mode).weather(checkinId, next);
        setCheck(current => current && { ...current, weather: next });
      } finally {
        setPicked(null);
      }
    });
  }, [picked, holding, busy, check, mode, run]);
  function holdWeather(next: boolean) {
    setHolding(next);
    // 처음 날씨로 돌아와서 손을 떼면 저장할 것이 없음
    if (!next) setPicked(current => current === check?.weather ? null : current);
  }

  function saveEntry() {
    const value = text.trim();
    if (checkinId != null && savedInput.current?.text === value && savedInput.current.choice === choice) {
      setStep(1);
      return;
    }
    run(async () => {
      const r = await client(mode).checkin(value, choice);
      setCheck({ ...r, aiWeather: r.weather });
      setPicked(null);
      onHelp(r.help);
      if (typeof r.totalPoints === 'number') onTotalPoints?.(r.totalPoints);
      if (r.checkinId === null) {
        onError('저장하지 못했어요. 입력은 그대로 있어요. 다시 저장해 주세요.');
        return;
      }
      savedInput.current = { text: value, choice };
      onSaved();
      setStep(1);
    });
  }

  function goBack() {
    setStep(current => current === 2 && check ? 1 : 0);
  }

  const content = <>
    {open && <PendingNextLink mode={mode} inQuest />}
    <Steps label="오늘의 별 찾는 순서" steps={['한 줄 기록', '마음 날씨', '오늘의 별']} current={step} />

    {showEntry && <section ref={entry} className="card quest-entry" tabIndex={-1}>
      <h3 className="quest-greeting">{greeting}</h3>
      {restoreRecommendations && !restored && !check && <p className="small" role="status">이전 추천을 찾지 못했어요. 한 줄을 남기고 다시 추천받을 수 있어요.</p>}
      <label>마음에 떠오른 한 줄
        <span id={entryHint} className="small quest-entry-hint">한 줄을 적으면 마음 날씨를 볼 수 있어요.</span>
        <textarea required aria-describedby={entryHint} disabled={busy} maxLength={300} value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'example' ? '예: 오늘은 한숨 돌렸어요' : '지금 마음을 짧게 적어 주세요'} /></label>
      <fieldset><legend>오늘의 활동 범위</legend>
        <p className="small">지금 고른 범위를 기준으로 오늘의 별을 추천해요.</p>
        <div className="choices quest-range-options">{TODAY_RANGE.map(([v, l]) => <button key={v} type="button" disabled={busy} className="secondary" aria-pressed={choice === v} onClick={() => setChoice(v)}>{l}</button>)}</div>
      </fieldset>
      <button className="quest-action" disabled={busy || !text.trim()} onClick={saveEntry}>{busy ? '저장 중…' : check?.checkinId === null ? '다시 저장하기' : '마음 날씨 보기'}</button>
    </section>}

    {check && step !== 2 && (step === 1 || checkinId === null) && <section className="card quest-weather-card">
      <div className="quest-weather-reading">
        <div className="card-tags"><span>{weatherChanged ? '내가 고른 날씨' : weatherSource}</span></div>
        {!!check.pointsEarned && <p className="checkin-reward" role="status">+{check.pointsEarned} 포인트</p>}
        <h2 ref={weatherHeading} tabIndex={-1}>마음 날씨 · {weather}</h2>
        <p className="small">오늘의 한 줄을 날씨로 빗대 본 거예요. 진단이 아닌 참고 기록이에요.</p>
      </div>
      {check.checkinId !== null && <>
        <div className="quest-weather-adjust">
          <p className="quest-weather-adjust-title">내 마음과 다르면 옮겨 보세요</p>
          <WeatherGauge value={shownWeather ?? check.weather} origin={check.aiWeather ?? null} label="내 마음에 가까운 날씨" disabled={busy}
            originMark={mode === 'example' ? '예시' : check.usedFallback ? '기본' : 'AI'} onPick={setPicked} onHold={holdWeather} />
          <p className="small quest-weather-adjust-hint">{weatherChanged && check.aiWeather
            ? <>{weatherSource}: {weatherNames[check.aiWeather] ?? check.aiWeather}
                <button type="button" className="text-button weather-gauge-undo" disabled={busy} onClick={() => setPicked(check.aiWeather!)}>되돌리기</button></>
            : '손잡이를 끌거나 날씨 이름을 눌러도 바뀌어요.'}</p>
        </div>
        <button className="quest-action" disabled={busy || picked !== null} onClick={() => run(async () => {
          const result = await client(mode).recommendations(check.checkinId!);
          saveReturnVisit({ day: recommendationDay(), mode, text, choice, check, items: result.items, fallback: result.usedFallback, needsHelp: hasHelp });
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
        ? items.map(i => <Link className="card recommendation" key={i.starId} href={`/stars/${i.starId}?from=today`} onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              if (check) saveReturnVisit({ day: recommendationDay(), mode, text, choice, check, items, fallback, needsHelp: hasHelp });
              dialog.onClose();
            }
          }}>
            <div className="card-tags"><span className="gold">✦ 오늘의 별</span></div>
            <h3>{i.title}</h3><p>{i.reason}</p>
            {/* 카드 전체가 눌리지만, 눌러야 할 곳이 보이게 버튼 모양으로 */}
            <span className="recommendation-go" aria-hidden="true">이 별과 만나 보기 <span>›</span></span>
          </Link>)
        : <section className="card"><h3>오늘은 쉬어 가도 괜찮아요</h3>
          <button type="button" className="secondary" onClick={dialog.onClose}>내 밤하늘로</button></section>}
      {/* 마음 짚기 권유 (한 번도 안 한 사람에게 한 번, 고민기록 #58). 도움받을 곳 안내가 뜬 날에는 권하지 않음 */}
      {!hasHelp && <MindCheckOffer mode={mode} onGo={dialog.onClose} />}
    </Section></div>}
  </>;

  return <>
    <header className="quest-dialog-header">
      {step > 0 && <button type="button" className="text-button quest-dialog-back" aria-label={step === 2 && !check ? '한 줄 기록으로' : '이전 단계'} disabled={busy} onClick={goBack}>
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
