"use client";
// 나의 프로필 (시안 구성: 프로필 사진 · 이름 · 숫자 3칸 · 나의 별자리 도감 · 배지 · 활동 기록 · 설정 ⚙)
// 원칙에 맞춰 바꾼 것 (고민기록 #1·#3, 메인 캐릭터 교체와 같은 방향)
// - 레벨(Lv.) 대신 "지금 걷는 별자리"
// - 숫자는 해낸 것만 세지 않고 "손을 뻗은 별"도 함께
// - 프로필 사진은 기본 캐릭터 또는 획득한 도감 캐릭터 중에서 고름
// - 시작 질문·정책 신청 정보 입력은 설정(⚙) 안으로 (주소 끝 #settings로 바로 열 수 있음)
import { formatRecordDate } from '@/lib/record-date';
import { MemoryLibrary } from './memory-album';
import SkyControlIcon from './sky-control-icon';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import CatalogStardust from '@/app/catalog/catalog-stardust';
import { characters } from '@/app/catalog/characters';
import { client, type Mode, type ProfileAvatar, type Star } from '@/lib/mobile-data';
import { evaluate, NO_FACTS, type MilestoneFacts } from '@/lib/milestones';
import { isMindCheckDue, mindDay, type MindResult } from '@/lib/mind-check';
import { groupStars, latestGroupIndex } from './night-sky';
import { MindScopeArt } from './mind-check-art';
import { ProfileScreen } from './profile-form';
import { useCloseDialogOnHide } from './use-close-dialog-on-hide';
import { useShop } from './use-shop';
import { Avatar, Hero, ScreenBar, Section, Summary } from './screen-kit';
import { StatusStar } from './star-list';
import './profile-home.css';

// 'person' = 메인 캐릭터 그림 (screen-kit Avatar → SkyPerson sculpted, 상점 장식도 이 id 기준)
const DEFAULT_AVATAR = 'person';
const PROFILE_CATALOG_PREVIEW_SIZE = 4;

export default function ProfileHome({ mode }: { mode: Mode }) {
  // 주소가 #settings로 끝나면 설정부터 열기. 이 화면은 브라우저에서만 그려짐
  const [settings, setSettings] = useState(() => typeof window !== 'undefined' && window.location.hash === '#settings');
  const [stars, setStars] = useState<Star[] | null>(null);
  const [facts, setFacts] = useState<MilestoneFacts>(NO_FACTS);
  const [avatarChoices, setAvatarChoices] = useState<ProfileAvatar | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [name, setName] = useState('별을 바라보는 사람');
  const [draftName, setDraftName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const nameDialog = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(nameDialog);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const avatar = characters.find(character => character.constellationId === avatarChoices?.avatarConstellationId)?.id ?? DEFAULT_AVATAR;
  const acquiredIds = new Set(avatarChoices?.constellations?.filter(item => item.acquired).map(item => item.constellationId));
  const acquiredCharacters = characters.filter(character => acquiredIds.has(character.constellationId));
  const lockedCharacters = characters.filter(character => !acquiredIds.has(character.constellationId));
  const catalogCharacters = [...acquiredCharacters, ...lockedCharacters];
  const { state: wardrobe } = useShop(mode);
  const [picking, setPicking] = useState(false);
  const picker = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(picker);
  const [error, setError] = useState('');
  // 마음 짚기 최근 기록 (못 불러오면 undefined 그대로 → 기본 안내 문구)
  const [mind, setMind] = useState<MindResult | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    client(mode).profile().then(p => {
      if (active) setName(p.nickname || '별을 바라보는 사람');
    }).catch(() => { if (active) setError('프로필 이름을 불러오지 못했어요.'); });
    client(mode).sky().then(r => { if (active) setStars(r.stars); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.'); });
    client(mode).milestones().then(f => { if (active) setFacts(f); }).catch(() => { /* 배지를 못 불러와도 나머지는 보여 줌 */ });
    client(mode).mindCheck().then(r => { if (active) setMind(r.latest); }).catch(() => { /* 못 불러와도 들어가는 길은 그대로 */ });
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
      if (id !== undefined) picker.current?.close();
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : '프로필 그림을 저장하지 못했어요.');
    } finally { setAvatarBusy(false); }
  }

  const groups = useMemo(() => groupStars(stars ?? []), [stars]);
  const counts = useMemo(() => ({
    bright: (stars ?? []).filter(s => s.status === 'bright').length,
    dim: (stars ?? []).filter(s => s.status === 'dim').length,
  }), [stars]);
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
    <Link className="secondary settings-guide-link" href="/sky?guide=1">사용 안내 다시 보기</Link>
    <ProfileScreen mode={mode} />
  </>;

  return <div className="profile-home">
    <ScreenBar title="나의 프로필" right={<button type="button" className="screen-icon" aria-label="설정 (시작 질문·정책 신청 정보)" onClick={() => setSettings(true)}><SkyControlIcon name="settings" /><small aria-hidden="true">설정</small></button>} />

    <Hero
      visual={<button type="button" className="avatar-button" aria-label="프로필 그림 바꾸기" aria-haspopup="dialog" onClick={() => {
        picker.current?.showModal();
        setPicking(true);
      }}>
        <Avatar id={avatar} item={wardrobe?.equipped} />
        <span className="avatar-edit" aria-hidden="true">✎</span>
      </button>}
      title={<button type="button" className="text-button profile-name" aria-label={`${name}, 프로필 이름 수정`} aria-haspopup="dialog"
        onClick={() => { setDraftName(name); setNameError(''); nameDialog.current?.showModal(); }}>
        {name} <span aria-hidden="true">✎</span>
      </button>}
      message={walking ?? '나만의 밤하늘을 만들어 가는 중'}
    />

    <dialog ref={nameDialog} className="avatar-picker name-editor" aria-labelledby="profile-name-heading"
      onCancel={event => { if (nameBusy) event.preventDefault(); }}>
      <form onSubmit={async event => {
        event.preventDefault();
        const nickname = draftName.trim();
        if (!nickname || nameBusy) return;
        setNameBusy(true); setNameError('');
        try {
          const saved = await client(mode).saveProfile({ nickname });
          setName(saved.nickname ?? nickname);
          nameDialog.current?.close();
        } catch { setNameError('이름을 저장하지 못했어요. 다시 시도해 주세요.'); }
        finally { setNameBusy(false); }
      }}>
        <h2 id="profile-name-heading">프로필 이름 수정</h2>
        <label>이름 (최대 30자)<input value={draftName} maxLength={30} required disabled={nameBusy}
          onChange={e => setDraftName(e.target.value)} /></label>
        {nameError && <p role="alert">{nameError}</p>}
        <div className="choices">
          <button type="button" className="secondary" disabled={nameBusy} onClick={() => nameDialog.current?.close()}>취소</button>
          <button disabled={nameBusy || !draftName.trim()}>{nameBusy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </dialog>
    <Summary label="나의 기록" items={[
      { value: counts.bright, label: '딴 별' },
      { value: counts.dim, label: '손을 뻗은 별' },
      { value: avatarChoices?.constellations ? acquiredCharacters.length : '–', label: '완성한 별자리' },
    ]} note="딴 별은 해낸 일, 손을 뻗은 별은 시도해 본 일이에요. 둘 다 내 하늘에 남아요." />

    <Link className="secondary shop-entry starlight-entry" href="/shop">
      <span className="shop-entry-icon"><SkyControlIcon name="shop" /></span>
      <span className="starlight-entry-copy"><strong>별빛 상점</strong><small>캐릭터 꾸미기</small></span>
      {wardrobe && <span className="shop-entry-balance" aria-label={`사용 가능 포인트 ${wardrobe.balance}P`}>{wardrobe.balance.toLocaleString('ko-KR')}P</span>}
      <span className="shop-entry-arrow" aria-hidden="true">→</span>
    </Link>
    {/* 마음 짚기 (선택, 4주마다. 고민기록 #57): 지난번·다음 날짜를 함께 보여 줌 (기능발견성 F-③ 의미 한 줄) */}
    <MemoryLibrary mode={mode}/>
    <Link className="secondary shop-entry mind-entry" href="/mind-check" data-due={(mind && isMindCheckDue(mind)) || undefined}>
      <span className="mind-entry-art" aria-hidden="true"><MindScopeArt size={42} /></span>
      <span>마음 짚기<small>{!mind ? '4주마다 내 마음을 짚어 보는 14문항'
        : isMindCheckDue(mind) ? `다시 짚어 볼 때예요 · 지난번 ${mindDay(mind.checkedAt)}`
        : `지난번 ${mindDay(mind.checkedAt)} · 다음은 ${mindDay(mind.nextAt)}쯤`}</small></span>
      <span className="shop-entry-arrow" aria-hidden="true">→</span>
    </Link>
    <dialog ref={picker} className="avatar-picker" aria-labelledby="profile-avatar-picker" onClose={() => setPicking(false)}
      onCancel={event => { if (avatarBusy) event.preventDefault(); }}>
      <header className="avatar-picker-header">
        <h2 id="profile-avatar-picker">프로필 고르기</h2>
        <button type="button" className="secondary" aria-label="캐릭터 선택 닫기" disabled={avatarBusy} onClick={() => picker.current?.close()}>닫기</button>
      </header>
      {picking && <>
      {avatarError && <p role="alert">{avatarError}</p>}
      {!avatarChoices && (avatarError
        ? <button type="button" disabled={avatarBusy} onClick={() => void updateAvatar()}>다시 불러오기</button>
        : <p role="status">프로필 그림을 불러오고 있어요.</p>)}
      {avatarChoices && <>
      <div className="avatar-grid">
        {[{ id: DEFAULT_AVATAR, constellationId: null, nickname: '기본' }, ...acquiredCharacters].map(choice => <button key={choice.id} type="button"
          className={`avatar-option${choice.id === avatar ? ' chosen' : ''}`} aria-pressed={choice.id === avatar}
          disabled={avatarBusy}
          onClick={() => void updateAvatar(choice.constellationId)}>
          <Avatar id={choice.id} size={56} />
          <small>{choice.nickname}</small>
        </button>)}
        {lockedCharacters.map(character =>
          <button key={character.id} type="button" className="avatar-option avatar-locked" disabled
            aria-label={`${character.nickname}, 미완성`}>
            <span className="avatar avatar-silhouette">
              <CatalogStardust id={character.id} />
            </span>
            <small>{character.nickname}</small>
          </button>
        )}
      </div>
      <p className="small">별자리를 완성하면 그 캐릭터를 고를 수 있어요.</p>
      </>}
      </>}
    </dialog>

    {error && <p className="error" role="alert">{error}</p>}

    <section aria-labelledby="profile-catalog">
      <div className="profile-catalog-header">
        <h2 id="profile-catalog" className="screen-section">나의 친구 도감</h2>
        {avatarChoices?.constellations && <span className="profile-catalog-count">완성 {acquiredCharacters.length}/{characters.length}</span>}
      </div>
      {avatarChoices?.constellations ? <>
        <div id="profile-catalog-items" className="profile-strip">
          {(catalogExpanded ? catalogCharacters : catalogCharacters.slice(0, PROFILE_CATALOG_PREVIEW_SIZE)).map(character => {
            const acquired = acquiredIds.has(character.constellationId);
            return <Link key={character.id} href="/catalog?from=profile" className={`strip-item ${acquired ? 'done' : 'yet'}`}
              aria-label={`${character.constellation.name} ${character.nickname}, ${acquired ? '완성' : '미완성'}`}>
              {acquired
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/catalog/${character.id}.webp`} alt="" />
                : <span className="profile-strip-art"><CatalogStardust id={character.id} /></span>}
              <small>{character.nickname}</small>
            </Link>;
          })}
        </div>
        <div className="profile-catalog-actions">
          {catalogCharacters.length > PROFILE_CATALOG_PREVIEW_SIZE && <button type="button" className="secondary"
            aria-controls="profile-catalog-items" aria-expanded={catalogExpanded}
            onClick={() => setCatalogExpanded(expanded => !expanded)}>
            {catalogExpanded ? '미리보기 접기' : '친구 더 보기'}
          </button>}
          <Link href="/catalog?from=profile">친구 도감으로 이동</Link>
        </div>
      </> : avatarError || avatarChoices
        ? <p className="small" role="alert">획득한 별자리를 불러오지 못했어요.</p>
        : <p className="small" role="status">별자리를 불러오고 있어요.</p>}
    </section>

    <Section id="profile-badges" title="나의 배지">
      {earned.length
        ? <div className="badge-grid">{earned.map(b => <div key={b.id} className="badge earned">
            <span className="badge-icon" aria-hidden="true">{b.id === 'dim' ? <StatusStar status="dim" /> : b.icon}</span><strong>{b.name}</strong><small>{b.done}</small>
          </div>)}</div>
        : <p className="small">아직 받은 배지가 없어요. 작은 별 하나부터 천천히 시작해도 괜찮아요.</p>}
      {waiting.length > 0 && <details className="badge-waiting">
        <summary>아직 만나지 않은 배지 {waiting.length}개</summary>
        <div className="badge-grid">{waiting.map(b => <div key={b.id} className="badge">
          <span className="badge-icon" aria-hidden="true">{b.id === 'dim' ? <StatusStar status="dim" /> : b.icon}</span><strong>{b.name}</strong><small>{b.hint}</small>
        </div>)}</div>
      </details>}
    </Section>

    <Section id="profile-log" title="나의 활동 기록">
      {records.length
        ? <ul className="profile-log">{records.map(r => <li key={r.attemptId}>
            <span className="log-icon" aria-hidden="true"><StatusStar status={r.status === 'dim' ? 'dim' : 'bright'} /></span>
            <span className="log-text">{r.title}{r.reflection ? <small>{r.reflection}</small> : null}</span>
            <time dateTime={r.date}>{formatRecordDate(r.date)}</time>
          </li>)}</ul>
        : <p className="small">별을 기록하면 여기에 그날의 기억이 쌓여요.</p>}
    </Section>
  </div>;
}
