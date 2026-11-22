"use client";
// 첫 화면의 체험 방식: 접기(▶) 대신 지금 방식 한 줄 + [바꾸기] → 작은 창에서 고르기
// 시연·개발용이라 거의 안 쓰지만, 지금 어떤 방식인지는 늘 보이게
import { useId, useRef } from 'react';
import type { Mode } from '@/lib/mobile-data';
import './mode-switch.css';

const MODES: { value: Mode; title: string; note: string }[] = [
  { value: 'example', title: '예시 모드', note: '이 브라우저에만 기록해요' },
  { value: 'api', title: '실제 API 모드', note: '서버 세션에 기록해요' },
];

export default function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const current = MODES.find(m => m.value === mode) ?? MODES[0];
  const close = () => dialog.current?.close();
  return <>
    <p className="mode-switch-line">
      <span>{current.title} · {current.note}</span>
      <button type="button" className="text-button mode-switch-open" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>바꾸기</button>
    </p>
    <dialog ref={dialog} className="mode-switch-dialog" aria-labelledby={titleId}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <h2 id={titleId}>체험 방식</h2>
      <p className="small">가상 내용으로 체험해 주세요. 실제 개인정보는 입력하지 마세요.</p>
      <div className="mode-options" role="radiogroup" aria-labelledby={titleId}>
        {MODES.map(m => <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} className="ghost mode-option"
          onClick={() => { onChange(m.value); close(); }}>
          <b>{m.title}</b><small>{m.note}</small>
        </button>)}
      </div>
      <button type="button" className="text-button mode-switch-close" onClick={close}>닫기</button>
    </dialog>
  </>;
}
