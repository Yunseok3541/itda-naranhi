'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import { FOV_MAX, FOV_MIN, projector, screenRay, skyView, type Vec3 } from '@/lib/sky-view';
import { CHECKIN_POINTS, METEOR_POINTS } from '@/lib/points';
import { finishHint, useSkyHints } from '@/lib/sky-hints';

const visibleTime = 5200;
const day = 24 * 60 * 60 * 1000;
const koreaOffset = 9 * 60 * 60 * 1000;
/** 가장 크게 확대했을 때 별똥별 배율 (가장 넓게 볼 때 1) */
const METEOR_MAX_SCALE = 2.4;

// 유성은 하늘(천구)에 붙어서 떨어진다: 생길 때 지금 보이는 하늘 안에서 자리를 골라 하늘 좌표로 바꿔 두고,
// 떨어지는 동안 매 프레임 지금 시점으로 다시 투영한다 → 하늘을 끌거나 확대하면 별자리 별처럼 함께 움직임
type Point = { x: number; y: number };
/** 하늘 좌표로 저장한 비행 경로 (from → to) */
type Flight = { from: Vec3; to: Vec3 };
/** 비행 진행: start = 시작 시각(performance.now), frozenAt = 멈춘 진행도(0~1, 테스트 모드 멈춤) */
type Clock = { start: number; frozenAt: number | null };
/** 단추(44px) 가운데까지 거리 */
const HALF = 22;

/** 생길 때 화면에서 지나가는 거리 (오른쪽 위 → 왼쪽 아래). 그다음엔 하늘에 붙어서 확대하면 함께 길어짐 */
function travel() {
  return { dx: Math.min(window.innerWidth * .54, 260) + 30, dy: window.innerHeight * .17 + 30 };
}
const between = (min: number, max: number) => min + Math.random() * (max - min);
/** 화면에 보이는 퀘스트 별 가운데 (화면 좌표) */
function visibleStars(): Point[] {
  const w = window.innerWidth, h = window.innerHeight;
  return [...document.querySelectorAll('.sky-anchors .nstar')].map(star => star.getBoundingClientRect())
    .filter(box => box.width > 0 && box.right > 0 && box.left < w && box.bottom > 0 && box.top < h)
    .map(box => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
}
/** 유성 경로 한가운데 자리: 지금 보이는 하늘 안에서, 퀘스트 별에서 되도록 멀리 지나가는 곳 */
function pickMidpoint(): Point {
  const w = window.innerWidth, h = window.innerHeight, stars = visibleStars(), { dx, dy } = travel();
  let best: Point = { x: w / 2, y: h * .45 }, bestGap = -1;
  for (let i = 0; i < 16; i++) {
    const mid = { x: w * between(.2, .8), y: h * between(.28, .62) };
    let gap = Infinity;
    for (const s of [-.5, -.25, 0, .25, .5]) {
      const x = mid.x - dx * s, y = mid.y + dy * s;
      for (const star of stars) gap = Math.min(gap, Math.hypot(star.x - x, star.y - y));
    }
    if (gap >= 72) return mid;
    if (gap > bestGap) { best = mid; bestGap = gap; }
  }
  return best;
}
/** 화면의 한 점을 한가운데로 지나가는 경로를 하늘 좌표로. 하늘 배경이 아직 없으면 null */
function flightThrough(mid: Point): Flight | null {
  const frame = skyView.frame();
  if (!frame) return null;
  const ray = screenRay(skyView.get(), frame.width, frame.height), { dx, dy } = travel();
  const x = mid.x - frame.left, y = mid.y - frame.top;
  return { from: ray(x + dx / 2, y - dy / 2), to: ray(x - dx / 2, y + dy / 2) };
}
function startClock(frozen: boolean): Clock {
  return frozen ? { start: performance.now() - visibleTime / 2, frozenAt: .5 } : { start: performance.now(), frozenAt: null };
}
/** 진행도 t의 유성을 지금 시점으로 투영해서 단추 자리·꼬리 방향·밝기를 바로 적용 (React를 다시 그리지 않음) */
function place(button: HTMLButtonElement, { from, to }: Flight, t: number, fade: number) {
  const frame = skyView.frame();
  if (!frame) return;
  const project = projector(skyView.get(), frame.width, frame.height);
  const mixed = from.map((v, i) => v * (1 - t) + to[i] * t);
  const n = Math.hypot(...mixed) || 1;
  const p = project(mixed.map(v => v / n) as Vec3), a = project(from), b = project(to);
  button.style.visibility = p ? '' : 'hidden';
  if (!p) return;
  button.style.left = `${frame.left + p.x - HALF}px`;
  button.style.top = `${frame.top + p.y - HALF}px`;
  // 꼬리는 지나온 쪽(시작점 방향)으로. 하늘을 돌리면 화면에서 보이는 방향도 함께 바뀜
  if (a && b) button.style.setProperty('--meteor-tail', `${Math.atan2(a.y - b.y, a.x - b.x).toFixed(3)}rad`);
  button.style.setProperty('--meteor-fade', fade.toFixed(3));
}

// 유성 테스트 모드: 주소에 ?meteorTest 를 붙이면 켜짐 (QA용, 서버·포인트에 기록하지 않음)
// 유성이 고른 자리를 지나가도록 끊임없이 떨어지고, 멈춤을 켜면 하늘에 붙은 채 멈춰 있어 별자리를 가리는지 볼 수 있음
type TestSpot = 'random' | 'top' | 'middle' | 'bottom' | 'stars';
const TEST_SPOTS: [TestSpot, string][] = [['random', '무작위'], ['top', '위'], ['middle', '가운데'], ['bottom', '아래'], ['stars', '별자리 위']];
const noSubscribe = () => () => {};
function useMeteorTest() {
  return useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).has('meteorTest'), () => false);
}
/** 테스트 유성이 한가운데로 지나갈 화면 좌표 */
function testTarget(spot: TestSpot): Point {
  const w = window.innerWidth, h = window.innerHeight;
  if (spot === 'stars') {
    const stars = visibleStars().filter(star => star.x > 0 && star.x < w && star.y > 0 && star.y < h);
    const star = stars[Math.floor(Math.random() * stars.length)];
    if (star) return star;
  }
  const y = spot === 'top' ? .25 : spot === 'bottom' ? .7 : spot === 'random' ? between(.2, .75) : .45;
  return { x: w * (spot === 'random' ? between(.15, .85) : .5), y: h * y };
}

/** 하늘 확대 정도(fov)에 따른 별똥별 배율. 하늘 그림처럼 그대로 키우면 끝까지 확대할 때 18배가 돼서
 *  확대 단계(로그)에 비례해 1 ~ METEOR_MAX_SCALE 로 키움. 넓게 볼 때 1이라 누르는 영역(44px)은 줄지 않음 */
export function meteorScale(fov: number) {
  const zoom = Math.log(FOV_MAX / Math.min(FOV_MAX, Math.max(FOV_MIN, fov))) / Math.log(FOV_MAX / FOV_MIN);
  return 1 + (METEOR_MAX_SCALE - 1) * zoom;
}

export default function MeteorRewards({ mode, skyTotal, fov = FOV_MAX, hintPaused = false }: { mode: Mode; skyTotal?: number; /** 지금 하늘 시야각. 확대할수록 별똥별이 커짐 */ fov?: number; /** 메뉴 한 장 안내가 떠 있으면 별똥별 안내를 미룸 */ hintPaused?: boolean }) {
  const [total, setTotal] = useState<number>();
  const [meteor, setMeteor] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  // +1 포인트는 유성을 잡은 자리(화면 좌표)에서 떠오름 (FE_QA)
  const [reward, setReward] = useState<{ id: number; x: number; y: number } | null>(null);
  const pending = useRef(false);
  const announced = useRef<number | null>(null);
  const awardTimer = useRef<number>(0);
  const test = useMeteorTest();
  const [testSpot, setTestSpot] = useState<TestSpot>('random');
  const [testFrozen, setTestFrozen] = useState(false);
  const [testCaught, setTestCaught] = useState(0);
  const testId = useRef(1);
  const button = useRef<HTMLButtonElement>(null);
  const flight = useRef<Flight | null>(null);
  const clock = useRef<Clock>({ start: 0, frozenAt: null });
  const [pointsOpen, setPointsOpen] = useState(false);
  // 다른 화면으로 갔다 돌아오면 닫혀 있게 (cacheComponents로 숨겨진 화면도 상태가 남음, use-collapse-on-hide.ts 참고)
  useLayoutEffect(() => () => setPointsOpen(false), []);
  // 별똥별 처음 한 번 안내: 첫 별똥별 옆에 "눌러서 +1". 그 별똥별이 지나가거나 잡으면 끝
  const hints = useSkyHints();
  const meteorHint = !test && meteor !== null && !limitReached && !hintPaused && hints.pending('meteor');
  const hintedMeteor = useRef<number | null>(null);
  useEffect(() => {
    if (meteorHint) hintedMeteor.current = meteor;
    else if (hintedMeteor.current !== null && meteor !== hintedMeteor.current) finishHint('meteor');
  }, [meteor, meteorHint]);
  useEffect(() => {
    if (!pointsOpen) return;
    const timer = window.setTimeout(() => setPointsOpen(false), 6000);
    return () => window.clearTimeout(timer);
  }, [pointsOpen]);

  // 테스트 모드: 유성이 사라지면 잠시 뒤 고른 자리로 다음 유성
  useEffect(() => {
    if (!test || meteor !== null) return;
    const timer = window.setTimeout(() => {
      const next = flightThrough(testTarget(testSpot));
      if (!next) return;
      flight.current = next;
      clock.current = startClock(testFrozen);
      setMeteor(testId.current++);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [test, meteor, testSpot, testFrozen]);

  // 떨어지는 동안 매 프레임 하늘 시점에 맞춰 자리를 다시 계산 (움직임 줄이기 설정이면 경로 한가운데에 가만히)
  useLayoutEffect(() => {
    const element = button.current, path = flight.current;
    if (meteor === null || !element || !path) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const tick = () => {
      const { start, frozenAt } = clock.current;
      const t = still ? .5 : frozenAt ?? Math.min(1, (performance.now() - start) / visibleTime);
      const fade = still ? 1 : t < .12 ? t / .12 : t > .85 ? Math.max(0, (1 - t) / .15) : 1;
      place(element, path, t, fade);
      if (test && !still && t >= 1) { setMeteor(null); return; }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [meteor, test]);

  function toggleFrozen() {
    const c = clock.current, now = performance.now();
    clock.current = c.frozenAt === null
      ? { start: c.start, frozenAt: Math.min(1, (now - c.start) / visibleTime) }
      : { start: now - c.frozenAt * visibleTime, frozenAt: null };
    setTestFrozen(frozen => !frozen);
  }

  useEffect(() => {
    if (test) return;
    let generation = 0;
    let spawnTimer = 0, hideTimer = 0, rolloverTimer = 0;
    let lastShown = 0;

    async function sync() {
      const currentGeneration = ++generation;
      window.clearTimeout(spawnTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(rolloverTimer);
      setMeteor(null);
      if (document.hidden) return;
      const requestStart = performance.now();
      try {
        const points = await client(mode).points();
        if (generation !== currentGeneration) return;
        const requestEnd = performance.now();
        const serverTime = Date.parse(points.serverTime);
        const firstAt = Date.parse(points.meteor.nextMeteorAt);
        const interval = points.meteor.intervalSeconds * 1000;
        setTotal(points.totalPoints);
        setLimitReached(points.meteor.caughtToday >= points.meteor.dailyLimit);
        if (!Number.isFinite(serverTime) || !Number.isFinite(firstAt) || !Number.isFinite(interval) || interval <= 0) return;
        const now = () => serverTime + performance.now() - (requestStart + requestEnd) / 2;
        const untilMidnight = day - (now() + koreaOffset) % day;
        rolloverTimer = window.setTimeout(() => void sync(), untilMidnight + 300);
        function schedule(slot: number) {
          spawnTimer = window.setTimeout(() => {
            const step = Math.max(slot, Math.floor((now() - firstAt) / interval));
            const id = points.meteor.currentMeteorId + step + 1;
            const age = now() - (firstAt + step * interval);
            const next = id > lastShown && age < visibleTime ? flightThrough(pickMidpoint()) : null;
            if (next) {
              lastShown = id;
              flight.current = next;
              clock.current = startClock(false);
              setMeteor(id);
              hideTimer = window.setTimeout(() => setMeteor(null), visibleTime);
            }
            schedule(step + 1);
          }, Math.max(0, firstAt + slot * interval - now()));
        }
        schedule(Math.max(0, Math.ceil((now() - firstAt) / interval)));
      } catch {
        if (generation === currentGeneration) spawnTimer = window.setTimeout(() => void sync(), 16000);
      }
    }
    function visibility() { void sync(); }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('storage', visibility);
    window.addEventListener('wardrobe-changed', visibility);
    const initial = window.setTimeout(visibility, 0);
    return () => {
      window.removeEventListener('storage', visibility);
      window.removeEventListener('wardrobe-changed', visibility);
      generation++;
      window.clearTimeout(initial);
      window.clearTimeout(spawnTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(rolloverTimer);
      window.clearTimeout(awardTimer.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [mode, skyTotal, test]);

  function showReward(id: number, x: number, y: number) {
    setReward({ id, x, y });
    window.clearTimeout(awardTimer.current);
    awardTimer.current = window.setTimeout(() => setReward(null), 1600);
  }

  async function catchMeteor(id: number, x: number, y: number) {
    if (test) {
      // 테스트 유성은 서버로 보내지 않고 +1 표시만
      setMeteor(null);
      setTestCaught(count => count + 1);
      showReward(id, x, y);
      return;
    }
    if (pending.current || limitReached || announced.current === id) return;
    pending.current = true;
    try {
      const result = await client(mode).catchMeteor(id);
      announced.current = id;
      setMeteor(visible => visible === id ? null : visible);
      setTotal(result.totalPoints);
      setLimitReached(result.meteor.caughtToday >= result.meteor.dailyLimit);
      if (result.pointsEarned === 1) showReward(id, x, y);
    } catch { /* The same meteor can still be tapped while it is visible. */ }
    finally { pending.current = false; }
  }

  const value = total ?? skyTotal ?? 0;
  return <>
    {(skyTotal !== undefined || total !== undefined) && <div className="sky-points">
      {/* 숫자만으로는 뜻을 알기 어려워서 누르면 쌓이는 방법을 보여 줌 (docs/기능발견성-조사.md) */}
      <button type="button" className="text-button" aria-expanded={pointsOpen} aria-controls="sky-points-info" onClick={() => setPointsOpen(open => !open)}>
        <span aria-hidden="true">✦</span> {value}P
      </button>
      {pointsOpen && <p id="sky-points-info">별을 따면 +10~40 · 별똥별 +{METEOR_POINTS} · 하루 첫 체크인 +{CHECKIN_POINTS}</p>}
    </div>}
    {meteor !== null && <button key={meteor} ref={button} type="button" className="sky-pill sky-meteor" aria-label="유성 담기"
      style={{ '--meteor-scale': meteorScale(fov).toFixed(3) } as CSSProperties}
      disabled={limitReached && !test} onClick={event => {
        // 유성은 움직이는 중이라 누른 순간의 자리를 기억 (키보드로 누르면 단추 가운데)
        const box = event.currentTarget.getBoundingClientRect();
        const pointer = event.clientX || event.clientY;
        void catchMeteor(meteor, pointer ? event.clientX : box.left + box.width / 2, pointer ? event.clientY : box.top + box.height / 2);
      }}><span aria-hidden="true">✦</span>{meteorHint && <span className="sky-meteor-hint" aria-hidden="true">눌러서 +{METEOR_POINTS}</span>}</button>}
    {reward !== null && <div key={reward.id} className="sky-meteor-reward" role="status" style={{ left: reward.x, top: reward.y }}>+1 포인트</div>}
    {test && <div className="meteor-test" role="group" aria-label="유성 테스트">
      <strong>유성 테스트 · 잡음 {testCaught}</strong>
      {TEST_SPOTS.map(([spot, label]) => <button key={spot} type="button" aria-pressed={testSpot === spot}
        onClick={() => { setTestSpot(spot); setMeteor(null); }}>{label}</button>)}
      <button type="button" aria-pressed={testFrozen} onClick={toggleFrozen}>멈춤</button>
    </div>}
  </>;
}
