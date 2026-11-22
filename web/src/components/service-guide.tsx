"use client";
// 처음 시작 안내 (시작 질문을 마친 뒤 한 번, docs/온보딩.md)
// - 3장: 환영 → 양자리 별 4개 따기(첫 친구 별마중) → 준비됐나요? (짧게 기대감을 주고 바로 내 밤하늘로)
//   하루 한 줄·포인트 설명은 여기서 미리 하지 않고, 메인에서 오늘의 별을 실제로 따라가며 안내
// - 둘째 장부터 아래에 "이전 / 다음" 줄. 양자리 네 일은 같은 크기 상자에 겹쳐 두고 지금 일만 보여 줘서 상자와 단추가 제자리 (시작 질문과 같은 방식)
// - 양자리 별은 실제 기록에 남고 하루 별 따기 한도에서 제외한다.
//   (자기 보고·앱 밖 활동 아님 → 1순위 지표에 섞이지 않음, 2026-11-22 결정)
// - 언제든 건너뛸 수 있음. 도움받을 곳은 위쪽 모서리 버튼으로 항상 열 수 있음 (mobile-flow.tsx)
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { characters } from '@/app/catalog/characters';
import CatalogStardust from '@/app/catalog/catalog-stardust';
import { getStarConstellationId } from '@/lib/constellations';
import { client, type Help, type Mode } from '@/lib/mobile-data';
import { catalogQuest, FIRST_FRIEND_CONSTELLATION, TUTORIAL_STAR_IDS } from '@/lib/quest-catalog';
import { giveFirstFriend } from '@/lib/service-guide';
import ConstellationCelebration from './constellation-celebration';
import './service-guide.css';

const STAR_PATH = 'M10.8 3.8Q12 1.4 13.2 3.8l2.2 4.5 5 .7q2.6.4.7 2.3l-3.6 3.6.9 5.1q.4 2.4-1.8 1.2L12 18.8l-4.6 2.4Q5.2 22.4 5.6 20l.9-5.1-3.6-3.6Q1 9.4 3.6 9l5-.7z';
/** 메인 하늘의 양자리처럼 밝은 별부터 이어지는 네 점. */
const SPOTS = [{ x: 34, y: 30 }, { x: 204, y: 80 }, { x: 253, y: 118 }, { x: 259, y: 145 }] as const;
const PRACTICE_SPOTS = [{ x: 46, y: 116 }, { x: 150, y: 46 }, { x: 254, y: 116 }] as const;
const firstFriend = characters.find(c => c.constellationId === FIRST_FRIEND_CONSTELLATION)!;
const TASKS = TUTORIAL_STAR_IDS.map(id => catalogQuest(id)!);
const today = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });

export default function ServiceGuide({ mode, replay = false, onDone, onHelp }: {
  mode: Mode;
  /** 설정에서 다시 보는 중이면 마지막 단추가 "밤하늘로 돌아가기" */
  replay?: boolean;
  onDone: () => void;
  /** 한 줄 기록에 위기 표현이 있어 서버가 도움 안내를 돌려주면 띄움 (mobile-flow.tsx의 도움받을 곳 안내) */
  onHelp: (help: Help) => void;
}) {
  const [step, setStep] = useState(0);
  const [apiHasAries, setApiHasAries] = useState<boolean | null>(null);
  const hasAries = mode === 'example' || apiHasAries === true;
  const checking = mode === 'api' && apiHasAries === null;
  const steps = hasAries
    ? ['환영', '양자리', '내 밤하늘']
    : ['환영', '연습 별자리', '별자리 친구', '내 밤하늘'];
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (mode === 'example') return;
    let active = true;
    void client(mode).sky().then(({ stars }) => {
      if (active) setApiHasAries(TUTORIAL_STAR_IDS.every(id =>
        stars.some(star => star.starId === id && getStarConstellationId(star) === FIRST_FRIEND_CONSTELLATION)));
    }).catch(() => { if (active) setApiHasAries(false); });
    return () => { active = false; };
  }, [mode]);
  // 장이 바뀌면 제목으로 초점 (화면 읽기 프로그램이 새 장을 읽도록). 제목이 화면 밖일 때만 보일 만큼 스크롤
  // (카드 맨 위로 끌어올리면 작은 화면에서 위쪽 "도움받을 곳" 버튼이 밀려 나감)
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [step]);

  const next = () => setStep(s => Math.min(steps.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));
  return <section className="card onboarding-step service-guide" data-step={step === 1 ? 'practice' : undefined}
    aria-label={`나란히 둘러보기 ${step + 1}/${steps.length}`}>
    <div className="guide-top">
      <ol className="guide-progress" aria-label="안내 순서">
        {steps.map((name, i) => <li key={name} aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}><span className="sr-only">{name}</span></li>)}
      </ol>
      <span className="guide-count" aria-hidden="true">{step + 1} / {steps.length}</span>
      <button type="button" className="text-button guide-skip" onClick={onDone}>{replay ? '닫기' : '건너뛰기'}</button>
    </div>

    {step === 0 && <>
      <span className="welcome-icon guide-welcome" aria-hidden="true">✦<sup>✧</sup></span>
      <h2 ref={heading} tabIndex={-1}>나란히에 온 걸 환영해요</h2>
      <p>여기서는 오늘 할 수 있는 만큼, 내 속도로 걸어요. 작은 일 하나가 별 하나가 되고, 별들이 모여 나만의 밤하늘이 돼요.</p>
      <p className="small">원할 때 가까운 장소와 사람에게도 천천히 이어 갈 수 있어요. 다 해내지 않아도 괜찮아요.</p>
      <ul className="guide-preview" aria-label="이렇게 둘러봐요">
        <li><span aria-hidden="true">✦</span>{hasAries ? '양자리 별 네 개 따 보기' : '연습 별 세 개 따 보기'}</li>
        <li><span aria-hidden="true">◎</span>{hasAries ? '첫 별자리 친구 만나기' : '별자리 친구 만나는 법'}</li>
        <li><span aria-hidden="true">☾</span>내 밤하늘 열어 보기</li>
      </ul>
      <p className="small guide-time">1분이면 끝나요. 언제든 건너뛸 수 있어요.</p>
      <button type="button" className="guide-next" disabled={checking} onClick={next}>
        {checking ? '안내 준비 중…' : hasAries ? '첫 별 따러 가기' : '연습 별 따러 가기'}
      </button>
    </>}

    {/* 앞뒤로 오가도 딴 별·고른 날씨·쓴 한 줄이 남게 늘 붙여 두고, 지금 장일 때만 그림 */}
    <Practice active={step === 1} heading={heading} onNext={next} onBack={back} mode={mode} onHelp={onHelp} saveStars={hasAries} />

    {!hasAries && step === 2 && <>
      <h2 ref={heading} tabIndex={-1}>별자리를 완성하면 친구를 만나요</h2>
      <p>별자리마다 친구가 한 명씩 기다리고 있어요. 내 밤하늘의 별자리 별을 모두 따면 그 친구를 <b>친구 도감</b>에서 만나요.</p>
      <ul className="guide-friends" aria-label="별자리 친구들">
        {characters.slice(0, 4).map(c => <li key={c.id}>
          <span className="avatar avatar-silhouette guide-friend-art"><CatalogStardust id={c.id} /></span>
          <small>{c.constellation.name}</small>
        </li>)}
      </ul>
      <p className="small">별자리 친구들이 도감에서 기다리고 있어요. 천천히 만나도 괜찮아요.</p>
      <p className="small guide-note">방금 딴 연습 별자리는 여기서만 빛나요. 내 밤하늘에서도 작은 일 하나부터 시작할 수 있어요.</p>
      <GuideNav onBack={back}><button type="button" onClick={next}>다음</button></GuideNav>
    </>}

    {step === steps.length - 1 && <div className="guide-ready">
      <SkyWindow saved={hasAries} />
      <h2 ref={heading} tabIndex={-1}>준비됐나요?</h2>
      <p>{hasAries ? '방금 이은 양자리가 내 밤하늘에서 기다리고 있어요.' : '이제 내 밤하늘에서 첫 별을 켜 볼 차례예요.'}</p>
      <GuideNav onBack={back}><button type="button" onClick={onDone}>{replay ? '밤하늘로 돌아가기' : '내 밤하늘 열기'}</button></GuideNav>
    </div>}
  </section>;
}

/** 둥근 밤하늘 창 속 작은 별들 (x, y, 반지름) */
const TWINKLES = [[38, 52, 1.1], [62, 150, .8], [86, 28, .9], [150, 24, 1.2], [172, 66, .8], [166, 150, 1], [128, 174, .7],
  [36, 108, .7], [98, 162, .9], [186, 112, .8], [118, 44, .6], [24, 142, .6], [140, 120, .5], [58, 82, .5]] as const;
const WINDOW_SCALE = .62;

/** "준비됐나요?" 장: 둥근 밤하늘 창 안에서 방금 이은 별자리가 반짝임 (연습 별자리면 세 별) */
function SkyWindow({ saved }: { saved: boolean }) {
  const spots = saved ? SPOTS : PRACTICE_SPOTS;
  const xs = spots.map(spot => spot.x), ys = spots.map(spot => spot.y);
  // 별자리 테두리 상자의 가운데를 창 가운데(100, 100)에
  const x = 100 - (Math.min(...xs) + Math.max(...xs)) / 2 * WINDOW_SCALE;
  const y = 100 - (Math.min(...ys) + Math.max(...ys)) / 2 * WINDOW_SCALE;
  return <div className="guide-sky-window" aria-hidden="true">
    <svg viewBox="0 0 200 200">
      {TWINKLES.map(([cx, cy, r], i) => <circle key={i} className="guide-twinkle" cx={cx} cy={cy} r={r} style={{ animationDelay: `${(i * .37) % 2.4}s` }} />)}
      <g transform={`translate(${x} ${y}) scale(${WINDOW_SCALE})`}>
        {spots.slice(1).map((spot, i) => <line key={i} x1={spots[i].x} y1={spots[i].y} x2={spot.x} y2={spot.y} />)}
        {spots.map((spot, i) => <g key={i} className="guide-star bright" transform={`translate(${spot.x} ${spot.y})`}>
          <circle className="guide-star-glow" r="22" />
          <path d={STAR_PATH} transform="translate(-12 -12)" />
        </g>)}
      </g>
    </svg>
  </div>;
}

/** 안내 아래쪽 "이전 / 다음" 줄 (시작 질문의 이전·다음과 같은 자리·모양). children = 오른쪽 주 단추 */
function GuideNav({ onBack, backDisabled = false, children }: { onBack: () => void; backDisabled?: boolean; children: ReactNode }) {
  return <div className="choices guide-nav">
    <button type="button" className="ghost" disabled={backDisabled} onClick={onBack}>이전</button>
    {children}
  </div>;
}

/** 양자리 별 네 개를 실제 기록으로 저장하고 첫 친구를 보여 준다.
 *  - done = 딴 별 수, cursor = 지금 보고 있는 일 (spots.length면 완성 화면). "이전"으로 앞의 일을 다시 볼 수 있음
 *  - 네 번째 별을 따는 순간 한꺼번에 저장 → 그 전에는 한 줄을 고쳐도 되고, 저장한 뒤에는 그대로 보여 주기만 함
 *  - 마음 날씨는 여기서 묻지 않음: 오늘의 별(한 줄 → AI가 고른 날씨)에서 처음 만나게 해 같은 질문을 두 번 하지 않음 */
function Practice({ active, heading, onNext, onBack, mode, onHelp, saveStars }: {
  active: boolean; heading: RefObject<HTMLHeadingElement | null>; onNext: () => void; onBack: () => void;
  mode: Mode; onHelp: (help: Help) => void; saveStars: boolean;
}) {
  const [done, setDone] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [line, setLine] = useState('');
  const [popped, setPopped] = useState<number | null>(null);
  // 이번에 양자리가 처음 완성되면 도감 등록 모달을 보여 준다.
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [gift, setGift] = useState(false);
  const spots = saveStars ? SPOTS : PRACTICE_SPOTS;
  const total = spots.length;
  const constellation = saveStars ? firstFriend.constellation.name : '연습 별자리';
  const complete = done === total;
  const finished = cursor === total;
  /** 이미 딴 별의 일을 다시 보는 중 → 주 단추는 "다음" */
  const revisiting = cursor < done;
  /** 저장한 뒤에는 한 줄을 바꿔도 기록에 남지 않으니 잠금 */
  const locked = complete && saveStars;
  // 완성 화면의 "다음"은 저장이 끝나고 도감 등록 모달을 닫은 뒤에야 누를 수 있음 (마지막 별 단추와 같은 자리라, 연타하면 모달을 건너뛰던 문제)
  const showNext = finished && !saving && !saveFailed && !gift;
  const primary = useRef<HTMLButtonElement>(null);
  const modalShown = useRef(false);
  useEffect(() => {
    if (gift) modalShown.current = true;
    else if (showNext && modalShown.current) primary.current?.focus({ preventScroll: true });
  }, [gift, showNext]);

  /** 재시도나 다시 보기에서 이미 저장한 별은 건너뛴다. */
  async function record() {
    setSaving(true);
    setSaveFailed(false);
    try {
      const api = client(mode);
      const { stars } = await api.sky();
      const aries = stars.filter(star => getStarConstellationId(star) === FIRST_FRIEND_CONSTELLATION);
      if (!TUTORIAL_STAR_IDS.every(id => aries.some(star => star.starId === id))) {
        throw new Error('양자리 별을 불러오지 못했어요.');
      }
      const picked = new Set(aries.filter(star => star.status === 'bright').map(star => star.starId));
      const wasComplete = TUTORIAL_STAR_IDS.every(id => picked.has(id));
      const reflections = ['', '', line.trim()];
      for (const [i, starId] of TUTORIAL_STAR_IDS.entries()) {
        if (picked.has(starId)) continue;
        const result = await api.attempt({ starId, status: 'bright', reflection: reflections[i] ?? '', verifyMethod: 'self' });
        if (result.help) onHelp(result.help);
      }
      giveFirstFriend();
      if (!wasComplete) setGift(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function forward() {
    setDir('fwd');
    if (revisiting) { setCursor(cursor + 1); return; }
    setPopped(done);
    setDone(done + 1);
    setCursor(done + 1);
    if (saveStars && done + 1 === total) {
      setSaving(true); // 같은 순간에 "다음"을 누를 수 없게 바로 잠금
      void record();
    }
  }
  function backward() {
    if (cursor === 0) { onBack(); return; }
    setDir('back');
    setCursor(cursor - 1);
  }

  if (!active) return null;
  const label = saveStars ? '양자리 별' : '연습 별';
  const primaryButton = finished
    ? saveFailed
      ? <button ref={primary} type="button" onClick={() => void record()}>다시 저장하기</button>
      : <button ref={primary} type="button" disabled={!showNext} onClick={onNext}>{saving ? '별을 담는 중…' : '다음'}</button>
    : <button ref={primary} type="button" className="guide-pick" onClick={forward}>{revisiting ? '다음' : '하늘의 별 따기'}</button>;

  return <>
    <h2 ref={heading} tabIndex={-1}>{finished
      ? saveFailed ? '별을 담지 못했어요' : saving ? '네 별을 이었어요' : `${constellation}를 완성했어요`
      : '별 하나는 작은 일 하나예요'}</h2>
    <p className="small" aria-live="polite">{finished
      ? '네 별이 이어졌어요. 내 밤하늘에서도 이렇게 이어 가요.'
      : revisiting
        ? `${label} ${cursor + 1} / ${total} · 이미 딴 별이에요. "다음"으로 넘어가요.`
        : `${label} ${cursor + 1} / ${total} · 해냈다면 "하늘의 별 따기"로 별을 따요.`}</p>

    <svg className={`guide-constellation${complete ? ' complete' : ''}`} viewBox="0 0 300 174" role="img"
      aria-label={`${constellation}, 별 ${total}개 중 ${done}개를 땄어요`}>
      {spots.slice(1).map((spot, i) => {
        const from = spots[i];
        return <line key={i} x1={from.x} y1={from.y} x2={spot.x} y2={spot.y} className={done > i + 1 ? 'lit' : undefined} />;
      })}
      {spots.map((spot, i) => <g key={i} transform={`translate(${spot.x} ${spot.y})`}
        className={`guide-star${i < done ? ' bright' : ''}${i === cursor ? ' current' : ''}${popped === i ? ' popped' : ''}`}>
        <circle className="guide-star-glow" r="22" />
          <g className="guide-star-shape"><path d={STAR_PATH} transform="translate(-12 -12)" /></g>
      </g>)}
    </svg>
    <p className="guide-constellation-name" aria-hidden="true">{constellation}</p>

    {gift && <ConstellationCelebration constellationId={FIRST_FRIEND_CONSTELLATION} name={firstFriend.constellation.name}
      title={<>{firstFriend.constellation.name} 친구<br />{firstFriend.nickname}을 만났어요</>}
      message="별마중이 도감에 담겼어요. 내 밤하늘에서 별자리를 완성하면 다른 친구도 만날 수 있어요."
      onDone={() => setGift(false)} />}

    {/* 네 일과 완성 화면을 같은 자리에 겹쳐 두고 지금 것만 보임 → 상자 크기가 가장 긴 일에 맞춰 늘 같고 이전·다음도 제자리
        (숨긴 일은 inert: 누르거나 읽히지 않음). 지금 일이 되는 순간 data-dir이 붙어 밀려 들어옴 */}
    <div className="guide-task">
      <div className="onboarding-stack">
        {TASKS.slice(0, total).map((task, i) => <div key={task.id} className="guide-task-step step-slide"
          data-dir={i === cursor ? dir : undefined} inert={i !== cursor}>
          <b>{task.title}</b>
          <p className="small">{task.description}</p>
          {i === 2 && <label className="guide-line"><span className="sr-only">오늘을 기억할 한 줄</span>
            <input value={line} maxLength={60} readOnly={locked} placeholder="예: 창밖이 생각보다 밝았어요" onChange={e => setLine(e.target.value)} />
          </label>}
        </div>)}
        <div className="guide-task-step step-slide" data-dir={finished ? dir : undefined} inert={!finished}>
          {finished && <>
            <div className="guide-memory" role="status">
              <small>별을 누르면 이렇게 그날의 기억이 열려요</small>
              <p><time>{today.format(new Date())}</time> · {line.trim() || '말없이 남긴 작은 시도'}</p>
            </div>
            {saveFailed && <p className="small guide-note" role="alert">별을 저장하지 못했어요. 지금 다시 시도하거나 나중에 밤하늘에서 이어갈 수 있어요.</p>}
          </>}
        </div>
      </div>
      <GuideNav onBack={backward} backDisabled={saving || gift}>{primaryButton}</GuideNav>
    </div>
  </>;
}
