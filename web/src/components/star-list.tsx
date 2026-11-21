"use client";
// "모든 별 보기" 창의 내용 (night-sky.tsx의 <dialog className="night-list"> 안)
// - 위쪽 고정: 제목 · 닫기 · 진행 요약 · 별 모양 뜻 (docs/기능발견성-조사.md: 의미를 함께, 닫기를 숨기지 않기)
// - 별자리 = 접히는 카드. 머리에 도감 친구(만났으면 그림, 아직이면 실루엣)·활동 범위·별 모양 진행
// - 처음에는 진행 중인 별자리와 지금 보고 있는 별자리만 펼침 (40줄 → 10줄 안팎)
// - 별 줄은 밤하늘과 같은 별 모양(딴 별·손 뻗은 별·아직). 따기 전 점수는 보여 주지 않음 (고민기록 #31)
import { useId, useState, type ReactNode } from 'react';
import { characters } from '@/app/catalog/characters';
import CatalogStardust from '@/app/catalog/catalog-stardust';
import { getActivityConstellation } from '@/lib/constellations';
import type { Star } from '@/lib/mobile-data';
import { RANGE } from '@/lib/profile';
import SkyControlIcon from './sky-control-icon';

type Group = { id: number; name: string; theme: string; stars: Star[] };
type Status = Star['status'];

/** 별자리 난이도(quests.json stage) → 시작 질문 ① 활동 범위와 같은 말 */
const STAGE_RANGE = Object.fromEntries(RANGE.map(([, label], index) => [index + 1, label]));
const STATUS_TEXT: Record<Status, string> = { bright: '해냈어요', dim: '시도해 봤어요', untried: '아직' };
const STAR_PATH = 'M12 2.8l2.6 6 6.4.6-4.9 4.2 1.5 6.3L12 16.6l-5.6 3.3 1.5-6.3L3 9.4l6.4-.6z';
const shortDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });

function lastDate(star: Star) {
  const date = star.memories.at(-1)?.date;
  if (!date) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00+09:00` : date);
  return Number.isNaN(parsed.getTime()) ? null : shortDate.format(parsed).replace(/\.\s*$/, '').replace('. ', '/');
}

/** 밤하늘과 같은 별 모양: 딴 별(금빛 채움) · 손 뻗은 별(희미한 금빛) · 아직(테두리만) */
export function StatusStar({ status }: { status: Status }) {
  return <svg className={`status-star ${status}`} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_PATH} /></svg>;
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

  return <>
    <div className="star-list-head">
      <div className="star-list-title">
        <h2 id={`${baseId}-title`}>모든 별</h2>
        <button type="button" className="text-button star-list-close" aria-label="모든 별 닫기" onClick={onClose}><SkyControlIcon name="close" /></button>
      </div>
      <p className="star-list-summary">딴 별 <b>{count('bright')}</b> · 손 뻗은 별 <b>{count('dim')}</b> · 남은 별 <b>{count('untried')}</b></p>
      <p className="star-list-legend" aria-hidden="true">
        <span><StatusStar status="bright" />딴 별</span>
        <span><StatusStar status="dim" />손 뻗은 별</span>
        <span><StatusStar status="untried" />아직</span>
      </p>
    </div>

    {groups.length === 0 && <div className="star-list-empty">
      <p>별을 불러오지 못했어요.</p>
      <button type="button" className="ghost sky-icon-action" disabled={busy} onClick={onReload}><SkyControlIcon name="refresh" /> 다시 불러오기</button>
    </div>}

    <ul className="star-groups">
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
              {group.stars.map(star => {
                const date = star.status !== 'untried' ? lastDate(star) : null;
                return <li key={star.starId}>
                  <button type="button" className="night-row" onClick={() => onStar(index, star)}>
                    <StatusStar status={star.status} />
                    <span className="night-row-text">{star.title}
                      {star.status !== 'untried' && <small>{STATUS_TEXT[star.status]}{date ? ` · ${date}` : ''}</small>}
                      {star.status === 'untried' && <span className="sr-only">, 아직 만나기 전</span>}
                    </span>
                    <span className="night-row-go" aria-hidden="true">›</span>
                  </button>
                </li>;
              })}
            </ul>
            <button type="button" className="text-button star-group-sky" onClick={() => onGroup(index)}>
              <SkyControlIcon name="constellation" /> 하늘에서 이 별자리 보기
            </button>
          </div>
        </li>;
      })}
    </ul>
    {footer}
  </>;
}
