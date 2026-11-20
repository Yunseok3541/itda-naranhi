"use client";
// 퀘스트(오늘의 별): 한 줄 체크인 → 마음 날씨 → 오늘의 별 추천. 공통 틀은 screen-kit.tsx
// - 대표 영역: 캐릭터 + 오늘의 질문 (메인 캐릭터 말풍선과 같은 질문 결)
// - 요약 칸은 넣지 않음 (이 화면은 입력이 중심)
// - 부가 기능: 날씨 직접 바꾸기는 접어 둠
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { client, weatherNames, type Checkin, type Help, type Mode, type Recommendation } from '@/lib/mobile-data';
import { Avatar, Hero, ScreenBar, Section } from './screen-kit';

const CHOICES = [['rest', '쉬어 가기'], ['home', '집 안'], ['near', '집 근처'], ['out', '바깥']] as const;

export default function QuestScreen({ mode, busy, run, onHelp, onError, onClose, onTotalPoints }: {
  mode: Mode;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  onHelp: (help: Help) => void;
  onError: (message: string) => void;
  onClose?: () => void;
  onTotalPoints?: (points: number) => void;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('home');
  const [check, setCheck] = useState<Checkin | null>(null);
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [fallback, setFallback] = useState(false);
  const weatherHeading = useRef<HTMLHeadingElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const inSheet = onClose !== undefined;
  const reset = () => { setCheck(null); setItems(null); };
  const weather = check ? weatherNames[check.weather] || check.weather : null;
  const checkinId = check?.checkinId;
  const hasHelp = !!check?.help;
  useEffect(() => {
    if (inSheet && checkinId != null && !hasHelp) {
      weatherHeading.current?.focus({ preventScroll: true });
      weatherHeading.current?.scrollIntoView({ block: 'start' });
    }
  }, [checkinId, hasHelp, inSheet]);
  useEffect(() => {
    if (inSheet && items) {
      results.current?.focus({ preventScroll: true });
      results.current?.scrollIntoView({ block: 'start' });
    }
  }, [items, inSheet]);

  return <>
    {!inSheet && <><ScreenBar title="오늘의 별" />
    <Hero
      visual={<Avatar size={84} />}
      title="오늘은 어떤 하루인가요?"
      message="한 줄이면 충분해요. 들려준 만큼 오늘의 별을 찾아 줄게요."
      chip={weather ? `마음 날씨 · ${weather}` : undefined}
    /></>}

    <section className="card">
      <h2>한 줄 기록</h2>
      <label>마음에 떠오른 한 줄<textarea disabled={busy} maxLength={300} value={text} onChange={e => { setText(e.target.value); reset(); }} placeholder="가상 내용으로 적어 주세요" /></label>
      <fieldset><legend>오늘은 어떤 활동이 괜찮을까요?</legend>
        <div className="choices">{CHOICES.map(([v, l]) => <button key={v} type="button" disabled={busy} className="secondary" aria-pressed={choice === v} onClick={() => { setChoice(v); reset(); }}>{l}</button>)}</div>
      </fieldset>
      <button disabled={busy || !text.trim()} onClick={() => run(async () => {
        reset();
        const r = await client(mode).checkin(text, choice);
        setCheck(r);
        onHelp(r.help);
        if (typeof r.totalPoints === 'number') onTotalPoints?.(r.totalPoints);
        if (r.checkinId === null) onError('저장하지 못했어요. 입력은 그대로 있어요. 다시 저장해 주세요.');
      })}>{busy ? '처리 중…' : check?.checkinId === null ? '체크인 저장 재시도' : '한 줄 기록하기'}</button>
    </section>

    {check && <section className="card">
      <div className="card-tags"><span>{mode === 'example' ? '예시 날씨' : check.usedFallback ? '기본 날씨' : 'AI가 고른 날씨'}</span></div>
      {check.pointsEarned === 100 && <p className="checkin-reward" role="status">+100 포인트</p>}
      <h2 ref={weatherHeading} tabIndex={inSheet ? -1 : undefined}>마음 날씨 · {weather}</h2>
      <p className="small">진단이 아닌 참고 기록이에요.</p>
      {check.checkinId !== null && <>
        <details>
          <summary>날씨가 다르면 바꾸기</summary>
          <label>내 마음에 가까운 날씨<select disabled={busy} value={check.weather} onChange={e => {
            const next = e.target.value;
            run(async () => { await client(mode).weather(check.checkinId!, next); setCheck({ ...check, weather: next }); });
          }}>{Object.entries(weatherNames).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </details>
        <button disabled={busy} onClick={() => run(async () => {
          const result = await client(mode).recommendations(check.checkinId!);
          setItems(result.items);
          setFallback(result.usedFallback);
        })}>오늘의 별 추천받기</button>
      </>}
    </section>}

    {items && <div ref={results} tabIndex={inSheet ? -1 : undefined}><Section id="quest-stars" title="추천 별">
      <p className="small">{mode === 'example' ? '예시 추천이에요.' : fallback ? '기본 추천이에요.' : 'AI가 만든 추천은 틀릴 수 있어요.'}</p>
      {items.length
        ? items.map(i => <Link className="card recommendation" key={i.starId} href={`/stars/${i.starId}`} onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onClose?.();
          }}>
            <div className="card-tags"><span className="gold">✦ 오늘의 별</span></div>
            <h3>{i.title}</h3><p>{i.reason}</p><strong>이 별 만나기</strong>
          </Link>)
        : <section className="card"><h3>오늘은 쉬어 가도 괜찮아요</h3><p>다른 활동 범위를 고르거나 밤하늘에서 쉬어 가세요.</p>
          {onClose ? <button type="button" className="secondary" onClick={onClose}>내 밤하늘로</button> : <Link href="/sky">내 밤하늘로</Link>}</section>}
    </Section></div>}
  </>;
}
