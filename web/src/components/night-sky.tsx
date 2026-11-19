"use client";
// 메인 화면 "내 밤하늘" — 큰 별자리 하나를 바라보는 고요한 화면 (어비스리움 느낌)
// - 별을 두드리면 반짝임 + 그날의 기억 (숫자·포인트 없음)
// - 좌우로 밀거나 아래 점을 눌러 다른 별자리로
// - 별 상태: 아직 만나기 전(희미한 점) / 손을 뻗은 별(은은한 빛) / 딴 별(밝게 반짝임)
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Star } from '@/lib/mobile-data';

const labels = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;

// 별자리 이름·테마 (예시 모드는 API 값이 없어 별 번호로 나눔: 1~5, 6~10, 11~)
const CONSTELLATIONS: Record<number, { name: string; theme: string }> = {
  1: { name: '카시오페이아자리', theme: '하루를 여는 작은 습관' },
  2: { name: '돌고래자리', theme: '나를 돌보는 시간' },
  3: { name: '거문고자리', theme: '현관 너머 한 걸음' },
};

type Shape = { points: [number, number][]; edges: [number, number][] };

// 별자리 모양 (무대 안의 % 좌표). 별 수가 다르면 아래 arcShape로 그림
const SHAPES: Record<number, Shape> = {
  1: { points: [[12, 38], [31, 60], [50, 42], [69, 64], [88, 36]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  2: { points: [[16, 60], [34, 40], [55, 32], [74, 44], [86, 66]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
  3: {
    points: [[50, 14], [38, 32], [62, 32], [34, 56], [66, 56], [28, 82], [72, 82]],
    edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [3, 5], [4, 6]],
  },
};

function arcShape(n: number): Shape {
  const points = Array.from({ length: n }, (_, i): [number, number] => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return [12 + t * 76, 62 - Math.sin(t * Math.PI) * 34];
  });
  return { points, edges: points.slice(1).map((_, i): [number, number] => [i, i + 1]) };
}

// 배경 빛 입자 (서버·클라이언트가 같은 값을 쓰도록 고정 난수)
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const DUST = (() => {
  const r = seeded(7);
  return Array.from({ length: 46 }, (_, i) => ({
    id: i, x: r() * 100, y: r() * 100, size: 1 + r() * 2.2, delay: r() * 6, duration: 3 + r() * 5,
  }));
})();

const koreanDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
function memoryDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}년 ${Number(dateOnly[2])}월 ${Number(dateOnly[3])}일`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : koreanDate.format(date);
}

type Group = { id: number; name: string; theme: string; stars: Star[] };

function groupStars(stars: Star[]): Group[] {
  const byId = new Map<number, Star[]>();
  for (const s of stars) {
    const id = s.constellationId ?? (s.starId <= 5 ? 1 : s.starId <= 10 ? 2 : 3);
    byId.set(id, [...(byId.get(id) ?? []), s]);
  }
  return [...byId.entries()].map(([id, list]) => ({
    id,
    name: list[0].constellationName ?? CONSTELLATIONS[id]?.name ?? '이름 없는 별자리',
    theme: CONSTELLATIONS[id]?.theme ?? '',
    stars: [...list].sort((a, b) => (a.position ?? a.starId) - (b.position ?? b.starId)),
  }));
}

export default function NightSky({ stars, selected, onSelect, busy, onReload }: {
  stars: Star[];
  selected: Star | null;
  onSelect: (star: Star | null) => void;
  busy: boolean;
  onReload: () => void;
}) {
  const groups = useMemo(() => groupStars(stars), [stars]);
  // 처음에는 아직 다 따지 않은 첫 별자리를 보여 줌
  const [index, setIndex] = useState(() => {
    const i = groupStars(stars).findIndex(g => g.stars.some(s => s.status !== 'bright'));
    return i < 0 ? 0 : i;
  });
  const [burst, setBurst] = useState<{ key: number; x: number; y: number } | null>(null);
  const swipe = useRef<number | null>(null);
  const sheet = useRef<HTMLElement>(null);
  const burstCount = useRef(0);

  const current = groups[Math.min(index, Math.max(groups.length - 1, 0))];
  const shape = current ? (SHAPES[current.id]?.points.length === current.stars.length ? SHAPES[current.id] : arcShape(current.stars.length)) : null;
  const complete = !!current && current.stars.length > 0 && current.stars.every(s => s.status === 'bright');

  useEffect(() => { if (selected) sheet.current?.focus(); }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onSelect(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected, onSelect]);

  // 앞뒤로 넘기기 (빠르게 여러 번 눌러도 한 칸씩 정확히 넘어가도록 이전 값 기준으로 계산)
  function step(delta: number) {
    if (!groups.length) return;
    setIndex(i => (i + delta + groups.length) % groups.length);
    onSelect(null);
  }
  function jump(i: number) {
    setIndex(i);
    onSelect(null);
  }

  function tap(star: Star, x: number, y: number) {
    burstCount.current += 1;
    setBurst({ key: burstCount.current, x, y });
    onSelect(star);
  }

  const tried = (s?: Star) => !!s && s.status !== 'untried';

  return <section className="night" aria-label="내 밤하늘">
    <div className="night-dust" aria-hidden="true">
      {DUST.map(d => <i key={d.id} style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s` }} />)}
      <b className="shooting" />
    </div>

    {current ? <>
      <div className="night-title">
        <p className="eyebrow">내 밤하늘</p>
        <h1 className={complete ? 'complete' : undefined}>{current.name}</h1>
        <p>{complete ? '별자리를 모두 이었어요' : current.theme}</p>
      </div>

      <div className="stage"
        onPointerDown={e => { swipe.current = e.clientX; }}
        onPointerUp={e => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
        }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {shape!.edges.map(([a, b]) => {
            const lit = tried(current.stars[a]) && tried(current.stars[b]);
            const [x1, y1] = shape!.points[a], [x2, y2] = shape!.points[b];
            return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} className={lit ? 'edge lit' : 'edge'} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {current.stars.map((s, i) => {
          const [x, y] = shape!.points[i];
          return <button key={s.starId} type="button"
            className={`nstar ${s.status}${selected?.starId === s.starId ? ' active' : ''}`}
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.7) % 3}s` }}
            aria-label={`${s.title}, ${labels[s.status]}`}
            onClick={() => tap(s, x, y)}>
            <span className="glow" aria-hidden="true" />
            <span className="core" aria-hidden="true" />
          </button>;
        })}
        {burst && <span key={burst.key} className="burst" style={{ left: `${burst.x}%`, top: `${burst.y}%` }} aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties} />)}
        </span>}
      </div>

      {groups.length > 1 && <div className="pager">
        <button type="button" className="pager-arrow" onClick={() => step(-1)} aria-label="이전 별자리">‹</button>
        <div className="pager-dots">
          {groups.map((g, i) => <button key={g.id} type="button" aria-label={g.name} aria-current={i === index ? 'true' : undefined} onClick={() => jump(i)} />)}
        </div>
        <button type="button" className="pager-arrow" onClick={() => step(1)} aria-label="다음 별자리">›</button>
      </div>}
      <p className="night-hint">별을 누르면 그날의 기억이 떠올라요</p>
    </> : <div className="night-title"><h1>아직 하늘이 비어 있어요</h1><p>밤하늘을 다시 불러와 주세요.</p></div>}

    {selected && <section ref={sheet} tabIndex={-1} className="sheet" aria-label="별의 기억">
      <div className="sheet-grip" aria-hidden="true" />
      <p className={`sheet-status ${selected.status}`}>{labels[selected.status]}</p>
      <h2>{selected.title}</h2>
      {selected.description && <p className="sheet-desc">{selected.description}</p>}
      {selected.memories.length
        ? <ul className="memories">{selected.memories.map(m => <li key={m.attemptId}><time dateTime={m.date}>{memoryDate(m.date)}</time><p>{m.reflection || '말없이 남긴 작은 시도'}</p></li>)}</ul>
        : <p className="sheet-empty">아직 이 별과의 기억이 없어요.</p>}
      <div className="sheet-actions">
        <Link className="primary" href={`/stars/${selected.starId}`}>{selected.status === 'untried' ? '이 별 만나러 가기' : '이 별 다시 기록하기'}</Link>
        <button type="button" className="ghost" onClick={() => onSelect(null)}>닫기</button>
      </div>
    </section>}

    <details className="night-list">
      <summary>모든 별 목록</summary>
      {groups.map(g => <div key={g.id}>
        <h3>{g.name}</h3>
        {g.stars.map(s => <button key={s.starId} type="button" className="night-row" onClick={() => { setIndex(groups.indexOf(g)); onSelect(s); }}>
          <span className={`dot ${s.status}`} aria-hidden="true" />
          <span>{s.title}<small>{labels[s.status]}</small></span>
        </button>)}
      </div>)}
      <button type="button" className="ghost" disabled={busy} onClick={onReload}>밤하늘 다시 불러오기</button>
    </details>
  </section>;
}
