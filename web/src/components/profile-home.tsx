"use client";
// 나의 프로필 (시안 구성: 프로필 사진 · 이름 · 숫자 3칸 · 나의 별자리 도감 · 배지 · 활동 기록 · 설정 ⚙)
// 원칙에 맞춰 바꾼 것 (고민기록 #1·#3, 메인 캐릭터 교체와 같은 방향)
// - 레벨(Lv.) 대신 "지금 걷는 별자리"
// - 숫자는 해낸 것만 세지 않고 "손을 뻗은 별"도 함께
// - 프로필 사진은 성별이 드러나지 않는 메인 캐릭터 또는 도감 캐릭터 중에서 고름 (이 브라우저에만 저장)
// - 시작 질문·정책 신청 정보 입력은 설정(⚙) 안으로 (주소 끝 #settings로 바로 열 수 있음)
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { characters } from '@/app/catalog/characters';
import { client, type Mode, type Star } from '@/lib/mobile-data';
import { evaluate, NO_FACTS, type MilestoneFacts } from '@/lib/milestones';
import { groupStars, latestGroupIndex } from './night-sky';
import { ProfileScreen } from './profile-form';
import SkyPerson from './sky-person';
import './profile-home.css';

const AVATAR_KEY = 'naranhi-avatar';
const DEFAULT_AVATAR = 'person';

function Avatar({ id, size = 96 }: { id: string; size?: number }) {
  const c = characters.find(x => x.id === id);
  return <span className="avatar" style={{ width: size, height: size }}>
    {c
      ? <img src={`/catalog/${c.id}.webp`} alt="" />  // eslint-disable-line @next/next/no-img-element
      : <span className="avatar-person"><SkyPerson /></span>}
  </span>;
}

const shortDate = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${Number(m[2])}.${Number(m[3])}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}.${d.getDate()}`;
};

export default function ProfileHome({ mode }: { mode: Mode }) {
  // 주소가 /profile#settings면 설정부터 (정책 화면의 "추천 기준 바꾸기"에서 옴). 이 화면은 브라우저에서만 그려짐
  const [settings, setSettings] = useState(() => typeof window !== 'undefined' && window.location.hash === '#settings');
  const [stars, setStars] = useState<Star[] | null>(null);
  const [facts, setFacts] = useState<MilestoneFacts>(NO_FACTS);
  const [avatar, setAvatar] = useState(() => {
    try { return (typeof window !== 'undefined' && localStorage.getItem(AVATAR_KEY)) || DEFAULT_AVATAR; } catch { return DEFAULT_AVATAR; }
  });
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    client(mode).sky().then(r => { if (active) setStars(r.stars); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.'); });
    client(mode).milestones().then(f => { if (active) setFacts(f); }).catch(() => { /* 배지를 못 불러와도 나머지는 보여 줌 */ });
    return () => { active = false; };
  }, [mode]);

  function chooseAvatar(id: string) {
    setAvatar(id);
    setPicking(false);
    try { localStorage.setItem(AVATAR_KEY, id); } catch { /* 저장 못 해도 지금 화면에는 반영 */ }
  }

  const groups = useMemo(() => groupStars(stars ?? []), [stars]);
  const counts = useMemo(() => ({
    bright: (stars ?? []).filter(s => s.status === 'bright').length,
    dim: (stars ?? []).filter(s => s.status === 'dim').length,
    met: groups.filter(g => g.stars.some(s => s.status !== 'untried')).length,
  }), [stars, groups]);
  const walking = useMemo(() => {
    const open = groups.filter(g => !g.stars.every(s => s.status === 'bright'));
    if (!groups.length) return null;
    if (!open.length) return '모든 별자리를 완성했어요';
    const recent = latestGroupIndex(open);
    return `지금 걷는 별자리 · ${(open[recent] ?? open[0]).name}`;
  }, [groups]);
  const badges = useMemo(() => evaluate(facts), [facts]);
  const earned = badges.filter(b => b.earned);
  const waiting = badges.filter(b => !b.earned);
  const records = useMemo(() => (stars ?? [])
    .flatMap(s => s.memories.map(m => ({ ...m, title: s.title })))
    .sort((a, b) => `${b.date}|${String(b.attemptId).padStart(16, '0')}`.localeCompare(`${a.date}|${String(a.attemptId).padStart(16, '0')}`))
    .slice(0, 5), [stars]);

  if (settings) return <>
    <div className="profile-bar">
      <button type="button" className="profile-icon" aria-label="프로필로 돌아가기" onClick={() => { setSettings(false); history.replaceState(null, '', '/profile'); }}>‹</button>
      <h1>설정</h1>
      <span className="profile-icon" aria-hidden="true" />
    </div>
    <ProfileScreen mode={mode} />
  </>;

  return <div className="profile-home">
    <div className="profile-bar">
      <span className="profile-icon" aria-hidden="true" />
      <h1>나의 프로필</h1>
      <button type="button" className="profile-icon" aria-label="설정 (시작 질문·정책 신청 정보)" onClick={() => setSettings(true)}>⚙</button>
    </div>

    <section className="profile-hero">
      <button type="button" className="avatar-button" aria-label="프로필 그림 바꾸기" onClick={() => setPicking(p => !p)}>
        <Avatar id={avatar} />
        <span className="avatar-edit" aria-hidden="true">✎</span>
      </button>
      <h2>별을 바라보는 사람</h2>
      <p>나만의 밤하늘을 만들어 가는 중 <span aria-hidden="true">✨</span></p>
      {walking && <span className="profile-chip">{walking}</span>}
    </section>

    {picking && <section className="card avatar-picker" aria-label="프로필 그림 고르기">
      <h3>프로필 그림 고르기</h3>
      <div className="avatar-grid">
        {[DEFAULT_AVATAR, ...characters.map(c => c.id)].map(id => <button key={id} type="button"
          className={`avatar-option${id === avatar ? ' chosen' : ''}`} aria-pressed={id === avatar}
          aria-label={id === DEFAULT_AVATAR ? '기본 캐릭터' : characters.find(c => c.id === id)?.nickname}
          onClick={() => chooseAvatar(id)}>
          <Avatar id={id} size={56} />
          <small>{id === DEFAULT_AVATAR ? '기본' : characters.find(c => c.id === id)?.nickname}</small>
        </button>)}
      </div>
      <p className="small">이 브라우저에만 저장돼요.</p>
    </section>}

    {error && <p className="error" role="alert">{error}</p>}

    <section className="profile-stats" aria-label="나의 기록">
      <div><strong>{counts.bright}</strong><span>딴 별</span></div>
      <div><strong>{counts.dim}</strong><span>손을 뻗은 별</span></div>
      <div><strong>{counts.met}</strong><span>만난 별자리</span></div>
    </section>

    <section aria-labelledby="profile-catalog">
      <h2 id="profile-catalog" className="profile-section">나의 별자리 도감</h2>
      <div className="profile-strip">
        {groups.map(g => {
          const c = characters.find(x => x.constellation.name === g.name);
          const done = g.stars.length > 0 && g.stars.every(s => s.status === 'bright');
          const met = g.stars.some(s => s.status !== 'untried');
          return <Link key={g.id} href="/catalog" className={`strip-item${done ? ' done' : met ? ' met' : ' yet'}`}
            aria-label={`${g.name}${c ? ` ${c.nickname}` : ''}, ${done ? '완성' : met ? '만나는 중' : '아직 만나기 전'}`}>
            {c ? <img src={`/catalog/${c.id}.webp`} alt="" /> /* eslint-disable-line @next/next/no-img-element */ : <span aria-hidden="true">✦</span>}
            <small>{done ? '완성' : met ? '만나는 중' : '아직'}</small>
          </Link>;
        })}
        <Link href="/catalog" className="strip-more"><span aria-hidden="true">+</span>더 보기</Link>
      </div>
    </section>

    <section aria-labelledby="profile-badges">
      <h2 id="profile-badges" className="profile-section">나의 배지</h2>
      {earned.length
        ? <div className="badge-grid">{earned.map(b => <div key={b.id} className="badge earned">
            <span className="badge-icon" aria-hidden="true">{b.icon}</span><strong>{b.name}</strong><small>{b.done}</small>
          </div>)}</div>
        : <p className="small">아직 받은 배지가 없어요. 작은 별 하나부터 천천히 시작해도 괜찮아요.</p>}
      {waiting.length > 0 && <details className="badge-waiting">
        <summary>아직 만나지 않은 배지 {waiting.length}개</summary>
        <div className="badge-grid">{waiting.map(b => <div key={b.id} className="badge">
          <span className="badge-icon" aria-hidden="true">{b.icon}</span><strong>{b.name}</strong><small>{b.hint}</small>
        </div>)}</div>
      </details>}
    </section>

    <section aria-labelledby="profile-log">
      <h2 id="profile-log" className="profile-section">나의 활동 기록</h2>
      {records.length
        ? <ul className="profile-log">{records.map(r => <li key={r.attemptId}>
            <span className="log-icon" aria-hidden="true">{r.status === 'dim' ? '☆' : '✦'}</span>
            <span className="log-text">{r.title}{r.reflection ? <small>{r.reflection}</small> : null}</span>
            <time dateTime={r.date}>{shortDate(r.date)}</time>
          </li>)}</ul>
        : <p className="small">별을 기록하면 여기에 그날의 기억이 쌓여요.</p>}
    </section>
  </div>;
}
