"use client";
// 나의 프로필 (시안 구성: 프로필 사진 · 이름 · 숫자 3칸 · 나의 별자리 도감 · 배지 · 활동 기록 · 설정 ⚙)
// 원칙에 맞춰 바꾼 것 (고민기록 #1·#3, 메인 캐릭터 교체와 같은 방향)
// - 레벨(Lv.) 대신 "지금 걷는 별자리"
// - 숫자는 해낸 것만 세지 않고 "손을 뻗은 별"도 함께
// - 프로필 사진은 기본 캐릭터 또는 획득한 도감 캐릭터 중에서 고름
// - 시작 질문·정책 신청 정보 입력은 설정(⚙) 안으로 (주소 끝 #settings로 바로 열 수 있음)
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { characters } from '@/app/catalog/characters';
import { client, type Mode, type ProfileAvatar, type Star } from '@/lib/mobile-data';
import { evaluate, NO_FACTS, type MilestoneFacts } from '@/lib/milestones';
import { groupStars, latestGroupIndex } from './night-sky';
import { ProfileScreen } from './profile-form';
import { useShop } from './use-shop';
import { Avatar, Hero, MoreLinks, ScreenBar, Section, Summary } from './screen-kit';
import './profile-home.css';

const DEFAULT_AVATAR = 'person';

const shortDate = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${Number(m[2])}.${Number(m[3])}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}.${d.getDate()}`;
};

export default function ProfileHome({ mode }: { mode: Mode }) {
  // 주소가 #settings로 끝나면 설정부터 열기. 이 화면은 브라우저에서만 그려짐
  const [settings, setSettings] = useState(() => typeof window !== 'undefined' && window.location.hash === '#settings');
  const [stars, setStars] = useState<Star[] | null>(null);
  const [facts, setFacts] = useState<MilestoneFacts>(NO_FACTS);
  const [avatarChoices, setAvatarChoices] = useState<ProfileAvatar | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatar = characters.find(character => character.constellationId === avatarChoices?.avatarConstellationId)?.id ?? DEFAULT_AVATAR;
  const { state: wardrobe } = useShop(mode);
  const [picking, setPicking] = useState(false);
  // 다른 화면으로 갔다 돌아오면 닫혀 있게 (cacheComponents로 숨겨진 화면도 상태가 남음, use-collapse-on-hide.ts 참고)
  useLayoutEffect(() => () => setPicking(false), []);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    client(mode).sky().then(r => { if (active) setStars(r.stars); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.'); });
    client(mode).milestones().then(f => { if (active) setFacts(f); }).catch(() => { /* 배지를 못 불러와도 나머지는 보여 줌 */ });
    client(mode).avatar().then(r => { if (active) setAvatarChoices(r); }).catch(e => { if (active) setAvatarError(e instanceof Error ? e.message : '프로필 그림을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [mode]);

  async function updateAvatar(id?: number | null) {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      const next = await (id === undefined ? client(mode).avatar() : client(mode).saveAvatar(id));
      setAvatarChoices(previous => ({ ...next, constellations: next.constellations ?? previous?.constellations ?? null }));
      if (id !== undefined) setPicking(false);
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : '프로필 그림을 저장하지 못했어요.');
    } finally { setAvatarBusy(false); }
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
    <ScreenBar title="설정" backLabel="프로필로 돌아가기" onBack={() => { setSettings(false); history.replaceState(null, '', '/profile'); }} />
    <ProfileScreen mode={mode} />
    {/* 처음 시작 안내를 다시 보기 (docs/온보딩.md) */}
    <MoreLinks><Link href="/sky?guide=1">나란히 사용 안내 다시 보기</Link></MoreLinks>
  </>;

  return <div className="profile-home">
    <ScreenBar title="나의 프로필" right={<button type="button" className="screen-icon" aria-label="설정 (시작 질문·정책 신청 정보)" onClick={() => setSettings(true)}><span aria-hidden="true">⚙</span><small aria-hidden="true">설정</small></button>} />

    <Hero
      visual={<button type="button" className="avatar-button" aria-label="프로필 그림 바꾸기" onClick={() => setPicking(p => !p)}>
        <Avatar id={avatar} item={wardrobe?.equipped} />
        <span className="avatar-edit" aria-hidden="true">✎</span>
      </button>}
      title="별을 바라보는 사람"
      message={<>나만의 밤하늘을 만들어 가는 중 <span aria-hidden="true">✨</span></>}
      chip={walking}
    />

    <Link className="secondary shop-entry" href="/shop">
      <span className="shop-entry-icon" aria-hidden="true">✦</span>
      <span>별빛 상점</span>
      <span className="shop-entry-arrow" aria-hidden="true">→</span>
    </Link>
    {picking && <section className="card avatar-picker" aria-label="프로필 그림 고르기">
      <h3>프로필 그림 고르기</h3>
      {avatarError && <p role="alert">{avatarError}</p>}
      {!avatarChoices && (avatarError
        ? <button type="button" disabled={avatarBusy} onClick={() => void updateAvatar()}>다시 불러오기</button>
        : <p role="status">프로필 그림을 불러오고 있어요.</p>)}
      {avatarChoices && <>
      <div className="avatar-grid">
        {[{ id: DEFAULT_AVATAR, constellationId: null, nickname: '기본' }, ...characters].map(choice => <button key={choice.id} type="button"
          className={`avatar-option${choice.id === avatar ? ' chosen' : ''}`} aria-pressed={choice.id === avatar}
          disabled={avatarBusy || (choice.constellationId !== null && !avatarChoices.constellations?.some(item => item.constellationId === choice.constellationId && item.acquired))}
          onClick={() => void updateAvatar(choice.constellationId)}>
          <Avatar id={choice.id} size={56} />
          <small>{choice.nickname}</small>
        </button>)}
      </div>
      <p className="small">별자리를 완성하면 그 캐릭터를 고를 수 있어요.</p>
      </>}
    </section>}

    {error && <p className="error" role="alert">{error}</p>}

    <Summary label="나의 기록" items={[
      { value: counts.bright, label: '딴 별' },
      { value: counts.dim, label: '손을 뻗은 별' },
      { value: counts.met, label: '만난 별자리' },
    ]} note="딴 별은 해낸 일, 손을 뻗은 별은 시도해 본 일이에요. 둘 다 내 하늘에 남아요." />

    <section aria-labelledby="profile-catalog">
      <div className="profile-catalog-header">
        <h2 id="profile-catalog" className="screen-section">나의 별자리 도감</h2>
        <Link href="/catalog" aria-label="별자리 도감 더 보기">더 보기</Link>
      </div>
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
      </div>
    </section>

    <Section id="profile-badges" title="나의 배지">
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
    </Section>

    <Section id="profile-log" title="나의 활동 기록">
      {records.length
        ? <ul className="profile-log">{records.map(r => <li key={r.attemptId}>
            <span className="log-icon" aria-hidden="true">{r.status === 'dim' ? '☆' : '✦'}</span>
            <span className="log-text">{r.title}{r.reflection ? <small>{r.reflection}</small> : null}</span>
            <time dateTime={r.date}>{shortDate(r.date)}</time>
          </li>)}</ul>
        : <p className="small">별을 기록하면 여기에 그날의 기억이 쌓여요.</p>}
    </Section>
  </div>;
}
