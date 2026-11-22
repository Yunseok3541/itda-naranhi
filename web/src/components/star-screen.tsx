"use client";
// 별 기록: 하늘의 별 따기 / 손 뻗어 보기 + 회고 한 줄, 이 별과의 기억. 공통 틀은 screen-kit.tsx
// - 대표 영역: 별(상태별 빛) + 별 이름 + 별자리·상태 칩
// - 요약 칸은 넣지 않음
// - 부가 기능: 위치로 도착 확인(바깥 별)은 접어 둠
import { preparePhoto } from './memory-album';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { client, isGpsStar, weatherNames, type Help, type Mode, type Star } from '@/lib/mobile-data';
import { WEATHER_STAR_ID } from '@/lib/quest-catalog';
import { getActivityConstellation, getStarConstellationId } from '@/lib/constellations';
import { DAILY_STAR_LIMIT_MESSAGE } from '@/lib/star-limit';
import { starDisplayDescription, starDisplayTitle } from '@/lib/star-display';
import { Hero, HeroIcon, ScreenBar, Section } from './screen-kit';
import { NextStepCard } from './next-step-card';
import GlassSelect from './glass-select';
import { StatusStar } from './star-list';
import type { NextPlan } from '@/lib/next-step';
import './star-screen.css';

const STATUS = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;
const REASONS = [['crowded', '사람이 많았어요'], ['weather', '날씨·상황이 안 맞았어요'], ['tired', '몸·마음이 힘들었어요'], ['no_time', '시간이 없었어요'], ['not_for_me', '나랑 안 맞았어요'], ['cost', '돈이 들어서요'], ['other', '기타']] as const;
const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
const memoryDate = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : koreanDate.format(d); };
const constellationName = (s: Star) => s.constellationName ?? getActivityConstellation(getStarConstellationId(s))?.name;

export default function StarScreen({ mode, star, fromToday, dailyLimitReached, busy, run, onHelp, onSaved }: {
  fromToday?: boolean;
  mode: Mode;
  star: Star | undefined;
  dailyLimitReached: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  onHelp: (help: Help) => void;
  /** Returns the celebration URL only when this save completed a constellation. */
  onSaved: (result?: { attemptId: number; status: string }) => Promise<string | undefined>;
}) {
  const router = useRouter();
  const back = fromToday ? '/sky?resume=today' : '/sky';
  const backLabel = fromToday ? '추천 별 목록으로 돌아가기' : '내 밤하늘로';
  // 처음엔 둘 다 고르지 않은 상태: 고르지 않고 저장해서 "딴 별"로 남는 일이 없게 직접 고름 (원칙 "사용자가 고른다", 기능발견성 다시 점검 #9)
  const [status, setStatus] = useState<'dim' | 'bright' | null>(null);
  const [reason, setReason] = useState('');
  const [reflection, setReflection] = useState('');
  const [photo,setPhoto]=useState<string>();
  const [requestId,setRequestId]=useState<string>();
  const [photoBusy,setPhotoBusy]=useState(false);
  const [photoError,setPhotoError]=useState('');
  const [saved, setSaved] = useState('');
  const [savedStatus, setSavedStatus] = useState<'dim' | 'bright'>('bright');
  const [savedNote, setSavedNote] = useState('');
  const [completionHref, setCompletionHref] = useState<string>();
  const [place, setPlace] = useState('');
  const [savedAttemptId, setSavedAttemptId] = useState<number | null>(null);
  const [pending, setPending] = useState<NextPlan | null>(null);
  // 날씨 별(양자리 "지금 마음에 가까운 날씨 고르기")은 시작 안내처럼 날씨를 고를 수 있음. 고르면 기록 한 줄 앞에 "마음 날씨 · 맑음"
  const [weather, setWeather] = useState<string | null>(null);
  const [planError, setPlanError] = useState('');
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planRetry, setPlanRetry] = useState(0);
  useEffect(() => {
    let active = true;
    client(mode).pendingNext().then(r => {
      if (active) { setPending(r.plan?.starId === star?.starId ? r.plan : null); setPlanError(''); }
    }).catch(() => { if (active) setPlanError('지난번에 골라 둔 별을 확인하지 못했어요. 다시 확인하거나 그냥 기록해도 괜찮아요.'); })
      .finally(() => { if (active) setPlanLoaded(true); });
    return () => { active = false; };
  }, [mode, star?.starId, planRetry]);
  async function choosePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    setPhotoBusy(true);setPhotoError('');
    try { setPhoto(await preparePhoto(file));setRequestId(id=>id??crypto.randomUUID()); }
    catch(err){setPhotoError(err instanceof Error?err.message:'사진을 읽지 못했어요.');}
    finally{setPhotoBusy(false);}
  }
  // 골라 둔 별을 기록하면 늘 지난 시도와 이어서 저장 → 밤하늘 "✧ 이어볼 별"이 사라짐 ("이어서 기록하지 않기" 버튼은 뺌, 고민기록 #60)
  const activePlan = pending;

  if (!star) return <>
    <ScreenBar title="별 기록" back={back} backLabel={backLabel} />
    <Hero visual={<HeroIcon tone="dim"><StatusStar status="untried" /></HeroIcon>} title="별을 찾고 있어요" message="별을 불러오지 못했거나 없는 주소예요." />
    <section className="card"><Link className="secondary" href={back}>{backLabel}</Link><button disabled={busy} onClick={() => run(async () => { await onSaved(); })}>다시 불러오기</button></section>
  </>;

  // GPS(도착 확인) 별: 실제 API는 verifyType, 예시 모드만 예시 목록의 16·17 (별 ID는 시드마다 바뀜)
  const outside = isGpsStar(star);
  const weatherStar = star.starId === WEATHER_STAR_ID;
  const weatherText = weatherStar && weather ? `마음 날씨 · ${weatherNames[weather]}` : '';
  // 합쳐서 300자(회고 최대)를 넘지 않게 한 줄 칸을 줄임
  const lineMax = 300 - (weatherText ? weatherText.length + 3 : 0);
  const questBlocked = dailyLimitReached && star.status !== 'bright';
  return <>
    <ScreenBar title="별 기록" back={back} backLabel={backLabel} />
    <Hero
      visual={<HeroIcon tone={star.status === 'untried' ? 'dim' : 'gold'}><StatusStar status={star.status} /></HeroIcon>}
      title={starDisplayTitle(activePlan?.title ?? star.title)}
      message={activePlan?.subQuestId ? `원래 별 · ${star.title}` : star.description && starDisplayDescription(star.description)}
      chip={[constellationName(star), STATUS[star.status]].filter(Boolean).join(' · ')}
    />

    {!saved && !questBlocked && planError && <section className="card"><p role="alert">{planError}</p>
      <button type="button" onClick={() => setPlanRetry(n => n + 1)}>이어볼 별 다시 확인</button></section>}
    {!saved && !questBlocked && pending && <section className="card next-step-active">
      <p><span aria-hidden="true">✧</span> 지난번 기록에서 골라 둔 별이에요.</p>
      {pending.preparationHref && <Link className="secondary" href={pending.preparationHref}>문의 문장 준비하기</Link>}
    </section>}
    {saved
      ? <section className={`record-done ${savedStatus}`} aria-live="polite">
          {/* 결과를 먼저 크게: 별이 켜짐 + 한 줄 응원. 주 버튼은 하나만 (다음 걸음은 아래 보조 카드) */}
          <span className="record-done-star" aria-hidden="true"><StatusStar status={savedStatus} /></span>
          <h2>{savedStatus === 'bright' ? '별을 땄어요' : '손을 뻗은 별로 남았어요'}</h2>
          <p className="record-done-cheer">{saved}</p>
          {savedNote && <p className="record-done-note">“{savedNote}”</p>}
          {busy ? <p role="status" className="small">밤하늘을 다시 읽고 있어요…</p> : (
            <Link className="primary" href={completionHref ?? `/sky?memory=${star.starId}`}>
              {completionHref ? '별자리 완성 보기' : '내 밤하늘에서 보기'}
            </Link>
          )}
          <p className="record-done-meta">{mode === 'example' ? '가상 기록을 이 브라우저에 저장했어요.' : 'AI가 만든 응원은 틀릴 수 있어요.'}</p>
        </section>
      : questBlocked
      ? <p className="error star-limit-error">{DAILY_STAR_LIMIT_MESSAGE}</p>
      : <section className="card record-form" aria-labelledby="record-question">
          {/* ① 먼저 하나만 고르기 → ② 남기고 싶으면 한 줄·사진 → ③ 고른 것에 맞춘 저장 버튼 */}
          <h2 id="record-question">오늘 이 별, 어땠나요?</h2>
          <p className="record-hint">어느 쪽이든 내 하늘에 남아요.</p>
          <div className="record-choices" role="radiogroup" aria-labelledby="record-question">
            {([['bright', '하늘의 별 따기', '해냈어요'], ['dim', '손 뻗어 보기', '시도해 봤어요']] as const).map(([v, l, sub]) =>
              <button key={v} type="button" role="radio" aria-checked={status === v} className={`secondary record-choice ${v}`} disabled={busy} onClick={() => setStatus(v)}>
                <span className="record-choice-star" aria-hidden="true"><StatusStar status={v} /></span>
                <b>{l}</b><small>{sub}</small>
              </button>)}
          </div>
          {status === 'dim' && <div className="record-reasons">
            {/* 기본 드롭다운 대신 앱 공통 반투명 드롭다운. 안 골라도 되고, 고른 뒤에도 "말하지 않을래요"로 되돌릴 수 있음 */}
            <GlassSelect<string | null> label="어떤 점이 어려웠나요? (선택)" value={reason || null} disabled={busy}
              onChange={v => setReason(v ?? '')}
              options={[{ value: null, label: '말하지 않아도 괜찮아요' }, ...REASONS.map(([v, l]) => ({ value: v, label: l }))]} />
            <p className="record-reasons-hint">다음 걸음을 고를 때 참고해요.</p>
          </div>}

          {weatherStar && <fieldset className="star-weather" disabled={busy}>
            <legend>지금 마음에 가까운 날씨</legend>
            <p className="small">골라도, 안 골라도 괜찮아요. 같은 날씨를 한 번 더 누르면 풀려요.</p>
            <div className="star-weather-options">{Object.entries(weatherNames).map(([code, name]) => <button key={code} type="button" className="secondary"
              aria-pressed={weather === code} onClick={() => setWeather(w => w === code ? null : code)}>{name}</button>)}</div>
          </fieldset>}
          <h3 className="record-sub">남기고 싶다면 <span className="record-optional">선택</span></h3>
          <label className="record-field"><span className="sr-only">오늘을 기억할 한 줄</span><textarea disabled={busy} maxLength={lineMax} rows={2} value={reflection} onChange={e => setReflection(e.target.value.slice(0, lineMax))} placeholder="오늘을 기억할 한 줄 (비워 두어도 괜찮아요)" /></label>
          {photo
            ? <div className="record-photo"><img className="photo-preview" src={photo} alt="선택한 사진"/><button type="button" className="text-button" disabled={busy||photoBusy} onClick={()=>setPhoto(undefined)}>사진 빼기</button></div>
            : <fieldset className="photo-picker record-photo-picker" disabled={busy || photoBusy}>
                <legend className="sr-only">사진 남기기</legend>
                <label>앨범에서 사진<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto}/></label>
                <label>카메라로 찍기<input type="file" accept="image/*" capture="environment" onChange={choosePhoto}/></label>
              </fieldset>}
          {photoError && <p role="alert">{photoError}</p>}
          {outside && <details>
            <summary>위치로 도착 확인 (선택)</summary>
            <p className="small">기기 좌표는 저장하지 않아요. 목표 장소 연동 전이라 지금은 직접 도착 기록으로 저장해요.</p>
            <button type="button" className="secondary" onClick={() => {
              if (!navigator.geolocation) { setPlace('위치를 지원하지 않아요. 직접 도착 기록을 사용해 주세요.'); return; }
              navigator.geolocation.getCurrentPosition(() => setPlace('위치를 사용할 수 있어요. 현재는 직접 기록으로 남겨요.'), () => setPlace('위치를 사용할 수 없어요. 직접 기록으로 남겨요.'));
            }}>위치 사용 확인</button>
            {place && <p role="status" className="small">{place}</p>}
          </details>}
          {!planLoaded && <p className="small" role="status">지난 기록을 확인하고 있어요. 확인이 끝나면 저장할 수 있어요.</p>}
          {status === null && <p className="small" role="status">해냈는지, 시도해 봤는지 먼저 골라 주세요.</p>}
          <button className="record-save" disabled={busy || photoBusy || !planLoaded || status === null} onClick={() => run(async () => {
            if (status === null) return;
            const text = [weatherText, reflection.trim()].filter(Boolean).join(' · ').slice(0, 300);
            const r = await client(mode).attempt({ photo, requestId, starId: star.starId, status, reflection: text, verifyMethod: 'self',
              ...(activePlan ? { parentAttemptId: activePlan.attemptId, subQuestId: activePlan.subQuestId } : {}),
              ...(status === 'dim' && reason ? { stopReason: reason } : {}) });
            onHelp(r.help);
            setSavedStatus(status); setSavedNote(reflection.trim());
            setSaved(r.cheer || '당신의 하늘에 기록을 남겼어요.');
            const href = await onSaved(r);
            if (href) {
              setCompletionHref(href);
              if (!r.help) router.replace(href);
            } else {
              setSavedAttemptId(r.attemptId);
            }
          })}>{busy ? '기록을 담는 중…' : status === 'bright' ? '별 따서 담기' : status === 'dim' ? '손 뻗은 별로 담기' : '이 순간 담기'}</button>
        </section>}

    {savedAttemptId !== null && <NextStepCard key={savedAttemptId} mode={mode} attemptId={savedAttemptId} busy={busy} run={run} onHelp={onHelp} />}

    {star.memories.length > 0 && <Section id="star-memories" title="이 별과의 기억">
      <ul className="memory-list">{[...star.memories].reverse().map(m => <li key={m.attemptId}>
        <time dateTime={m.date}>{memoryDate(m.date)}</time>
        {m.customTitle && <p className="small">작게 만난 별 · {m.customTitle}</p>}
        <p>{m.reflection || '말없이 남긴 작은 시도'}</p>
      </li>)}</ul>
    </Section>}
  </>;
}
