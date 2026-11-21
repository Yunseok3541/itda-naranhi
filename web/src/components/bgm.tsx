"use client";
import { useEffect, useSyncExternalStore } from 'react';

// 배경음악: Kiss the Sky - Aakash Gandhi (public/audio/kiss-the-sky.mp3)
// 루트 레이아웃에 BgmPlayer 하나만 두어 화면을 옮겨 다녀도 끊기지 않게 함.
// 브라우저는 사용자 동작 전 자동 재생을 막으므로, 첫 터치·클릭·키 입력 때 재생을 시작한다.
// 끄기/켜기는 BgmToggle 버튼으로, 선택은 localStorage에 기억.
const SRC = '/audio/kiss-the-sky.mp3';
const VOLUME = 0.35;
const KEY = 'naranhi-bgm-off';

let audio: HTMLAudioElement | null = null;
let enabled = true;
let playing = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

function getAudio() {
  if (!audio) {
    audio = new Audio(SRC);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.preload = 'auto';
    audio.addEventListener('play', () => { playing = true; emit(); });
    audio.addEventListener('pause', () => { playing = false; emit(); });
  }
  return audio;
}

function tryPlay() {
  if (!enabled) return;
  getAudio().play().catch(() => { /* 아직 사용자 동작 전이면 막힘 → 다음 입력 때 재시도 */ });
}

export function setBgmEnabled(on: boolean) {
  enabled = on;
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, '1'); } catch {}
  if (on) tryPlay(); else audio?.pause();
  emit();
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => (enabled ? (playing ? 'on' : 'waiting') : 'off');
const serverSnapshot = () => 'off' as const;

export function BgmPlayer() {
  useEffect(() => {
    try { enabled = localStorage.getItem(KEY) !== '1'; } catch {}
    emit();
    tryPlay();
    const start = () => { if (!playing) tryPlay(); };
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    events.forEach(e => window.addEventListener(e, start, { capture: true }));
    // 다른 탭으로 가면 멈추고, 돌아오면 이어서
    const onVisible = () => { if (document.hidden) audio?.pause(); else if (enabled) tryPlay(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach(e => window.removeEventListener(e, start, { capture: true }));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}

export function BgmToggle({ className = '' }: { className?: string }) {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const on = state !== 'off';
  return (
    <button type="button" className={`bgm-toggle ${className}`} aria-pressed={on}
      aria-label={on ? '배경음악 끄기' : '배경음악 켜기'} title={on ? '배경음악 끄기' : '배경음악 켜기'}
      onClick={() => setBgmEnabled(!on)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6.5" cy="18" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="16" r="2.5" fill="currentColor" stroke="none" />
        {!on && <path d="M3 3l18 18" />}
      </svg>
      <span aria-hidden="true">음악</span>
    </button>
  );
}
