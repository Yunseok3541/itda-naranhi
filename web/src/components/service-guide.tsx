"use client";
// 처음 시작 안내 (시작 질문을 마친 뒤 한 번, docs/온보딩.md)
// - 4장: 환영 → 연습 별 3개 따기(별자리 완성) → 별자리 친구(도감) → 하루 한 줄과 포인트
// - 읽는 안내보다 직접 해 보기. 연습 별은 누구나 끝낼 수 있는 일이고 실패·포기할 거리가 없음
// - 연습 별자리는 이 안내 안에서만 빛남. 실제 기록·도감·포인트·지표에 남기지 않음 (기획: 별 개수는 목표가 아님)
// - 언제든 건너뛸 수 있음. 도움받을 곳은 위쪽 모서리 버튼으로 항상 열 수 있음 (mobile-flow.tsx)
import Image from 'next/image';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { characters } from '@/app/catalog/characters';
import { weatherNames } from '@/lib/mobile-data';
import { CHECKIN_POINTS, METEOR_POINTS } from '@/lib/points';
import './service-guide.css';

const STEPS = ['환영', '연습 별자리', '별자리 친구', '하루 한 줄'] as const;
const STAR_PATH = 'M10.8 3.8Q12 1.4 13.2 3.8l2.2 4.5 5 .7q2.6.4.7 2.3l-3.6 3.6.9 5.1q.4 2.4-1.8 1.2L12 18.8l-4.6 2.4Q5.2 22.4 5.6 20l.9-5.1-3.6-3.6Q1 9.4 3.6 9l5-.7z';
/** 연습 별자리: 세 별을 잇는 작은 산 모양 */
const SPOTS = [{ x: 46, y: 104 }, { x: 150, y: 40 }, { x: 254, y: 104 }] as const;
const PRACTICE = [
  { title: '숨 한 번 크게 쉬기', body: '천천히 들이쉬고, 내쉬어 보세요. 준비되면 별을 따요.' },
  { title: '지금 마음에 가까운 날씨 고르기', body: '정답은 없어요. 고르지 않아도 괜찮아요.' },
  { title: '오늘을 기억할 한 줄 남기기', body: '짧게 적어도, 비워 두어도 괜찮아요.' },
] as const;
const today = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });

export default function ServiceGuide({ replay = false, onDone }: {
  /** 설정에서 다시 보는 중이면 마지막 단추가 "밤하늘로 돌아가기" */
  replay?: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  // 장이 바뀌면 제목으로 초점 (화면 읽기 프로그램이 새 장을 읽도록). 제목이 화면 밖일 때만 보일 만큼 스크롤
  // (카드 맨 위로 끌어올리면 작은 화면에서 위쪽 "도움받을 곳" 버튼이 밀려 나감)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [step]);

  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  return <section className="card onboarding-step service-guide" aria-label={`나란히 둘러보기 ${step + 1}/${STEPS.length}`}>
    <div className="guide-top">
      <ol className="guide-progress" aria-label="안내 순서">
        {STEPS.map((name, i) => <li key={name} aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}><span className="sr-only">{name}</span></li>)}
      </ol>
      <span className="guide-count" aria-hidden="true">{step + 1} / {STEPS.length}</span>
      <button type="button" className="text-button guide-skip" onClick={onDone}>{replay ? '닫기' : '건너뛰기'}</button>
    </div>

    {step === 0 && <>
      <span className="welcome-icon guide-welcome" aria-hidden="true">✦<sup>✧</sup></span>
      <h2 ref={heading} tabIndex={-1}>나란히에 온 걸 환영해요</h2>
      <p>여기서는 오늘 할 수 있는 만큼, 내 속도로 걸어요. 작은 일 하나가 별 하나가 되고, 별들이 모여 나만의 밤하늘이 돼요.</p>
      <p className="small">원할 때 가까운 장소와 사람에게도 천천히 이어 갈 수 있어요. 다 해내지 않아도 괜찮아요.</p>
      <ul className="guide-preview" aria-label="이렇게 둘러봐요">
        <li><span aria-hidden="true">✦</span>연습 별 3개 따 보기</li>
        <li><span aria-hidden="true">◎</span>별자리 친구 만나는 법</li>
        <li><span aria-hidden="true">✎</span>하루 한 줄과 포인트</li>
      </ul>
      <p className="small guide-time">1분이면 끝나요. 언제든 건너뛸 수 있어요.</p>
      <button type="button" className="guide-next" onClick={next}>연습 별 따러 가기</button>
    </>}

    {step === 1 && <Practice heading={heading} onNext={next} />}

    {step === 2 && <>
      <h2 ref={heading} tabIndex={-1}>별자리를 완성하면 친구를 만나요</h2>
      <p>내 밤하늘의 별자리마다 친구가 한 명씩 기다리고 있어요. 별자리의 별을 모두 따면 그 친구를 <b>도감</b>에서 만나요.</p>
      <ul className="guide-friends" aria-label="아직 만나지 못한 친구들">
        {characters.slice(0, 4).map(c => <li key={c.id}>
          <span className="guide-friend-art"><Image src={`/catalog/${c.id}.webp`} alt="" fill sizes="64px" unoptimized /></span>
          <small>{c.constellation.name}</small>
        </li>)}
      </ul>
      <p className="small">아직 만나지 못한 친구 {characters.length}명이 도감에서 기다리고 있어요. 서두르지 않아도 친구들은 계속 기다려요.</p>
      <p className="small guide-note">방금 딴 연습 별자리는 여기서만 빛나요. 진짜 별자리는 내 밤하늘에서 시작해요.</p>
      <button type="button" className="guide-next" onClick={next}>다음</button>
    </>}

    {step === 3 && <>
      <h2 ref={heading} tabIndex={-1}>하루 한 줄이면 충분해요</h2>
      <p>메인 아래 가운데 <b>오늘의 별</b>을 누르면 이렇게 이어져요.</p>
      <ol className="guide-daily">
        <li><span aria-hidden="true">1</span><div><b>한 줄 기록</b><small>오늘을 한 줄로, 오늘 괜찮은 활동 범위도 골라요</small></div></li>
        <li><span aria-hidden="true">2</span><div><b>마음 날씨</b><small>AI가 한 줄을 날씨로 빗대 봐요. 다르면 바꿀 수 있어요</small></div></li>
        <li><span aria-hidden="true">3</span><div><b>오늘의 별</b><small>고른 범위 안에서 해 볼 만한 별을 찾아 줘요</small></div></li>
      </ol>
      <div className="guide-points">
        <b><span aria-hidden="true">✦</span> 포인트는 이렇게 쌓여요</b>
        <p>하루 첫 체크인 +{CHECKIN_POINTS} · 별을 처음 따면 +10~40 · 별똥별 +{METEOR_POINTS}</p>
        <small>모은 포인트로 프로필의 별빛 상점에서 캐릭터를 꾸밀 수 있어요.</small>
      </div>
      <p className="small guide-note">매일 오지 않아도 돼요. 연속 기록도, 감점도 없어요. 오고 싶은 날 오면 돼요.</p>
      <button type="button" className="guide-next" onClick={onDone}>{replay ? '밤하늘로 돌아가기' : '내 밤하늘 열기'}</button>
    </>}
  </section>;
}

/** 연습 별 3개: 각 별의 아주 쉬운 일 → "하늘의 별 따기" → 셋 다 따면 별자리 완성 */
function Practice({ heading, onNext }: { heading: RefObject<HTMLHeadingElement | null>; onNext: () => void }) {
  const [done, setDone] = useState(0);
  const [weather, setWeather] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [popped, setPopped] = useState<number | null>(null);
  const complete = done === SPOTS.length;
  const task = PRACTICE[Math.min(done, PRACTICE.length - 1)];

  function pick() {
    setPopped(done);
    setDone(d => d + 1);
  }

  return <>
    <h2 ref={heading} tabIndex={-1}>{complete ? '연습 별자리를 완성했어요' : '별 하나는 작은 일 하나예요'}</h2>
    <p className="small" aria-live="polite">{complete
      ? '세 별이 이어져 별자리가 됐어요. 내 밤하늘에서도 이렇게 별을 하나씩 따서 별자리를 이어 가요.'
      : `연습 별 ${done + 1} / ${SPOTS.length} · 해냈다면 "하늘의 별 따기"로 별을 따요.`}</p>

    <svg className={`guide-constellation${complete ? ' complete' : ''}`} viewBox="0 0 300 150" role="img"
      aria-label={`연습 별자리, 별 ${SPOTS.length}개 중 ${done}개를 땄어요`}>
      {SPOTS.slice(1).map((spot, i) => {
        const from = SPOTS[i];
        return <line key={i} x1={from.x} y1={from.y} x2={spot.x} y2={spot.y} className={done > i + 1 ? 'lit' : undefined} />;
      })}
      {SPOTS.map((spot, i) => <g key={i} transform={`translate(${spot.x} ${spot.y})`}
        className={`guide-star${i < done ? ' bright' : i === done ? ' current' : ''}${popped === i ? ' popped' : ''}`}>
        <circle className="guide-star-glow" r="22" />
        <g className="guide-star-shape"><path d={STAR_PATH} transform="translate(-16.8 -16.8) scale(1.4)" /></g>
      </g>)}
    </svg>

    {complete
      ? <div className="guide-memory" role="status">
          <small>별을 누르면 이렇게 그날의 기억이 열려요</small>
          <p><time>{today.format(new Date())}</time> · {line.trim() || '말없이 남긴 작은 시도'}</p>
        </div>
      : <div className="guide-task">
          <b>{task.title}</b>
          <p className="small">{task.body}</p>
          {done === 1 && <div className="guide-weather" role="group" aria-label="마음 날씨">
            {Object.entries(weatherNames).map(([code, name]) => <button key={code} type="button" className="ghost"
              aria-pressed={weather === code} onClick={() => setWeather(w => w === code ? null : code)}>{name}</button>)}
          </div>}
          {done === 2 && <label className="guide-line"><span className="sr-only">오늘을 기억할 한 줄</span>
            <input value={line} maxLength={60} placeholder="예: 창밖이 생각보다 밝았어요" onChange={e => setLine(e.target.value)} />
          </label>}
          <button type="button" className="guide-pick" onClick={pick}>하늘의 별 따기</button>
          {done === 0 && <p className="small guide-note">실제 별에서는 끝까지 못 한 날 &lsquo;손 뻗어 보기&rsquo;로 남겨도 돼요. 희미한 별도 내 하늘에 남아요.</p>}
          {done === 1 && <p className="small guide-note">매일 한 줄을 남기면 AI가 마음 날씨를 골라 줘요. 진단이 아니라 참고 기록이에요.</p>}
        </div>}

    {complete && <button type="button" className="guide-next" onClick={onNext}>다음</button>}
  </>;
}
