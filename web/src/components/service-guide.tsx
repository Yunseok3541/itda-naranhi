"use client";
// 처음 시작 안내 (시작 질문을 마친 뒤 한 번, docs/온보딩.md)
// - 4장: 환영 → 양자리 별 4개 따기(첫 친구 별마중) → 별자리 친구 → 하루 한 줄과 포인트
// - 양자리 별은 실제 기록에 남고 하루 별 따기 한도에서 제외한다.
//   (자기 보고·앱 밖 활동 아님 → 1순위 지표에 섞이지 않음, 2026-11-22 결정)
// - 언제든 건너뛸 수 있음. 도움받을 곳은 위쪽 모서리 버튼으로 항상 열 수 있음 (mobile-flow.tsx)
import { useEffect, useRef, useState, type RefObject } from 'react';
import { characters } from '@/app/catalog/characters';
import CatalogStardust from '@/app/catalog/catalog-stardust';
import { getStarConstellationId } from '@/lib/constellations';
import { client, weatherNames, type Help, type Mode } from '@/lib/mobile-data';
import { CHECKIN_POINTS, METEOR_POINTS } from '@/lib/points';
import { catalogQuest, FIRST_FRIEND_CONSTELLATION, TUTORIAL_STAR_IDS } from '@/lib/quest-catalog';
import { giveFirstFriend, useFirstFriend } from '@/lib/service-guide';
import ConstellationCelebration from './constellation-celebration';
import { Avatar } from './screen-kit';
import './service-guide.css';

const STEPS = ['환영', '양자리', '별자리 친구', '하루 한 줄'] as const;
const STAR_PATH = 'M10.8 3.8Q12 1.4 13.2 3.8l2.2 4.5 5 .7q2.6.4.7 2.3l-3.6 3.6.9 5.1q.4 2.4-1.8 1.2L12 18.8l-4.6 2.4Q5.2 22.4 5.6 20l.9-5.1-3.6-3.6Q1 9.4 3.6 9l5-.7z';
/** 메인 하늘의 양자리처럼 밝은 별부터 이어지는 네 점. */
const SPOTS = [{ x: 34, y: 30 }, { x: 204, y: 80 }, { x: 253, y: 118 }, { x: 259, y: 145 }] as const;
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
  const met = useFirstFriend();
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
        <li><span aria-hidden="true">✦</span>{firstFriend.constellation.name} 별 {TASKS.length}개 따 보기</li>
        <li><span aria-hidden="true">◎</span>첫 별자리 친구 만나기</li>
        <li><span aria-hidden="true">✎</span>하루 한 줄과 포인트</li>
      </ul>
      <p className="small guide-time">1분이면 끝나요. 언제든 건너뛸 수 있어요.</p>
      <button type="button" className="guide-next" onClick={next}>첫 별 따러 가기</button>
    </>}

    {step === 1 && <Practice heading={heading} onNext={next} mode={mode} onHelp={onHelp} />}

    {step === 2 && <>
      <h2 ref={heading} tabIndex={-1}>{met ? `첫 친구 ${firstFriend.nickname}을 만났어요` : '별자리를 완성하면 친구를 만나요'}</h2>
      <p>별자리마다 친구가 한 명씩 기다리고 있어요. 내 밤하늘의 별자리 별을 모두 따면 그 친구를 <b>도감</b>에서 만나요.</p>
      <ul className="guide-friends" aria-label="별자리 친구들">
        {(met ? [firstFriend, ...characters.filter(c => c !== firstFriend).slice(0, 3)] : characters.slice(0, 4)).map(c => <li key={c.id}>
          {met && c === firstFriend
            /* 만난 친구: 프로필 그림 고르기의 고를 수 있는 칸과 같은 그림 */
            ? <span className="guide-friend-met"><Avatar id={c.id} size={56} /></span>
            /* 아직 못 만난 친구: 프로필 그림 고르기의 잠긴 칸과 같은 별가루 그림 (profile-home.tsx avatar-silhouette) */
            : <span className="avatar avatar-silhouette guide-friend-art"><CatalogStardust id={c.id} large={false} /></span>}
          <small className={met && c === firstFriend ? 'met' : undefined}>{met && c === firstFriend ? c.nickname : c.constellation.name}</small>
        </li>)}
      </ul>
      <p className="small">아직 만나지 못한 친구 {characters.length - (met ? 1 : 0)}명이 도감에서 기다리고 있어요. 서두르지 않아도 친구들은 계속 기다려요.</p>
      {met && <p className="small guide-note">딴 별 네 개는 내 밤하늘의 양자리에 그대로 담겨 있어요.</p>}
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

/** 양자리 별 네 개를 실제 기록으로 저장하고 첫 친구를 보여 준다. */
function Practice({ heading, onNext, mode, onHelp }: {
  heading: RefObject<HTMLHeadingElement | null>; onNext: () => void; mode: Mode; onHelp: (help: Help) => void;
}) {
  const [done, setDone] = useState(0);
  const [weather, setWeather] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [popped, setPopped] = useState<number | null>(null);
  // 이번에 양자리가 처음 완성되면 도감 등록 모달을 보여 준다.
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [gift, setGift] = useState(false);
  const complete = done === SPOTS.length;
  const task = TASKS[Math.min(done, TASKS.length - 1)];
  // "다음"은 저장이 끝나고 도감 등록 모달을 닫은 뒤에야 나타남 (마지막 별 단추와 같은 자리라, 연타하면 모달을 건너뛰던 문제)
  const showNext = complete && !saving && !saveFailed && !gift;
  const nextButton = useRef<HTMLButtonElement>(null);
  const modalShown = useRef(false);
  useEffect(() => {
    if (gift) modalShown.current = true;
    else if (showNext && modalShown.current) nextButton.current?.focus({ preventScroll: true });
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
      const reflections = ['', weather ? `마음 날씨 · ${weatherNames[weather]}` : '', line.trim()];
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

  function pick() {
    setPopped(done);
    setDone(done + 1);
    if (done + 1 === SPOTS.length) {
      setSaving(true); // 같은 순간에 "다음"이 나타나지 않게 바로 잠금
      void record();
    }
  }

  return <>
    <h2 ref={heading} tabIndex={-1}>{complete
      ? saveFailed ? '별을 담지 못했어요' : saving ? '네 별을 이었어요' : `${firstFriend.constellation.name}를 완성했어요`
      : '별 하나는 작은 일 하나예요'}</h2>
    <p className="small" aria-live="polite">{complete
      ? '네 별이 이어져 양자리가 됐어요. 내 밤하늘에서도 별을 하나씩 따서 별자리를 이어 가요.'
      : `${firstFriend.constellation.name} 별 ${done + 1} / ${SPOTS.length} · 해냈다면 "하늘의 별 따기"로 별을 따요.`}</p>

    <svg className={`guide-constellation${complete ? ' complete' : ''}`} viewBox="0 0 300 174" role="img"
      aria-label={`${firstFriend.constellation.name}, 별 ${SPOTS.length}개 중 ${done}개를 땄어요`}>
      {SPOTS.slice(1).map((spot, i) => {
        const from = SPOTS[i];
        return <line key={i} x1={from.x} y1={from.y} x2={spot.x} y2={spot.y} className={done > i + 1 ? 'lit' : undefined} />;
      })}
      {SPOTS.map((spot, i) => <g key={i} transform={`translate(${spot.x} ${spot.y})`}
        className={`guide-star${i < done ? ' bright' : i === done ? ' current' : ''}${popped === i ? ' popped' : ''}`}>
        <circle className="guide-star-glow" r="22" />
          <g className="guide-star-shape"><path d={STAR_PATH} transform="translate(-12 -12)" /></g>
      </g>)}
    </svg>
    <p className="guide-constellation-name" aria-hidden="true">{firstFriend.constellation.name}</p>

    {gift && <ConstellationCelebration constellationId={FIRST_FRIEND_CONSTELLATION} name={firstFriend.constellation.name}
      title={<>{firstFriend.constellation.name} 친구<br />{firstFriend.nickname}을 만났어요</>}
      message="첫 친구가 도감에 담겼어요."
      onDone={() => setGift(false)} />}

    {complete
      ? <div className="guide-memory" role="status">
          <small>별을 누르면 이렇게 그날의 기억이 열려요</small>
          <p><time>{today.format(new Date())}</time> · {line.trim() || '말없이 남긴 작은 시도'}</p>
        </div>
      : <div className="guide-task">
          <b>{task.title}</b>
          <p className="small">{task.description}</p>
          {done === 1 && <div className="guide-weather" role="group" aria-label="마음 날씨">
            {Object.entries(weatherNames).map(([code, name]) => <button key={code} type="button" className="ghost"
              aria-pressed={weather === code} onClick={() => setWeather(w => w === code ? null : code)}>{name}</button>)}
          </div>}
          {done === 2 && <label className="guide-line"><span className="sr-only">오늘을 기억할 한 줄</span>
            <input value={line} maxLength={60} placeholder="예: 창밖이 생각보다 밝았어요" onChange={e => setLine(e.target.value)} />
          </label>}
          <button type="button" className="guide-pick" onClick={pick}>하늘의 별 따기</button>
          {done === 0 && <p className="small guide-note">끝까지 못 한 날엔 &lsquo;손 뻗어 보기&rsquo;로 남겨도 돼요. 희미한 별도 내 하늘에 남아요.</p>}
          {done === 1 && <p className="small guide-note">매일 한 줄을 남기면 AI가 마음 날씨를 골라 줘요. 진단이 아니라 참고 기록이에요.</p>}
        </div>}

    {complete && saveFailed && <>
      <p className="small guide-note" role="alert">별을 저장하지 못했어요. 지금 다시 시도하거나 나중에 밤하늘에서 이어갈 수 있어요.</p>
      <button type="button" className="guide-next" onClick={() => void record()}>다시 저장하기</button>
    </>}
    {complete && saving && <p className="small guide-saving" role="status">별을 담는 중…</p>}
    {showNext && <button ref={nextButton} type="button" className="guide-next" onClick={onNext}>다음</button>}
  </>;
}
