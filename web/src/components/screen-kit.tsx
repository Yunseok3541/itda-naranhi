"use client";
// 메인 밖 화면의 공통 틀 (팀 공통 규칙, 2026-11-20)
// - 상단: 뒤로가기 + 화면 제목 (오른쪽에 화면별 아이콘 + 도움받을 곳 ♡는 항상)
// - 대표 영역: 캐릭터 또는 핵심 메시지
// - 요약 영역: 중요한 정보 최대 3개 (억지로 넣지 않음)
// - 콘텐츠: 카드
// - 부가 기능: 설정이나 "더보기"로 (MoreLinks, <details>)
// - 아이콘 단추에는 짧은 글자를 함께 (♡ 도움, ⚙ 설정). 근거: docs/기능발견성-조사.md
// - 하단: 메인 이동 탭 없음 (mobile-flow.tsx)
import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { characters } from '@/app/catalog/characters';
import SkyPerson from './sky-person';
import './screen-kit.css';

/** 도움받을 곳 열고 닫기 (mobile-flow.tsx가 제공) */
export const HelpContext = createContext<{ open: boolean; toggle: () => void }>({ open: false, toggle: () => {} });

export function ScreenBar({ title, back = '/sky', backLabel = '내 밤하늘로', onBack, right }: {
  title: string;
  /** 뒤로 갈 주소 (onBack이 있으면 그것을 씀) */
  back?: string;
  backLabel?: string;
  onBack?: () => void;
  /** 오른쪽에 둘 화면별 아이콘 단추 (예: 프로필 ⚙) */
  right?: ReactNode;
}) {
  const help = useContext(HelpContext);
  return <div className="screen-bar">
    {onBack
      ? <button type="button" className="screen-icon" aria-label={backLabel} onClick={onBack}>‹</button>
      : <Link className="screen-icon" href={back} aria-label={backLabel}>‹</Link>}
    <h1>{title}</h1>
    <span className="screen-bar-right">
      {right}
      <button type="button" className="screen-icon help-icon" aria-label="도움받을 곳" aria-expanded={help.open} onClick={help.toggle}><span aria-hidden="true">♡</span><small aria-hidden="true">도움</small></button>
    </span>
  </div>;
}

export function Hero({ visual, title, message, chip }: { visual?: ReactNode; title: ReactNode; message?: ReactNode; chip?: ReactNode }) {
  return <section className="screen-hero">
    {visual}
    <h2>{title}</h2>
    {message && <p>{message}</p>}
    {chip && <span className="screen-chip">{chip}</span>}
  </section>;
}

/** 요약 최대 3칸. note: 숫자의 뜻을 한 줄로 (만든 말이라 처음엔 모를 때) */
export function Summary({ items, label, note }: { items: { value: ReactNode; label: string }[]; label: string; note?: ReactNode }) {
  return <>
    <section className="screen-summary" aria-label={label}>
      {items.slice(0, 3).map(i => <div key={i.label}><strong>{i.value}</strong><span>{i.label}</span></div>)}
    </section>
    {note && <p className="screen-summary-note">{note}</p>}
  </>;
}

/** 순서가 있는 화면에서 지금 몇 번째인지 (예: 한 줄 기록 → 마음 날씨 → 오늘의 별) */
export function Steps({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return <ol className="screen-steps" aria-label={label}>
    {steps.map((step, i) => <li key={step} aria-current={i === current ? 'step' : undefined} data-done={i < current || undefined}>
      <span aria-hidden="true">{i < current ? '✓' : i + 1}</span>{step}
    </li>)}
  </ol>;
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return <section aria-labelledby={id}>
    <h2 id={id} className="screen-section">{title}</h2>
    {children}
  </section>;
}

/** 부가 기능 모음 (화면 맨 아래 "더보기") */
export function MoreLinks({ children }: { children: ReactNode }) {
  return <nav className="screen-more" aria-label="더보기"><h2 className="screen-section">더보기</h2>{children}</nav>;
}

/** 대표 영역에 쓰는 그림: 기본 캐릭터 또는 도감 캐릭터 */
export function Avatar({ id = 'person', size = 96 }: { id?: string; size?: number }) {
  const c = characters.find(x => x.id === id);
  return <span className="avatar" style={{ width: size, height: size }}>
    {c
      ? <img src={`/catalog/${c.id}.webp`} alt="" />  // eslint-disable-line @next/next/no-img-element
      : <span className="avatar-person"><SkyPerson portrait /></span>}
  </span>;
}

/** 대표 영역에 쓰는 큰 아이콘 (캐릭터가 어울리지 않는 화면) */
export function HeroIcon({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'dim' | 'lavender' }) {
  return <span className={`hero-icon ${tone}`} aria-hidden="true">{children}</span>;
}
