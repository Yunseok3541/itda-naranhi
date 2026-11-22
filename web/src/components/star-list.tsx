"use client";
// "별 목록" 창의 내용 (night-sky.tsx의 <dialog className="night-list"> 안)
// - 보기 두 가지: 별자리별(기본) / 난이도별(퀘스트_난이도표.md의 stage 1~4를 숫자·점수 대신 느낌으로: 가볍게 → 한 걸음 → 조금 용기 내서 → 사람 곁으로)
// - 위쪽 고정: 제목 · 닫기 · 진행 요약 · 별 모양 뜻 (docs/기능발견성-조사.md: 의미를 함께, 닫기를 숨기지 않기)
// - 별자리 = 접히는 카드. 머리에 도감 친구(만났으면 그림, 아직이면 실루엣)·활동 범위·별 모양 진행
// - 처음에는 진행 중인 별자리와 지금 보고 있는 별자리만 펼침 (40줄 → 10줄 안팎)
// - 별 줄은 밤하늘과 같은 별 모양(딴 별·손 뻗은 별·아직). 따기 전 점수는 보여 주지 않음 (고민기록 #31)
import { useId, useState, type ReactNode } from 'react';
import { catalogQuest } from '@/lib/quest-catalog';
import { characters } from '@/app/catalog/characters';
import CatalogStardust from '@/app/catalog/catalog-stardust';
import { getActivityConstellation } from '@/lib/constellations';
import type { Star } from '@/lib/mobile-data';
import { formatRecordDate } from '@/lib/record-date';
import { RANGE } from '@/lib/profile';
import SkyControlIcon from './sky-control-icon';

type Group = { id: number; name: string; theme: string; stars: Star[] };
type Status = Star['status'];

/** 별자리 난이도(quests.json stage) → 시작 질문 ① 활동 범위와 같은 말 */
const STAGE_RANGE = Object.fromEntries(RANGE.map(([, label], index) => [index + 1, label]));
const STATUS_TEXT: Record<Status, string> = { bright: '해냈어요', dim: '시도해 봤어요', untried: '아직' };
const STAR_PATH = 'M12 2.8l2.6 6 6.4.6-4.9 4.2 1.5 6.3L12 16.6l-5.6 3.3 1.5-6.3L3 9.4l6.4-.6z';
function lastDate(star: Star) {
  const date = star.memories.at(-1)?.date;
  return date ? formatRecordDate(date) : null;
}

/** 밤하늘과 같은 별 모양: 딴 별(금빛 채움) · 손 뻗은 별(희미한 금빛) · 아직(테두리만) */
export function StatusStar({ status }: { status: Status }) {
  return <svg className={`status-star ${status}`} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_PATH} /></svg>;
}

/** 난이도별 보기: 별(=퀘스트)의 stage. 숫자·점수는 보여 주지 않고 얼마나 마음을 내야 하는지로 (고민기록 #31 따기 전 점수 숨김) */
const LEVELS = [
  { stage: 1, title: '가볍게', note: '집 안에서 지금 바로 해 볼 수 있어요' },
  { stage: 2, title: '한 걸음', note: '집 근처에 잠깐 다녀오거나 내 취향을 찾아요' },
  { stage: 3, title: '조금 용기 내서', note: '조금 먼 곳, 사람이 있는 곳에 가 봐요' },
  { stage: 4, title: '사람 곁으로', note: '모임·청년센터처럼 사람과 함께하거나 내일을 준비해요' },
] as const;
const starStage = (star: Star) => catalogQuest(star.starId)?.stage ?? 1;
type View = 'group' | 'level';
const VIEW_KEY = 'naranhi-star-list-view';
function savedView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'level' ? 'level' : 'group'; } catch { return 'group'; }
}

/** 별 한 줄 (두 보기 공통). 난이도별 보기에서는 어느 별자리 별인지 함께 */
function StarRow({ star, where, onPick }: { star: Star; where?: string; onPick: () => void }) {
  const date = star.status !== 'untried' ? lastDate(star) : null;
  return <li>
    <button type="button" className="night-row" onClick={onPick}>
      <StatusStar status={star.status} />
      <span className="night-row-text">{star.title}
        {(star.status !== 'untried' || where) && <small className="star-row-meta">
          {star.status !== 'untried' && <span className={`star-row-status ${star.status}`}>{STATUS_TEXT[star.status]}</span>}
          {date && <span className="star-row-date">{date}</span>}
          {where && <span className="star-row-where">{where}</span>}
        </small>}
        {star.status === 'untried' && <span className="sr-only">, 아직 만나기 전</span>}
      </span>
      <span className="night-row-go" aria-hidden="true">›</span>
    </button>
  </li>;
}

/** 빛의 세기 점 4개로 난이도를 느낌만 (숫자 대신) */
function LevelGlow({ stage }: { stage: number }) {
  return <span className="level-glow" aria-hidden="true">{[1, 2, 3, 4].map(i => <i key={i} data-on={i <= stage || undefined} />)}</span>;
}

const isOngoing = (group: Group) => group.stars.some(s => s.status !== 'untried') && !group.stars.every(s => s.status === 'bright');

export default function StarList({ groups, current, completed, onGroup, onStar, onClose, onReload, busy, footer }: {
  groups: Group[];
  /** 지금 하늘에서 보고 있는 별자리 순서 */
  current: number;
  /** 다 딴(친구를 만난) 별자리 ID */
  completed: Set<number>;
  onGroup: (index: number) => void;
  onStar: (index: number, star: Star) => void;
  onClose: () => void;
  onReload: () => void;
  busy: boolean;
  footer?: ReactNode;
}) {
  const baseId = useId();
  const [open, setOpen] = useState(() => new Set(groups.flatMap((g, i) => i === current || isOngoing(g) ? [g.id] : [])));
  const toggle = (id: number) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const all = groups.flatMap(g => g.stars);
  const count = (status: Status) => all.filter(s => s.status === status).length;
  const [view, setView] = useState<View>(savedView);
  const chooseView = (next: View) => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* 이번 방문 동안만 */ } };
  const groupOf = new Map(groups.flatMap((g, i) => g.stars.map(st => [st.starId, i] as const)));
  const levels = LEVELS.map(level => ({ ...level, stars: all.filter(st => starStage(st) === level.stage) })).filter(level => level.stars.length);
  // 난이도별: 처음엔 아직 다 따지 않은 가장 가벼운 단계만 펼침
  const firstOpenLevel = levels.find(level => level.stars.some(st => st.status !== 'bright'))?.stage ?? levels[0]?.stage;
  const [openLevels, setOpenLevels] = useState(() => new Set<number>(firstOpenLevel ? [firstOpenLevel] : []));
  const toggleLevel = (stage: number) => setOpenLevels(prev => {
    const next = new Set(prev);
    if (next.has(stage)) next.delete(stage); else next.add(stage);
    return next;
  });

  return <>
    <div className="star-list-head">
      <div className="star-list-title">
        <h2 id={`${baseId}-title`}>별 목록</h2>
        <button type="button" className="text-button star-list-close" aria-label="별 목록 닫기" onClick={onClose}><SkyControlIcon name="close" /></button>
      </div>
      <p className="star-list-summary">딴 별 <b>{count('bright')}</b> · 손 뻗은 별 <b>{count('dim')}</b> · 남은 별 <b>{count('untried')}</b></p>
      <p className="star-list-legend" aria-hidden="true">
        <span><StatusStar status="bright" />딴 별</span>
        <span><StatusStar status="dim" />손 뻗은 별</span>
        <span><StatusStar status="untried" />아직</span>
      </p>
      <div className="star-list-views" role="group" aria-label="별 목록 보기 방식">
        <button type="button" className="text-button" aria-pressed={view === 'group'} onClick={() => chooseView('group')}>별자리별</button>
        <button type="button" className="text-button" aria-pressed={view === 'level'} onClick={() => chooseView('level')}>난이도별</button>
      </div>
    </div>

    {groups.length === 0 && <div className="star-list-empty">
      <p>별을 불러오지 못했어요.</p>
      <button type="button" className="ghost sky-icon-action" disabled={busy} onClick={onReload}><SkyControlIcon name="refresh" /> 다시 불러오기</button>
    </div>}

    {view === 'level' && <ul className="star-groups star-levels">
      {levels.map(level => {
        const expanded = openLevels.has(level.stage);
        const bright = level.stars.filter(st => st.status === 'bright').length;
        const panel = `${baseId}-l${level.stage}`;
        return <li key={level.stage} className={`star-group star-level level-${level.stage}`}>
          <button type="button" className="night-row star-group-head" aria-expanded={expanded} aria-controls={panel} onClick={() => toggleLevel(level.stage)}>
            <span className="star-level-mark" aria-hidden="true"><LevelGlow stage={level.stage} /></span>
            <span className="star-group-text">
              <b>{level.title}</b>
              <small>{level.note}</small>
              <span className="star-group-progress">
                <span className="sr-only">난이도 4단계 중 {level.stage}단계, 별 {level.stars.length}개 중 {bright}개를 땄어요</span>
                <span aria-hidden="true">딴 별 {bright}/{level.stars.length}</span>
              </span>
            </span>
            <span className="star-group-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
          <div id={panel} className="star-group-body" hidden={!expanded}>
            <ul>
              {level.stars.map(star => {
                const gi = groupOf.get(star.starId) ?? 0;
                return <StarRow key={star.starId} star={star} where={groups[gi]?.name} onPick={() => onStar(gi, star)} />;
              })}
            </ul>
          </div>
        </li>;
      })}
    </ul>}

    {view === 'group' && <ul className="star-groups">
      {groups.map((group, index) => {
        const expanded = open.has(group.id);
        const done = completed.has(group.id);
        const friend = characters.find(art => art.constellationId === group.id);
        const range = STAGE_RANGE[getActivityConstellation(group.id)?.stage ?? 0];
        const bright = group.stars.filter(s => s.status === 'bright').length;
        const panel = `${baseId}-g${group.id}`;
        return <li key={group.id} className={`star-group${done ? ' done' : ''}${index === current ? ' current' : ''}`}>
          <button type="button" className="night-row star-group-head" aria-expanded={expanded} aria-controls={panel} onClick={() => toggle(group.id)}>
            <span className={`star-group-friend${done ? ' met' : ''}`} aria-hidden="true">
              {friend && (done
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/catalog/${friend.id}.webp`} alt="" />
                : <CatalogStardust id={friend.id} />)}
            </span>
            <span className="star-group-text">
              <b>{group.name}</b>
              <small>{[range, done && friend ? `만난 친구 ${friend.nickname}` : group.theme].filter(Boolean).join(' · ')}</small>
              <span className="star-group-progress">
                <span className="star-group-stars" aria-hidden="true">{group.stars.map(s => <StatusStar key={s.starId} status={s.status} />)}</span>
                <span className="sr-only">별 {group.stars.length}개 중 {bright}개를 땄어요</span>
                <span aria-hidden="true">{bright}/{group.stars.length}</span>
              </span>
            </span>
            <span className="star-group-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          </button>
          <div id={panel} className="star-group-body" hidden={!expanded}>
            <ul>
              {group.stars.map(star => <StarRow key={star.starId} star={star} onPick={() => onStar(index, star)} />)}
            </ul>
            <button type="button" className="text-button star-group-sky" onClick={() => onGroup(index)}>
              <SkyControlIcon name="constellation" /> 하늘에서 이 별자리 보기
            </button>
          </div>
        </li>;
      })}
    </ul>}
    {footer}
  </>;
}
