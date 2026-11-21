"use client";
// 별 기록: 하늘의 별 따기 / 손 뻗어 보기 + 회고 한 줄, 이 별과의 기억. 공통 틀은 screen-kit.tsx
// - 대표 영역: 별(상태별 빛) + 별 이름 + 별자리·상태 칩
// - 요약 칸은 넣지 않음
// - 부가 기능: 위치로 도착 확인(바깥 별)은 접어 둠
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { client, isGpsStar, type Help, type Mode, type Star } from '@/lib/mobile-data';
import { getActivityConstellation, getStarConstellationId } from '@/lib/constellations';
import { DAILY_STAR_LIMIT_MESSAGE } from '@/lib/star-limit';
import { starDisplayDescription, starDisplayTitle } from '@/lib/star-display';
import { Hero, HeroIcon, ScreenBar, Section } from './screen-kit';
import { NextStepCard } from './next-step-card';
import { StatusStar } from './star-list';
import type { NextPlan } from '@/lib/next-step';

const STATUS = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;
const REASONS = [['crowded', '사람이 많았어요'], ['weather', '날씨·상황이 안 맞았어요'], ['tired', '몸·마음이 힘들었어요'], ['no_time', '시간이 없었어요'], ['not_for_me', '나랑 안 맞았어요'], ['cost', '돈이 들어서요'], ['other', '기타']] as const;
const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
const memoryDate = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : koreanDate.format(d); };
const constellationName = (s: Star) => s.constellationName ?? getActivityConstellation(getStarConstellationId(s))?.name;

export default function StarScreen({ mode, star, dailyLimitReached, busy, run, onHelp, onSaved }: {
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
  const [status, setStatus] = useState<'dim' | 'bright'>('bright');
  const [reason, setReason] = useState('');
  const [reflection, setReflection] = useState('');
  const [saved, setSaved] = useState('');
  const [completionHref, setCompletionHref] = useState<string>();
  const [place, setPlace] = useState('');
  const [savedAttemptId, setSavedAttemptId] = useState<number | null>(null);
  const [pending, setPending] = useState<NextPlan | null>(null);
  const [usingPlan, setUsingPlan] = useState(true);
  const [planError, setPlanError] = useState('');
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planRetry, setPlanRetry] = useState(0);
  useEffect(() => {
    let active = true;
    client(mode).pendingNext().then(r => {
      if (active) { setPending(r.plan?.starId === star?.starId ? r.plan : null); setPlanError(''); }
    }).catch(() => { if (active) setPlanError('지난번에 고른 행동을 확인하지 못했어요. 다시 확인하거나 원래 별로 기록할 수 있어요.'); })
      .finally(() => { if (active) setPlanLoaded(true); });
    return () => { active = false; };
  }, [mode, star?.starId, planRetry]);
  const activePlan = usingPlan ? pending : null;

  if (!star) return <>
    <ScreenBar title="별 기록" />
    <Hero visual={<HeroIcon tone="dim"><StatusStar status="untried" /></HeroIcon>} title="별을 찾고 있어요" message="별을 불러오지 못했거나 없는 주소예요." />
    <section className="card"><Link className="secondary" href="/sky">밤하늘로 돌아가기</Link><button disabled={busy} onClick={() => run(async () => { await onSaved(); })}>다시 불러오기</button></section>
  </>;

  // GPS(도착 확인) 별: 실제 API는 verifyType, 예시 모드만 예시 목록의 16·17 (별 ID는 시드마다 바뀜)
  const outside = isGpsStar(star);
  const questBlocked = dailyLimitReached && star.status !== 'bright';
  return <>
    <ScreenBar title="별 기록" />
    <Hero
      visual={<HeroIcon tone={star.status === 'untried' ? 'dim' : 'gold'}><StatusStar status={star.status} /></HeroIcon>}
      title={starDisplayTitle(activePlan?.title ?? star.title)}
      message={activePlan?.subQuestId ? `원래 별 · ${star.title}` : star.description && starDisplayDescription(star.description)}
      chip={[constellationName(star), STATUS[star.status]].filter(Boolean).join(' · ')}
    />

    {!saved && !questBlocked && planError && <section className="card"><p role="alert">{planError}</p>
      <button type="button" onClick={() => setPlanRetry(n => n + 1)}>이어갈 행동 다시 확인</button></section>}
    {!saved && !questBlocked && pending && <section className="card next-step-active">
      <h2>지난번에 골라 둔 한 걸음</h2><p>{pending.title}</p>
      <p className="small">{usingPlan ? '이 활동의 결과를 지난 시도와 이어서 기록해요.' : '지금은 원래 별의 활동을 기록해요.'}</p>
      {pending.preparationHref && <Link className="secondary" href={pending.preparationHref}>문의 문장 준비하기</Link>}
      <button type="button" className="text-button" disabled={busy} onClick={() => setUsingPlan(v => !v)}>{usingPlan ? '이번에는 원래 별로 기록하기' : '골라 둔 활동으로 이어가기'}</button>
    </section>}
    {saved
      ? <section className="card saved">
          <h2>오늘의 순간을 담았어요</h2>
          <p>{saved}</p>
          <p className="small">{mode === 'example' ? '가상 기록을 이 브라우저에 저장했어요.' : 'AI가 만든 응원은 틀릴 수 있어요.'}</p>
          {busy ? <p role="status">밤하늘을 다시 읽고 있어요…</p> : (
            <Link className="primary" href={completionHref ?? `/sky?memory=${star.starId}`}>
              {completionHref ? '별자리 완성 보기' : '내 밤하늘에서 기억 보기'}
            </Link>
          )}
        </section>
      : questBlocked
      ? <p className="error star-limit-error">{DAILY_STAR_LIMIT_MESSAGE}</p>
      : <section className="card">
          <h2>오늘의 기록</h2>
          <p>해낸 만큼, 혹은 손을 뻗은 만큼.<br />어느 쪽이든 소중한 오늘의 기록이에요.</p>
          <div className="choices">{([['bright', '하늘의 별 따기', '해냈어요'], ['dim', '손 뻗어 보기', '시도해 봤어요']] as const).map(([v, l, sub]) =>
            <button key={v} type="button" className="secondary choice-with-sub" disabled={busy} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}<small>{sub}</small></button>)}</div>
          {status === 'dim' && <label>어떤 점이 어려웠나요? (선택)<select value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">말하지 않아도 괜찮아요</option>
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>}
          <label>오늘을 기억할 한 줄<textarea disabled={busy} maxLength={300} value={reflection} onChange={e => setReflection(e.target.value)} placeholder="짧게 적어도, 비워 두어도 괜찮아요" /></label>
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
          <button disabled={busy || !planLoaded} onClick={() => run(async () => {
            const r = await client(mode).attempt({ starId: star.starId, status, reflection, verifyMethod: 'self',
              ...(activePlan ? { parentAttemptId: activePlan.attemptId, subQuestId: activePlan.subQuestId } : {}),
              ...(status === 'dim' && reason ? { stopReason: reason } : {}) });
            onHelp(r.help);
            setSaved(r.cheer || '당신의 하늘에 기록을 남겼어요.');
            const href = await onSaved(r);
            if (href) {
              setCompletionHref(href);
              if (!r.help) router.replace(href);
            } else {
              setSavedAttemptId(r.attemptId);
            }
          })}>{busy ? '기록을 담는 중…' : '이 순간 저장하기'}</button>
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
