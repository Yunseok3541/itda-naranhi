"use client";
// 메인 밖 화면의 공통 틀 (팀 공통 규칙, 2026-11-20)
// - 상단: 뒤로가기 + 화면 제목 (오른쪽에 화면별 아이콘 + 도움받을 곳)
// - 대표 영역: 캐릭터 또는 핵심 메시지
// - 요약 영역: 중요한 정보 최대 3개 (억지로 넣지 않음)
// - 콘텐츠: 카드
// - 부가 기능: 설정이나 "더보기"로 (MoreLinks, <details>)
// - 아이콘 단추에는 짧은 글자를 함께 붙인다. 근거: docs/기능발견성-조사.md
// - 하단: 메인 이동 탭 없음 (mobile-flow.tsx)
import Link from 'next/link';
import { createContext, useContext, useId, useRef, type ReactNode } from 'react';
import type { AccessoryId } from '@/lib/shop';
import SkyPerson from './sky-person';
import SkyControlIcon from './sky-control-icon';
import { HELP, HelpPanelContent } from './help-lines';
import './screen-kit.css';

/** 도움받을 곳 열고 닫기 (mobile-flow.tsx가 제공) */
export const HelpContext = createContext<{ open: boolean; toggle: () => void } | null>(null);

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
  const localHelp = useRef<HTMLDialogElement>(null);
  const helpTitle = useId();
  return <div className="screen-bar">
    {onBack
      ? <button type="button" className="screen-icon" aria-label={backLabel} onClick={onBack}>‹</button>
      : <Link className="screen-icon" href={back} aria-label={backLabel}>‹</Link>}
    <h1>{title}</h1>
    <span className="screen-bar-right">
      {right}
      <button type="button" className="screen-icon help-icon" aria-label="도움받을 곳"
        aria-expanded={help?.open} aria-haspopup={help ? undefined : 'dialog'}
        onClick={help ? help.toggle : () => localHelp.current?.showModal()}><SkyControlIcon name="help" /><small aria-hidden="true">도움</small></button>
    </span>
    {!help && <dialog className="screen-help-dialog support-surface" ref={localHelp} aria-labelledby={helpTitle}>
      <HelpPanelContent titleId={helpTitle} title={HELP.title} lines={HELP.lines} onClose={() => localHelp.current?.close()} />
    </dialog>}
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

/** 짧은 순서(3~5개)를 숫자(1/3) 대신 별로: 지난·지금 단계는 켜진 별 ✦ (지금 별은 은은하게 빛남), 남은 단계는 점 ·
 *  (처음 시작 안내의 점과 같은 크기·자리). current가 단계 수와 같으면 모두 켜짐 */
export function StarProgress({ steps, current, label, large = false }: { steps: string[]; current: number; label: string; large?: boolean }) {
  return <ol className={`star-progress${large ? ' large' : ''}`} aria-label={label}>
    {steps.map((step, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'todo';
      return <li key={step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
        {state !== 'todo' && <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0L9.9 6.1L16 8L9.9 9.9L8 16L6.1 9.9L0 8L6.1 6.1Z" /></svg>}
        <span className="sr-only">{step}{state === 'done' ? ' (마침)' : state === 'current' ? ' (지금)' : ''}</span>
      </li>;
    })}
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
export function Avatar({ id = 'person', size = 96, item = null }: { id?: string; size?: number; item?: AccessoryId | null }) {
  return <span className="avatar" style={{ width: size, height: size }}>
    <SkyPerson portrait sculpted character={id} item={item} />
  </span>;
}

/** 대표 영역에 쓰는 큰 아이콘 (캐릭터가 어울리지 않는 화면) */
export function HeroIcon({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'dim' | 'lavender' }) {
  return <span className={`hero-icon ${tone}`} aria-hidden="true">{children}</span>;
}
