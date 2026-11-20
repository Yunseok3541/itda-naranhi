"use client";
// 별 기록: 하늘의 별 따기 / 손 뻗어 보기 + 회고 한 줄, 이 별과의 기억. 공통 틀은 screen-kit.tsx
// - 대표 영역: 별(상태별 빛) + 별 이름 + 별자리·상태 칩
// - 요약 칸은 넣지 않음
// - 부가 기능: 위치로 도착 확인(바깥 별)은 접어 둠
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { client, type Help, type Mode, type Star } from '@/lib/mobile-data';
import { getActivityConstellation, getStarConstellationId } from '@/lib/constellations';
import { Hero, HeroIcon, ScreenBar, Section } from './screen-kit';

const STATUS = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;
const REASONS = [['crowded', '사람이 많았어요'], ['weather', '날씨·상황이 안 맞았어요'], ['tired', '몸·마음이 힘들었어요'], ['no_time', '시간이 없었어요'], ['not_for_me', '나랑 안 맞았어요'], ['cost', '돈이 들어서요'], ['other', '기타']] as const;
const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
const memoryDate = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? v : koreanDate.format(d); };
const constellationName = (s: Star) => s.constellationName ?? getActivityConstellation(getStarConstellationId(s))?.name;

export default function StarScreen({ mode, star, busy, run, onHelp, onSaved }: {
  mode: Mode;
  star: Star | undefined;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  onHelp: (help: Help) => void;
  /** Returns the celebration URL only when this save completed a constellation. */
  onSaved: (result?: { attemptId: number; status: string }) => Promise<string | undefined>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'dim' | 'bright'>('dim');
  const [reason, setReason] = useState('');
  const [reflection, setReflection] = useState('');
  const [saved, setSaved] = useState('');
  const [completionHref, setCompletionHref] = useState<string>();
  const [place, setPlace] = useState('');

  if (!star) return <>
    <ScreenBar title="별 기록" />
    <Hero visual={<HeroIcon tone="dim">✧</HeroIcon>} title="별을 찾고 있어요" message="별을 불러오지 못했거나 없는 주소예요." />
    <section className="card"><Link className="secondary" href="/sky">밤하늘로 돌아가기</Link><button disabled={busy} onClick={() => run(async () => { await onSaved(); })}>다시 불러오기</button></section>
  </>;

  const outside = star.verifyType === 'gps' || star.starId === 16 || star.starId === 17;
  return <>
    <ScreenBar title="별 기록" />
    <Hero
      visual={<HeroIcon tone={star.status === 'untried' ? 'dim' : 'gold'}>{star.status === 'bright' ? '✦' : star.status === 'dim' ? '✧' : '☆'}</HeroIcon>}
      title={star.title}
      message={star.description ?? undefined}
      chip={[constellationName(star), STATUS[star.status]].filter(Boolean).join(' · ')}
    />

    {saved
      ? <section className="card saved">
          <h2>오늘의 순간을 담았어요</h2>
          <p>{saved}</p>
          <p className="small">{mode === 'example' ? '가상 기록을 이 브라우저에 저장했어요.' : 'AI가 만든 응원은 틀릴 수 있어요.'}</p>
          {busy ? <p role="status">밤하늘을 다시 읽고 있어요…</p> : (
            <Link className="primary" href={completionHref ?? '/sky'}>
              {completionHref ? '별자리 완성 보기 →' : '내 밤하늘에서 기억 보기 →'}
            </Link>
          )}
        </section>
      : <section className="card">
          <h2>오늘의 기록</h2>
          <p>해낸 만큼, 혹은 손을 뻗은 만큼.<br />어느 쪽이든 소중한 오늘의 기록이에요.</p>
          <div className="choices">{([['bright', '하늘의 별 따기'], ['dim', '손 뻗어 보기']] as const).map(([v, l]) =>
            <button key={v} type="button" className="secondary" disabled={busy} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}</div>
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
          <button disabled={busy} onClick={() => run(async () => {
            const r = await client(mode).attempt({ starId: star.starId, status, reflection, verifyMethod: 'self', ...(status === 'dim' && reason ? { stopReason: reason } : {}) });
            onHelp(r.help);
            setSaved(r.cheer || '당신의 하늘에 기록을 남겼어요.');
            const href = await onSaved(r);
            if (href) {
              setCompletionHref(href);
              if (!r.help) router.replace(href);
            }
          })}>{busy ? '기록을 담는 중…' : '이 순간 저장하기'}</button>
        </section>}

    {star.memories.length > 0 && <Section id="star-memories" title="이 별과의 기억">
      <ul className="memory-list">{[...star.memories].reverse().map(m => <li key={m.attemptId}>
        <time dateTime={m.date}>{memoryDate(m.date)}</time>
        <p>{m.reflection || '말없이 남긴 작은 시도'}</p>
      </li>)}</ul>
    </Section>}
  </>;
}
