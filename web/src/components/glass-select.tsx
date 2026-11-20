"use client";
// 밤하늘 테마의 반투명 드롭다운 (시작 질문·체험 방식). 기본 <select>는 펼친 목록을 브라우저가 그려서 꾸밀 수 없어 직접 만든다
// 접근성: 버튼(aria-haspopup="listbox") + 목록(role="listbox", aria-activedescendant)
//   열기: 클릭 · Enter · Space · ↑↓ / 고르기: 클릭 · Enter · Space / 이동: ↑↓ Home End / 닫기: Esc · Tab · 바깥 누르기
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export type GlassOption<V> = { value: V; label: string };

export default function GlassSelect<V extends string | null>({ label, options, value, onChange, disabled }: {
  label: string; options: readonly GlassOption<V>[]; value: V; onChange: (v: V) => void; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));
  const selected = options[selectedIndex];

  function show(index = selectedIndex) {
    if (disabled) return;
    setActive(index);
    setOpen(true);
  }
  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  }
  function choose(index: number) {
    onChange(options[index].value);
    close();
  }

  // 열리면 목록으로 초점, 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  // 지금 고른 칸이 보이게 스크롤
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  function onTriggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
  }
  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(last, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(last); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close(false);
  }

  return <div className="glass-select" ref={wrap}>
    <span className="glass-select-label" id={`${id}-label`}>{label}</span>
    <button type="button" ref={trigger} className={`glass-select-trigger${open ? ' open' : ''}`} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-labelledby={`${id}-label ${id}-value`}
      onClick={() => (open ? close() : show())} onKeyDown={onTriggerKey}>
      <span id={`${id}-value`} className={selected?.value === null ? 'glass-select-placeholder' : undefined}>{selected?.label}</span>
      <span className="glass-select-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <ul className="glass-select-list" role="listbox" id={`${id}-list`} ref={list} tabIndex={-1}
      aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-opt-${active}`} onKeyDown={onListKey}>
      {options.map((o, i) => <li key={o.value ?? '__none'} id={`${id}-opt-${i}`} role="option" aria-selected={i === selectedIndex}
        className={`${i === active ? 'active' : ''}${o.value === null ? ' none' : ''}`}
        onPointerEnter={() => setActive(i)} onClick={() => choose(i)}>
        <span>{o.label}</span>{i === selectedIndex && <span className="glass-select-check" aria-hidden="true">✓</span>}
      </li>)}
    </ul>}
  </div>;
}
