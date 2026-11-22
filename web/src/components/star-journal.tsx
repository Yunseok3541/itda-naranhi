"use client";
// 별 일기 (/journal): 내가 남긴 별 기록을 하루씩 모아 다시 보는 곳 (체크인과 별 시도를 날짜별로 모아 보기)
// - 위: 밤하늘 달력. 기록한 날만 별이 켜짐 (해낸 별 = 금빛, 손 뻗은 별만 = 희미한 별, 사진 = 작은 점)
//   기록 없는 날은 숫자만. "N일 연속"·빈 날 표시·달성률은 넣지 않음 (매일 오지 않아도 된다는 원칙)
// - 아래: 그 달의 하루 카드 (별·상태·한 줄·사진). 달력의 날을 누르면 그날 카드로
// - 다시 꺼내 보는 카드: 일주일 전 오늘 / 처음 딴 별
// - 골라 보기: 전체 · 해낸 별 · 손 뻗은 별 · 사진
// 날짜는 한국 시간 기준 (record-date.ts와 같은 기준)
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { client, weatherNames, type Mode } from '@/lib/mobile-data';
import { ScreenBar, Summary } from './screen-kit';
import { StatusStar } from './star-list';
import SkyControlIcon from './sky-control-icon';
import './star-journal.css';

type Entry = {
  id: number; title: string; status: 'bright' | 'dim' | 'checkin';
  reflection: string | null; photo: string | null; constellation: string | null;
  day: string; recordedAt: string; weather?: string;
};
type Filter = 'all' | 'bright' | 'dim' | 'photo';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' }, { value: 'bright', label: '해낸 별' }, { value: 'dim', label: '손 뻗은 별' }, { value: 'photo', label: '사진' },
];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 한국 시간 날짜 'YYYY-MM-DD' (기록 날짜가 날짜만이면 그대로) */
const kst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
function dayKey(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '' : kst.format(date);
}
const monthOf = (day: string) => day.slice(0, 7);
function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function addDays(day: string, by: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const dayLabel = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`;
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;

export default function StarJournal({ mode }: { mode: Mode }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [checkinsFailed, setCheckinsFailed] = useState(false);
  const [photosFailed, setPhotosFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const today = dayKey(new Date());
  const [month, setMonth] = useState(monthOf(today));
  const [filter, setFilter] = useState<Filter>('all');
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const initializedMonth = useRef(false);

  useEffect(() => {
    let active = true;
    const api = client(mode);
    Promise.all([api.sky(), api.memoryPhotos().catch(() => null), api.journalCheckins().catch(() => null)])
      .then(([sky, photos, journal]) => {
        if (!active) return;
        setPhotosFailed(photos === null);
        setCheckinsFailed(journal === null);
        const photoOf = new Map((photos ?? []).map(p => [p.id, p.src]));
        const attempts: Entry[] = sky.stars.flatMap(star => star.memories.map(m => ({
          id: m.attemptId, title: m.customTitle || star.title,
          status: m.status === 'dim' ? 'dim' as const : 'bright' as const,
          reflection: m.reflection?.trim() || null, photo: m.photo ?? photoOf.get(m.attemptId) ?? null,
          constellation: star.constellationName ?? null, day: dayKey(m.date), recordedAt: m.recordedAt ?? m.date,
        })));
        const checkins: Entry[] = (journal?.checkins ?? []).map(checkin => ({
          id: checkin.id, title: '오늘의 한 줄', status: 'checkin', reflection: checkin.text,
          photo: null, constellation: null, day: dayKey(checkin.date), recordedAt: checkin.date, weather: checkin.weather,
        }));
        const list = [...attempts, ...checkins].filter(entry => entry.day).sort((a, b) =>
          b.day.localeCompare(a.day) || Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id - b.id,
        );
        setError('');
        setEntries(list);
        // 이번 달에 기록이 없으면 가장 최근 기록이 있는 달부터
        if (!initializedMonth.current && list.length && !list.some(e => monthOf(e.day) === monthOf(today))) {
          setMonth(monthOf(list[0].day));
        }
        initializedMonth.current = true;
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [mode, today, retry]);

  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries ?? []) map.set(e.day, [...(map.get(e.day) ?? []), e]);
    return map;
  }, [entries]);
  const firstMonth = entries?.length ? monthOf(entries[entries.length - 1].day) : monthOf(today);
  const lastMonth = monthOf(today);

  const [filteredDay, setFilteredDay] = useState<string | null>(null);
  const matchesFilter = (entry: Entry) => filter === 'all' || (filter === 'photo' ? !!entry.photo : entry.status === filter);
  const monthEntries = (entries ?? []).filter(e => monthOf(e.day) === month);
  const shown = monthEntries.filter(matchesFilter);
  const shownDays = [...new Set(shown.map(e => e.day))];
  const recordDays = new Set(monthEntries.map(e => e.day));

  // 다시 꺼내 보는 카드: 일주일 전 오늘 → 없으면 처음 딴 별 (한 장만)
  const recall = useMemo(() => {
    const weekAgo = byDay.get(addDays(today, -7));
    // 한 줄이나 사진이 남은 기록을 먼저 (다시 꺼내 볼 거리가 있는 것)
    if (weekAgo?.length) return { kind: '일주일 전 오늘', entry: weekAgo.find(e => e.reflection || e.photo) ?? weekAgo[0] };
    const first = (entries ?? []).filter(e => e.status === 'bright').sort((a, b) => a.day.localeCompare(b.day) || Date.parse(a.recordedAt) - Date.parse(b.recordedAt))[0];
    return first && first.day !== today ? { kind: '처음 딴 별', entry: first } : null;
  }, [byDay, entries, today]);

  function openDay(day: string, showAll = false) {
    setMonth(monthOf(day));
    const matching = showAll || byDay.get(day)?.some(matchesFilter);
    if (showAll) setFilter('all');
    setFilteredDay(matching ? null : day);
    setFocusDay(day);
    requestAnimationFrame(() => {
      const target = document.getElementById(matching ? `journal-${day}` : 'journal-filtered-day');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
    window.setTimeout(() => setFocusDay(current => current === day ? null : current), 1800);
  }
  function goMonth(next: string) {
    setMonth(next);
    setFilteredDay(null);
    setFocusDay(null);
  }
  // 달력 안 화살표로 기록한 날 사이를 옮겨 다님
  function onCalendarKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const buttons = [...(calendar.current?.querySelectorAll<HTMLButtonElement>('button.journal-day') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)];
    next?.focus();
  }

  // 달력 칸 (일요일 시작)
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = weekday(`${month}-01`);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const brightCount = monthEntries.filter(e => e.status === 'bright').length;
  const dimCount = monthEntries.filter(e => e.status === 'dim').length;

  return <div className="star-journal">
    <ScreenBar title="별 일기" back="/profile" backLabel="프로필로 돌아가기" />
    {error && <p className="error" role="alert">{error}</p>}
    {!entries && !error && <p className="small" role="status">기록을 불러오고 있어요.</p>}

    {checkinsFailed && <p className="small" role="status">오늘의 한 줄을 불러오지 못했어요. <button className="text-button" type="button" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button></p>}
    {photosFailed && <section className="card">
      <p role="status">사진을 불러오지 못했어요. 날짜별 별 기록은 볼 수 있어요.</p>
      <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>사진 다시 불러오기</button>
    </section>}

    {entries && entries.length === 0 && <section className="card journal-empty">
      <StatusStar status="untried" />
      <h2>아직 남긴 기록이 없어요</h2>
      <p>별을 따거나 손을 뻗으면 여기에 하루씩 쌓여요. 오고 싶은 날 와도 괜찮아요.</p>
      <Link className="secondary" href="/sky">내 밤하늘로</Link>
    </section>}

    {entries && entries.length > 0 && <>
      {recall && <section className="journal-recall" aria-label={`다시 꺼내 보기: ${recall.kind}`}>
        <p className="journal-recall-kind">{recall.entry.status === 'checkin' ? <SkyControlIcon name="moon" /> : <StatusStar status={recall.entry.status} />}{recall.kind} · {dayLabel(recall.entry.day)}</p>
        <p className="journal-recall-title">{recall.entry.title}</p>
        {recall.entry.reflection && <p className="journal-recall-note">“{recall.entry.reflection}”</p>}
        <button type="button" className="text-button" onClick={() => openDay(recall.entry.day)}>그날 기록 보기</button>
      </section>}

      <section className="journal-calendar" aria-label="별 일기 달력">
        <header className="journal-month">
          <button type="button" className="text-button journal-month-nav" aria-label="지난 달" disabled={month <= firstMonth} onClick={() => goMonth(shiftMonth(month, -1))}>‹</button>
          <h2 aria-live="polite">{monthLabel(month)}</h2>
          <button type="button" className="text-button journal-month-nav" aria-label="다음 달" disabled={month >= lastMonth} onClick={() => goMonth(shiftMonth(month, 1))}>›</button>
        </header>
        <div className="journal-week" aria-hidden="true">{WEEK.map(d => <span key={d}>{d}</span>)}</div>
        <div className="journal-days" ref={calendar} onKeyDown={onCalendarKey}>
          {cells.map((day, i) => {
            if (!day) return <span key={`blank-${i}`} className="journal-cell blank" aria-hidden="true" />;
            const list = byDay.get(day) ?? [];
            const bright = list.filter(e => e.status === 'bright').length;
            const dim = list.filter(e => e.status === 'dim').length;
            const notes = list.filter(e => e.status === 'checkin').length;
            const photos = list.filter(e => e.photo).length;
            const isToday = day === today;
            const number = Number(day.slice(8));
            if (!list.length) return <span key={day} className={`journal-cell${isToday ? ' today' : ''}`}>
              <span className="journal-num">{number}</span>{isToday && <span className="sr-only">, 오늘</span>}
            </span>;
            const glow = Math.min(3, bright);
            const label = [`${dayLabel(day)}${isToday ? ', 오늘' : ''}`, bright && `해낸 별 ${bright}개`, dim && `손 뻗은 별 ${dim}개`, photos && `사진 ${photos}장`, notes && `오늘의 한 줄 ${notes}개`].filter(Boolean).join(', ');
            return <button key={day} type="button" aria-label={label}
              className={`text-button journal-cell journal-day${isToday ? ' today' : ''}${focusDay === day ? ' selected' : ''}`}
              data-glow={glow || undefined} onClick={() => openDay(day)}>
              <span className="journal-num" aria-hidden="true">{number}</span>
              <span className="journal-mark" aria-hidden="true">{bright || dim ? <StatusStar status={bright ? 'bright' : 'dim'} /> : <SkyControlIcon name="moon" />}</span>
              {photos > 0 && <span className="journal-photo-dot" aria-hidden="true" />}
            </button>;
          })}
        </div>
        <p className="journal-legend" aria-hidden="true">
          <span><StatusStar status="bright" />해낸 별</span>
          <span><StatusStar status="dim" />손 뻗은 별</span>
          <span><i className="journal-photo-dot" />사진</span>
          <span><SkyControlIcon name="moon" />오늘의 한 줄</span>
        </p>
      </section>

      <Summary label={`${monthLabel(month)} 기록`} items={[
        { value: recordDays.size, label: '기록한 날' },
        { value: brightCount, label: '해낸 별' },
        { value: dimCount, label: '손 뻗은 별' },
      ]} />

      <div className="journal-filters" role="group" aria-label="골라 보기">
        {FILTERS.map(f => <button key={f.value} type="button" className="secondary" aria-pressed={filter === f.value} onClick={() => { setFilter(f.value); setFilteredDay(null); }}>{f.label}</button>)}
      </div>

      {filteredDay && <section className="card journal-none" id="journal-filtered-day" tabIndex={-1}>
        <p>{dayLabel(filteredDay)} · {filter === 'photo'
          ? photosFailed ? '사진을 아직 불러오지 못했어요.' : '이날은 남긴 사진이 없어요.'
          : '이날은 고른 종류의 기록이 없어요.'}</p>
        <button type="button" className="secondary" onClick={() => openDay(filteredDay, true)}>이날 전체 기록 보기</button>
      </section>}
      {shownDays.length === 0 && !filteredDay && <p className="card journal-none">
        {filter === 'photo' && photosFailed ? '사진을 불러오면 이달의 사진을 확인할 수 있어요.' : monthEntries.length ? '이 달에는 고른 기록이 없어요.' : '이 달에는 남긴 기록이 없어요. 쉬어 간 달도 괜찮아요.'}
      </p>}

      <ol className="journal-list">
        {shownDays.map(day => <li key={day} id={`journal-${day}`} tabIndex={-1} className={`journal-entry-day${focusDay === day ? ' focused' : ''}`}>
          <h3><time dateTime={day}>{dayLabel(day)}</time> <span>({WEEK[weekday(day)]})</span></h3>
          <ul className="card journal-entries">
            {shown.filter(e => e.day === day).map(e => <li key={`${e.status === 'checkin' ? 'checkin' : 'star'}-${e.id}`}>
              <span className="journal-entry-star">{e.status === 'checkin' ? <SkyControlIcon name="moon" /> : <StatusStar status={e.status} />}</span>
              <div className="journal-entry-text">
                <b>{e.title}</b>
                {e.status === 'checkin'
                  ? e.weather && <small>마음 날씨 · {weatherNames[e.weather] ?? e.weather}</small>
                  : <small><span className={`journal-entry-status ${e.status}`}>{e.status === 'bright' ? '해냈어요' : '시도해 봤어요'}</span>{e.constellation && ` · ${e.constellation}`}</small>}
                {e.reflection && <p>“{e.reflection}”</p>}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.photo && <img className="journal-photo" src={e.photo} alt={`${e.title}에 남긴 사진`} loading="lazy" />}
              </div>
            </li>)}
          </ul>
        </li>)}
      </ol>
    </>}
  </div>;
}
