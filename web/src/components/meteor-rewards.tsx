'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { client, type Mode } from '@/lib/mobile-data';
import { FOV_MAX, FOV_MIN } from '@/lib/sky-view';
import { CHECKIN_POINTS, METEOR_POINTS } from '@/lib/points';
import { finishHint, useSkyHints } from '@/lib/sky-hints';

const visibleTime = 5200;
const day = 24 * 60 * 60 * 1000;
const koreaOffset = 9 * 60 * 60 * 1000;
/** 가장 크게 확대했을 때 별똥별 배율 (가장 넓게 볼 때 1) */
const METEOR_MAX_SCALE = 2.4;

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
  const [pointsOpen, setPointsOpen] = useState(false);
  // 다른 화면으로 갔다 돌아오면 닫혀 있게 (cacheComponents로 숨겨진 화면도 상태가 남음, use-collapse-on-hide.ts 참고)
  useLayoutEffect(() => () => setPointsOpen(false), []);
  // 별똥별 처음 한 번 안내: 첫 별똥별 옆에 "눌러서 +1". 그 별똥별이 지나가거나 잡으면 끝
  const hints = useSkyHints();
  const meteorHint = meteor !== null && !limitReached && !hintPaused && hints.pending('meteor');
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

  useEffect(() => {
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
        setTotal(value => Math.max(value ?? 0, points.totalPoints));
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
            if (id > lastShown && age < visibleTime) {
              lastShown = id;
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
    const initial = window.setTimeout(visibility, 0);
    return () => {
      generation++;
      window.clearTimeout(initial);
      window.clearTimeout(spawnTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(rolloverTimer);
      window.clearTimeout(awardTimer.current);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [mode]);

  async function catchMeteor(id: number, x: number, y: number) {
    if (pending.current || limitReached || announced.current === id) return;
    pending.current = true;
    try {
      const result = await client(mode).catchMeteor(id);
      announced.current = id;
      setMeteor(visible => visible === id ? null : visible);
      setTotal(value => Math.max(value ?? 0, result.totalPoints));
      setLimitReached(result.meteor.caughtToday >= result.meteor.dailyLimit);
      if (result.pointsEarned === 1) {
        setReward({ id, x, y });
        window.clearTimeout(awardTimer.current);
        awardTimer.current = window.setTimeout(() => setReward(null), 1600);
      }
    } catch { /* The same meteor can still be tapped while it is visible. */ }
    finally { pending.current = false; }
  }

  const value = Math.max(skyTotal ?? 0, total ?? 0);
  return <>
    {(skyTotal !== undefined || total !== undefined) && <div className="sky-points">
      {/* 숫자만으로는 뜻을 알기 어려워서 누르면 쌓이는 방법을 보여 줌 (docs/기능발견성-조사.md) */}
      <button type="button" className="text-button" aria-expanded={pointsOpen} aria-controls="sky-points-info" onClick={() => setPointsOpen(open => !open)}>
        <span aria-hidden="true">✦</span> {value} 포인트
      </button>
      {pointsOpen && <p id="sky-points-info">별을 따면 +10~40 · 별똥별 +{METEOR_POINTS} · 하루 첫 체크인 +{CHECKIN_POINTS}</p>}
    </div>}
    {meteor !== null && <button key={meteor} type="button" className="sky-pill sky-meteor" aria-label="유성 담기"
      style={{ '--meteor-scale': meteorScale(fov).toFixed(3) } as CSSProperties}
      disabled={limitReached} onClick={event => {
        // 유성은 움직이는 중이라 누른 순간의 자리를 기억 (키보드로 누르면 단추 가운데)
        const box = event.currentTarget.getBoundingClientRect();
        const pointer = event.clientX || event.clientY;
        void catchMeteor(meteor, pointer ? event.clientX : box.left + box.width / 2, pointer ? event.clientY : box.top + box.height / 2);
      }}><span aria-hidden="true">✦</span>{meteorHint && <span className="sky-meteor-hint" aria-hidden="true">눌러서 +{METEOR_POINTS}</span>}</button>}
    {reward !== null && <div key={reward.id} className="sky-meteor-reward" role="status" style={{ left: reward.x, top: reward.y }}>+1 포인트</div>}
  </>;
}
