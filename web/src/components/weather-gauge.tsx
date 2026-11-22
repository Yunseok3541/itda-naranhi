"use client";
// 마음 날씨 게이지 (오늘의 별 ② 마음 날씨, 2026-11-22 시안 A 확정)
// - 다섯 날씨를 빛이 적어지는 순서(맑음 → 구름 조금 → 흐림 → 안개 → 비)로 한 줄에. 아이콘·이름이 늘 보임 (docs/기능발견성-조사.md ①)
// - 손잡이를 끌어도 되고, 아무 날씨나 눌러도 그 자리로 감 (끌기만 되는 숨은 손동작이 되지 않게 ⑥). 키보드: ← → ↑ ↓ Home End
// - 처음 고른 쪽(AI·예시·기본 날씨)은 손잡이를 옮기면 작은 표시로 남김
// - 점수처럼 읽히지 않게 숫자는 없고, 색은 빨강·초록 대신 금빛 → 푸른빛
// - 저장은 부모가: 끄는 동안 onPick(미리 보기), 손을 떼거나 방향키 입력이 멈추면 onHold(false) → 그때 한 번 저장
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { weatherNames } from '@/lib/mobile-data';
import './weather-gauge.css';

export const WEATHER_SCALE = ['sunny', 'partly_cloudy', 'cloudy', 'foggy', 'rainy'] as const;
const LAST = WEATHER_SCALE.length - 1;
const TINT: Record<string, string> = { sunny: '#ffd77a', partly_cloudy: '#f3d9a0', cloudy: '#c9c1e6', foggy: '#b6c3d8', rainy: '#8fb3e8' };
const PATHS: Record<string, ReactNode> = {
  sunny: <><circle cx="12" cy="12" r="4" /><path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.4 5.4l1.5 1.5M17.1 17.1l1.5 1.5M5.4 18.6l1.5-1.5M17.1 6.9l1.5-1.5" /></>,
  partly_cloudy: <><path d="M8.6 3.6v1.4M3.4 8.8h1.4M4.9 5.1l1 1M12.3 5.1l-1 1" /><path d="M5.5 11.3a3.4 3.4 0 0 1 6.3-2.6" /><path d="M8.2 19.6h9.3a3.4 3.4 0 0 0 .4-6.8 4.9 4.9 0 0 0-9.4 1 2.9 2.9 0 0 0-.3 5.8Z" /></>,
  cloudy: <><path d="M6.6 18.6h10.8a3.9 3.9 0 0 0 .5-7.8 5.9 5.9 0 0 0-11.4 1.2 3.3 3.3 0 0 0 .1 6.6Z" /><path d="M15.3 6.1a4.4 4.4 0 0 1 5.2 3.4" /></>,
  foggy: <><path d="M6.8 12.4a3 3 0 0 1 .4-6 4.9 4.9 0 0 1 9.4 1 2.6 2.6 0 0 1 .5 5" /><path d="M4 15.4h16M6.5 18.4h11M9 21.2h6" /></>,
  rainy: <><path d="M7 14.6a3.3 3.3 0 0 1 .3-6.6 5.2 5.2 0 0 1 10.1 1.1 2.8 2.8 0 0 1 .3 5.5H7Z" /><path d="M8.6 17.6l-1 2.6M12.6 17.6l-1 2.6M16.6 17.6l-1 2.6" /></>,
};

/** 날씨 아이콘 (선 아이콘, sky-control-icon과 같은 굵기) */
export function WeatherIcon({ code, size = 22 }: { code: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[code]}</svg>;
}

export default function WeatherGauge({ value, origin, originMark, label, disabled = false, onPick, onHold }: {
  /** 지금 보이는 날씨 (고르는 중이면 그 날씨) */
  value: string;
  /** 처음 고른 날씨 (AI·예시·기본). 모르면 null → 표시 없음 */
  origin: string | null;
  /** 처음 고른 쪽 짧은 이름: "AI" · "예시" · "기본" */
  originMark: string;
  /** 화면 읽기 프로그램이 읽을 이름 */
  label: string;
  /** 저장 중에는 움직이지 않음 (초점은 그대로) */
  disabled?: boolean;
  onPick: (code: string) => void;
  onHold: (holding: boolean) => void;
}) {
  const index = Math.max(0, WEATHER_SCALE.indexOf(value as typeof WEATHER_SCALE[number]));
  const originIndex = origin ? WEATHER_SCALE.indexOf(origin as typeof WEATHER_SCALE[number]) : -1;
  /** 누르기 시작할 때의 날씨 (세로로 스크롤해서 취소되면 되돌림). null = 누르고 있지 않음 */
  const start = useRef<string | null>(null);
  const keyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(keyTimer.current), []);

  /** 손가락 위치에서 가장 가까운 칸 (아이콘·선·이름 어디를 눌러도 같은 칸) */
  function at(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / (rect.width / WEATHER_SCALE.length));
    return WEATHER_SCALE[Math.min(LAST, Math.max(0, column))];
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    // 초점은 브라우저 기본 동작으로 (직접 focus()를 부르면 마우스로 눌러도 키보드용 테두리가 생김)
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = value;
    onHold(true);
    onPick(at(event));
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (start.current !== null) onPick(at(event));
  }
  function up() {
    if (start.current === null) return;
    start.current = null;
    onHold(false);
  }
  function cancel() {
    if (start.current === null) return;
    onPick(start.current);
    start.current = null;
    onHold(false);
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    const next = event.key in steps ? index + steps[event.key] : event.key === 'Home' ? 0 : event.key === 'End' ? LAST : null;
    if (next === null) return;
    event.preventDefault();
    if (disabled) return;
    onHold(true);
    onPick(WEATHER_SCALE[Math.min(LAST, Math.max(0, next))]);
    // 방향키를 연달아 누르는 동안은 저장하지 않고, 0.6초 멈추면 저장
    window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => onHold(false), 600);
  }

  return <div className="weather-gauge" role="slider" tabIndex={0} aria-label={label}
    aria-valuemin={0} aria-valuemax={LAST} aria-valuenow={index} aria-valuetext={weatherNames[value] ?? value}
    aria-disabled={disabled || undefined} style={{ '--weather-tint': TINT[value] ?? TINT.cloudy } as CSSProperties}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onKeyDown={key}>
    <div className="weather-gauge-icons" aria-hidden="true">
      {WEATHER_SCALE.map((code, i) => <span key={code} data-on={i === index || undefined}>
        <WeatherIcon code={code} />
        {i === originIndex && i !== index && <em>{originMark}</em>}
      </span>)}
    </div>
    <div className="weather-gauge-rail" aria-hidden="true">
      {WEATHER_SCALE.map((code, i) => <span key={code} className="weather-gauge-tick" style={{ left: `${i * 100 / LAST}%` }} />)}
      <span className="weather-gauge-fill" style={{ width: `${index * 100 / LAST}%` }} />
      <span className="weather-gauge-thumb" style={{ left: `${index * 100 / LAST}%` }}><WeatherIcon code={value} size={18} /></span>
    </div>
    <div className="weather-gauge-labels" aria-hidden="true">
      {WEATHER_SCALE.map((code, i) => <span key={code} data-on={i === index || undefined}>{weatherNames[code]}</span>)}
    </div>
  </div>;
}
