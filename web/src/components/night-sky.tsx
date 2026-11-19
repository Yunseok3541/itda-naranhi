"use client";
// 메인 화면 "내 밤하늘" — 천구 배경(sky-panorama) 위 실제 별자리 자리에 퀘스트 별을 올린다
// - 퀘스트 별 하나 = 실제 별 하나 (lib/sky-constellations.ts). 배경과 같은 시점(lib/sky-view.ts)으로 위치 계산
// - 넘기기(점·화살표)를 누르면 그 별자리로 하늘이 이동하며 알맞게 확대. 하늘을 끌다 다른 별자리에 다가가면 제목도 바뀜
// - 별을 두드리면 반짝임 + 그날의 기억 (숫자·포인트 없음)
// - 별 상태: 아직 만나기 전(흰 점) / 손을 뻗은 별(은은한 금빛) / 딴 별(밝게 반짝임)
// - 시인성: 배경 별은 어둡게, 퀘스트 별은 크게, 지금 별자리는 별 이름·실선, 다른 별자리는 흐리게
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { getActivityConstellation } from '@/lib/constellations';
import type { Star } from '@/lib/mobile-data';
import { angleBetween, fitView, projector, RAD, skyView, toLonLat, unit, type Vec3 } from '@/lib/sky-view';
import { skyConstellation } from '@/lib/sky-constellations';

const labels = { untried: '아직 만나기 전', dim: '손을 뻗은 별', bright: '딴 별' } as const;
/** 캐릭터 말풍선 질문 (날마다 하나씩 돌아가며). 오늘의 별 체크인으로 이어짐 */
const QUESTIONS = ['오늘 하루는 어땠어요?', '지금 마음은 어떤 날씨예요?', '오늘은 어떤 하루인가요?', '요즘 어떻게 지내요?'];
/** 지금 별자리가 화면에서 이만큼(px, 대각선) 이상일 때만 퀘스트 이름표·큰 별 표시 */
const DETAIL_SPAN = 90;

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
  return [...byId.entries()].map(([id, list]) => {
    const constellation = getActivityConstellation(id);
    return {
      id,
      name: list[0].constellationName ?? constellation?.name ?? '이름 없는 별자리',
      theme: constellation?.theme ?? '',
      stars: [...list].sort((a, b) => (a.position ?? a.starId) - (b.position ?? b.starId)),
    };
  });
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * 별 이름표 자리 정하기: 별 아래 → 위 → 오른쪽 → 왼쪽 순서로, 다른 별·이름표와 겹치지 않고 화면 안인 곳
 * 놓을 곳이 없으면 null (이름은 별을 누르거나 목록에서 볼 수 있음). 글자 폭은 한글 기준으로 어림
 */
/** 단어 단위 줄바꿈(word-break: keep-all)으로 몇 줄·얼마나 넓은지 어림. 글자 0.72rem 기준 */
function measure(text: string, maxLine: number) {
  const CHAR = 11.8, SPACE = 3.6;
  const lines: number[] = [];
  let line = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length * CHAR;
    if (line > 0 && line + SPACE + w > maxLine) { lines.push(line); line = w; }
    else line += (line > 0 ? SPACE : 0) + w;
  }
  lines.push(line);
  return { lines: lines.length, width: Math.max(...lines) };
}

function placeLabels(items: { x: number; y: number; text: string }[], width: number, height: number, band?: { top: number; bottom: number }) {
  const STAR = 16, GAP = 18, PAD = 14, LINE = 15;
  const stars: Box[] = items.map(i => ({ x: i.x - STAR, y: i.y - STAR, w: STAR * 2, h: STAR * 2 }));
  const placed: Box[] = [];
  return items.map(({ x, y, text }) => {
    // 두 줄 안에 들어가는 가장 좁은 폭 (110px부터 넓혀 봄, 최대 160px. 그래도 넘치면 두 줄에서 말줄임)
    let m = measure(text, 110);
    for (let maxLine = 122; m.lines > 2 && maxLine <= 160; maxLine += 12) m = measure(text, maxLine);
    const w = Math.ceil(m.width) + PAD, h = Math.min(2, m.lines) * LINE + 4;
    const candidates: [Box, 'center' | 'left' | 'right'][] = [
      [{ x: x - w / 2, y: y + GAP, w, h }, 'center'],
      [{ x: x - w / 2, y: y - GAP - h, w, h }, 'center'],
      [{ x: x + GAP + 4, y: y - h / 2, w, h }, 'left'],
      [{ x: x - GAP - 4 - w, y: y - h / 2, w, h }, 'right'],
    ];
    for (const [box, align] of candidates) {
      // 화면 안 + (있으면) 위쪽 글자와 캐릭터 사이 빈 공간 안
      const minY = band ? Math.max(4, band.top) : 4, maxY = band ? Math.min(height - 4, band.bottom) : height - 4;
      if (box.x < 4 || box.x + box.w > width - 4 || box.y < minY || box.y + box.h > maxY) continue;
      if (stars.some(s => overlaps(box, s)) || placed.some(p => overlaps(box, p))) continue;
      placed.push(box);
      // 단추(56px) 가운데가 기준인 상대 위치
      return { left: box.x - x + 28, top: box.y - y + 28, width: w, align };
    }
    return null;
  });
}

/** 지금 화면(배경 캔버스) 크기. 아직 모르면 창 크기 */
function frameSize() {
  const f = skyView.frame();
  return f ? { width: f.width, height: f.height } : { width: window.innerWidth, height: window.innerHeight };
}

export default function NightSky({ stars, selected, onSelect, busy, onReload, footer }: {
  stars: Star[];
  selected: Star | null;
  onSelect: (star: Star | null) => void;
  busy: boolean;
  onReload: () => void;
  /** 메인은 한 화면에 고정이라 페이지 아래 안내(footer)를 "모든 별 목록" 창 맨 아래에 둔다 */
  footer?: ReactNode;
}) {
  const groups = useMemo(() => groupStars(stars), [stars]);
  const skies = useMemo(() => groups.map(g => skyConstellation(g.id, g.stars.length)), [groups]);
  const centers = useMemo(() => skies.map(s => {
    const sum: Vec3 = [0, 0, 0];
    for (const p of s.points) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
    const c = toLonLat(sum);
    return unit(c.lon / RAD, c.lat / RAD);
  }), [skies]);
  // 처음에는 아직 다 따지 않은 첫 별자리를 보여 줌
  const [index, setIndex] = useState(() => {
    const i = groupStars(stars).findIndex(g => g.stars.some(s => s.status !== 'bright'));
    return i < 0 ? 0 : i;
  });
  const [burst, setBurst] = useState<{ key: number; x: number; y: number } | null>(null);
  // 캐릭터 말풍선: 누르면 열리고 다시 누르면 닫힘 (null = 닫힘, 문자열 = 오늘의 질문)
  const [talk, setTalk] = useState<string | null>(null);
  const toggleTalk = () => setTalk(t => (t ? null : QUESTIONS[Math.floor(Date.now() / 86_400_000) % QUESTIONS.length]));
  const sheet = useRef<HTMLElement>(null);
  const list = useRef<HTMLDetailsElement>(null);
  const burstCount = useRef(0);
  const closeList = () => { if (list.current) list.current.open = false; };

  // 배경 시점이 바뀌면 다시 그림 (끌기·확대·이동 애니메이션)
  useSyncExternalStore(skyView.subscribe, skyView.version, () => 0);
  const view = skyView.get();
  const frame = skyView.frame();

  const safeIndex = Math.min(index, Math.max(groups.length - 1, 0));
  const current = groups[safeIndex];
  const complete = !!current && current.stars.length > 0 && current.stars.every(s => s.status === 'bright');

  /** i번째 별자리로 하늘을 옮기고 알맞게 확대 */
  function flyToGroup(i: number, ms = 900) {
    const sky = skies[i];
    if (!sky) return;
    const { width, height } = frameSize();
    skyView.flyTo(fitView(sky.points, width, height, freeBand()), ms);
  }
  /** 위쪽 글자(모든 별 보기 버튼)와 아래 캐릭터 사이 빈 공간 (캔버스 기준 y) */
  function freeBand() {
    const top = document.querySelector('.night-list')?.getBoundingClientRect().bottom;
    const bottom = document.querySelector('.char-hotspot')?.getBoundingClientRect().top;
    const offset = skyView.frame()?.top ?? 0;
    return top !== undefined && bottom !== undefined ? { top: top + 12 - offset, bottom: bottom - 8 - offset } : undefined;
  }

  // 처음 열 때: 보여 줄 별자리로 바로 맞춤
  const initialIndex = useRef(safeIndex);
  useEffect(() => { flyToGroup(initialIndex.current, 0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 하늘을 끌다 다른 별자리 가까이 가면 그 별자리를 "지금 별자리"로 (이동 애니메이션 중에는 바꾸지 않음)
  useEffect(() => skyView.subscribe(() => {
    if (skyView.isFlying() || !centers.length) return;
    const v = skyView.get();
    const c = unit(v.lon / RAD, v.lat / RAD);
    let best = -1, bestAngle = Infinity;
    centers.forEach((p, i) => { const a = angleBetween(c, p); if (a < bestAngle) { bestAngle = a; best = i; } });
    if (best >= 0 && bestAngle < v.fov * 0.22) setIndex(i => (i === best ? i : best));
  }), [centers]);

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
    const next = (safeIndex + delta + groups.length) % groups.length;
    setIndex(next);
    flyToGroup(next);
    onSelect(null);
  }
  function jump(i: number) {
    setIndex(i);
    flyToGroup(i);
    onSelect(null);
  }

  function tap(star: Star, x: number, y: number) {
    burstCount.current += 1;
    setBurst({ key: burstCount.current, x, y });
    onSelect(star);
  }

  const tried = (s?: Star) => !!s && s.status !== 'untried';

  // 화면 좌표 (보이지 않는 별은 null → 그리지 않음. 목록에서는 언제든 고를 수 있음)
  const positions = useMemo(() => {
    if (!frame) return [];
    const project = projector(view, frame.width, frame.height);
    const pad = 40;
    return skies.map(s => s.points.map(p => {
      const q = project(p);
      return q && q.x > -pad && q.x < frame.width + pad && q.y > -pad && q.y < frame.height + pad ? q : null;
    }));
  }, [skies, view, frame]);

  // 지금 별자리가 화면에서 충분히 크게 보일 때만 퀘스트 이름·큰 별을 보여 줌 (축소하면 하늘만 감상)
  const detailed = useMemo(() => {
    const pts = (positions[safeIndex] ?? []).filter((p): p is NonNullable<typeof p> => !!p);
    if (pts.length < 2) return false;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= DETAIL_SPAN;
  }, [positions, safeIndex]);

  // 지금 별자리 별 이름표 자리 (겹치면 숨김)
  const labelSpots = useMemo(() => {
    const g = groups[safeIndex];
    const pos = positions[safeIndex];
    if (!g || !pos || !frame || !detailed) return [];
    const shown = g.stars.map((s, i) => ({ s, p: pos[i] })).filter((x): x is { s: Star; p: NonNullable<typeof x.p> } => !!x.p);
    const spots = placeLabels(shown.map(({ s, p }) => ({ x: p.x, y: p.y, text: s.title })), frame.width, frame.height, freeBand());
    return g.stars.map(s => {
      const k = shown.findIndex(x => x.s.starId === s.starId);
      return k < 0 ? null : spots[k];
    });
  }, [groups, positions, safeIndex, frame, detailed]);

  return <section className="night" aria-label="내 밤하늘">
    <div className="night-dust" aria-hidden="true"><b className="shooting" /></div>

    {frame && <div className="sky-anchors" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
      <svg width={frame.width} height={frame.height} aria-hidden="true">
        {groups.map((g, gi) => skies[gi].edges.map(([a, b]) => {
          const p = positions[gi]?.[a], q = positions[gi]?.[b];
          if (!p || !q) return null;
          const lit = tried(g.stars[a]) && tried(g.stars[b]);
          return <line key={`${g.id}-${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            className={`edge${lit ? ' lit' : ''}${gi === safeIndex ? ' current' : ''}`} />;
        }))}
      </svg>
      {groups.map((g, gi) => g.stars.map((s, i) => {
        const p = positions[gi]?.[i];
        if (!p) return null;
        const isCurrent = gi === safeIndex;
        const emphasis = isCurrent && detailed ? ' current' : isCurrent ? ' current far' : ' other';
        return <button key={s.starId} type="button"
          className={`nstar ${s.status}${emphasis}${selected?.starId === s.starId ? ' active' : ''}`}
          style={{ left: p.x, top: p.y, animationDelay: `${(i * 0.7) % 3}s` }}
          aria-label={`${g.name} ${s.title}, ${labels[s.status]}`}
          onClick={() => { if (!isCurrent) setIndex(gi); tap(s, p.x, p.y); }}>
          <span className="glow" aria-hidden="true" />
          <span className="core" aria-hidden="true" />
          {isCurrent && labelSpots[i] && <span className="nstar-label" aria-hidden="true"
            style={{ left: labelSpots[i]!.left, top: labelSpots[i]!.top, width: labelSpots[i]!.width, textAlign: labelSpots[i]!.align }}>{s.title}</span>}
        </button>;
      }))}
      {burst && <span key={burst.key} className="burst" style={{ left: burst.x, top: burst.y }} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties} />)}
      </span>}
    </div>}

    {current ? <>
      <div className="night-title">
        <h1 className={complete ? 'complete' : undefined}>{current.name}</h1>
        <p>{complete ? '별자리를 모두 이었어요' : current.theme}</p>
      </div>

      {groups.length > 1 && <div className="pager">
        <button type="button" className="pager-arrow" onClick={() => step(-1)} aria-label="이전 별자리">‹</button>
        <div className="pager-dots">
          {groups.map((g, i) => <button key={g.id} type="button" aria-label={g.name} aria-current={i === safeIndex ? 'true' : undefined} onClick={() => jump(i)} />)}
        </div>
        <button type="button" className="pager-arrow" onClick={() => step(1)} aria-label="다음 별자리">›</button>
      </div>}
      <p className="night-hint">별을 누르면 기억이 떠올라요 · 하늘은 끌어서 둘러봐요</p>
    </> : <div className="night-title"><h1>아직 하늘이 비어 있어요</h1><p>밤하늘을 다시 불러와 주세요.</p></div>}

    {/* 모든 별 목록: 안내 문구 아래 작은 버튼 → 아래에서 올라오는 창 (캔버스를 못 쓰는 사람도 모든 별을 고를 수 있게) */}
      <details className="night-list" ref={list}>
        <summary>모든 별 보기</summary>
        <div className="night-list-body" role="dialog" aria-label="모든 별 목록">
          <div className="sheet-grip" aria-hidden="true" />
          {groups.map((g, gi) => <div key={g.id}>
            <h3>{g.name}</h3>
            {g.stars.map(s => <button key={s.starId} type="button" className="night-row" onClick={() => { setIndex(gi); flyToGroup(gi); onSelect(s); closeList(); }}>
              <span className={`dot ${s.status}`} aria-hidden="true" />
              <span>{s.title}<small>{labels[s.status]}</small></span>
            </button>)}
          </div>)}
          <button type="button" className="ghost" disabled={busy} onClick={onReload}>밤하늘 다시 불러오기</button>
          <button type="button" className="ghost" onClick={closeList}>닫기</button>
          {footer}
        </div>
      </details>
    <div className="night-space" aria-hidden="true" />

    {/* 캐릭터(배경 인물) 위에 겹친 투명 단추 → 말풍선. 화면을 막지 않게 작게, 다시 누르면 닫힘 */}
    <button type="button" className="char-hotspot" aria-label={talk ? '말풍선 닫기' : '캐릭터에게 말 걸기'} aria-expanded={!!talk} onClick={toggleTalk} />
    {talk && <div className="char-bubble" role="status">
      <p className="char-question">{talk}</p>
      <p className="char-sub">한 줄로 들려주면 오늘의 별을 찾아 줄게요</p>
      <Link className="char-link" href="/checkin">들려주기 →</Link>
    </div>}

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
  </section>;
}
