'use client';

import { useEffect, useRef, useState } from 'react';
import { client, type Mode } from '@/lib/mobile-data';

const visibleTime = 5200;
const day = 24 * 60 * 60 * 1000;
const koreaOffset = 9 * 60 * 60 * 1000;

export default function MeteorRewards({ mode, skyTotal }: { mode: Mode; skyTotal?: number }) {
  const [total, setTotal] = useState<number>();
  const [meteor, setMeteor] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const pending = useRef(false);
  const announced = useRef<number | null>(null);
  const awardTimer = useRef<number>(0);

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

  async function catchMeteor(id: number) {
    if (pending.current || limitReached || announced.current === id) return;
    pending.current = true;
    try {
      const result = await client(mode).catchMeteor(id);
      announced.current = id;
      setMeteor(visible => visible === id ? null : visible);
      setTotal(value => Math.max(value ?? 0, result.totalPoints));
      setLimitReached(result.meteor.caughtToday >= result.meteor.dailyLimit);
      if (result.pointsEarned === 1) {
        setReward(id);
        window.clearTimeout(awardTimer.current);
        awardTimer.current = window.setTimeout(() => setReward(null), 1600);
      }
    } catch { /* The same meteor can still be tapped while it is visible. */ }
    finally { pending.current = false; }
  }

  const value = Math.max(skyTotal ?? 0, total ?? 0);
  return <>
    {(skyTotal !== undefined || total !== undefined) && <div className="sky-points" aria-label={`총 ${value} 포인트`}><span aria-hidden="true">✦</span> {value} 포인트</div>}
    {meteor !== null && <button key={meteor} type="button" className="sky-pill sky-meteor" aria-label="유성 담기"
      disabled={limitReached} onClick={() => void catchMeteor(meteor)}><span aria-hidden="true">✦</span></button>}
    {reward !== null && <div key={reward} className="sky-meteor-reward" role="status">+1 포인트</div>}
  </>;
}
