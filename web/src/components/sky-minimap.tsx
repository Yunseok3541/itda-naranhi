"use client";

import { useId, useRef, type MouseEvent } from 'react';
import { screenRay, toLonLat, unit, RAD, type Frame, type SkyView, type Vec3 } from '@/lib/sky-view';
import SkyControlIcon from './sky-control-icon';

type Constellation = { points: Vec3[]; edges: [number, number][] };
const rim = 45;
const gridAngles = Array.from({ length: 8 }, (_, index) => index * 45);

/** Zenith in the center, horizon at the rim. The map keeps a fixed orientation. */
function domePoint(point: Vec3) {
  const { lon, lat } = toLonLat(point);
  const radius = rim * (1 - Math.max(0, lat) / (Math.PI / 2));
  return [50 + radius * Math.sin(lon), 50 - radius * Math.cos(lon)] as const;
}

function footprint(view: SkyView, frame: Frame) {
  const { width, height } = frame;
  const ray = screenRay(view, width, height);
  const points = [];
  // Sample the edges so the viewport follows the curved dome and horizon.
  for (let i = 0; i < 8; i++) points.push([width * i / 8, 0]);
  for (let i = 0; i < 8; i++) points.push([width, height * i / 8]);
  for (let i = 0; i < 8; i++) points.push([width * (1 - i / 8), height]);
  for (let i = 0; i < 8; i++) points.push([0, height * (1 - i / 8)]);
  return points.map(([x, y]) => domePoint(ray(x, y)).join(',')).join(' ');
}

function compactViewport(view: SkyView, frame: Frame | null) {
  if (!frame) return { width: 10, height: 12, angle: 0 };
  const { width, height } = frame;
  const ray = screenRay(view, width, height);
  const left = domePoint(ray(0, height / 2));
  const right = domePoint(ray(width, height / 2));
  const top = domePoint(ray(width / 2, 0));
  const bottom = domePoint(ray(width / 2, height));
  const dx = right[0] - left[0], dy = right[1] - left[1];
  return {
    width: Math.max(10, Math.hypot(dx, dy)),
    height: Math.max(12, Math.hypot(bottom[0] - top[0], bottom[1] - top[1])),
    angle: Math.atan2(dy, dx) / RAD,
  };
}

function SkyChart({ skies, centers, view, frame, active, large = false }: {
  skies: Constellation[];
  centers: Vec3[];
  view: SkyView;
  frame: Frame | null;
  active: number;
  large?: boolean;
}) {
  const clip = useId();
  const [x, y] = domePoint(unit(view.lon / RAD, view.lat / RAD));
  const box = !large ? compactViewport(view, frame) : null;
  return (
    <svg className="minimap-chart" viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="50" cy="50" r={rim} /></clipPath></defs>
      <circle className="minimap-rim" cx="50" cy="50" r={rim} />
      <g clipPath={`url(#${clip})`}>
        {[15, 30].map(radius => <circle key={radius} cx="50" cy="50" r={radius} className="minimap-grid" />)}
        {gridAngles.map(angle => <path key={angle} d="M50 50V5" transform={`rotate(${angle} 50 50)`} className="minimap-grid" />)}
        {large && frame && <polygon className="minimap-view" points={footprint(view, frame)} />}
        {centers.map((center, index) => {
          const [cx, cy] = domePoint(center);
          return <circle key={index} className={index === active ? 'minimap-current' : 'minimap-star'} cx={cx} cy={cy} r={large ? 1.4 : 2} />;
        })}
        {large && skies.map((sky, index) => {
          const points = sky.points.map(domePoint);
          return <g key={index} className={index === active ? 'minimap-current' : 'minimap-star'}>
            {sky.edges.map(([a, b]) => <line key={`${a}-${b}`} className="minimap-edge"
              x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} />)}
            {points.map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="0.75" />)}
          </g>;
        })}
      </g>
      {box && <rect className="minimap-view minimap-view-box" x={x - box.width / 2} y={y - box.height / 2}
        width={box.width} height={box.height} rx="1.4" transform={`rotate(${box.angle} ${x} ${y})`} />}
      <circle className="minimap-look-halo" cx={x} cy={y} r={large ? 2.7 : 2.8} />
      <circle className="minimap-look" cx={x} cy={y} r={large ? 1.25 : 1.45} />
    </svg>
  );
}

export default function SkyMinimap({ groups, centers, skies, view, frame, active, revealed, onJump, onHorizon }: {
  groups: { id: number; name: string }[];
  centers: Vec3[];
  skies: Constellation[];
  view: SkyView;
  frame: Frame | null;
  active: number;
  revealed: boolean;
  onJump: (index: number) => void;
  onHorizon: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const chart = { skies, centers, view, frame, active };
  function select(index: number) {
    dialog.current?.close();
    onJump(index);
  }
  function selectNearest(event: MouseEvent<HTMLDivElement>) {
    if (!event.detail) return;
    const { left, top, width } = event.currentTarget.getBoundingClientRect();
    let nearest = -1;
    let distance = 16;
    centers.forEach((center, index) => {
      const [x, y] = domePoint(center);
      const gap = Math.hypot(event.clientX - left - x * width / 100, event.clientY - top - y * width / 100);
      if (gap < distance) { nearest = index; distance = gap; }
    });
    if (nearest >= 0) select(nearest);
  }
  return (
    <>
      <button type="button" className="sky-minimap" data-revealed={revealed} aria-label="밤하늘 지도 열기"
        aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <span className="sky-map-face"><SkyChart {...chart} /></span>
        <span className="sky-map-caption">하늘 지도</span>
      </button>
      <dialog className="sky-map-dialog sky-dome-dialog" ref={dialog} aria-labelledby={title}>
        <h2 id={title}>밤하늘 지도</h2>
        <p className="sky-map-key"><span /> 지금 보는 방향</p>
        <div className="sky-map-overview" onClick={selectNearest}>
          <SkyChart {...chart} large />
          {groups.map((group, index) => {
            const [x, y] = domePoint(centers[index]);
            return <button key={group.id} type="button" className="sky-map-target" style={{ left: `${x}%`, top: `${y}%` }}
              aria-label={`${group.name}로 확대`} onClick={event => { if (!event.detail) select(index); }} />;
          })}
        </div>
        <p className="sky-map-instruction">별자리를 골라 가까이 보세요.</p>
        <div className="sky-map-groups">
          {groups.map((group, index) => <button type="button" key={group.id} className="ghost"
            aria-current={index === active ? 'true' : undefined} onClick={() => select(index)}>{group.name}</button>)}
        </div>
        <div className="sky-map-actions">
          <button type="button" className="ghost sky-icon-action" onClick={() => { dialog.current?.close(); onHorizon(); }}><SkyControlIcon name="horizon" /> 수평선 보기</button>
          <form method="dialog"><button className="ghost sky-icon-action"><SkyControlIcon name="close" /> 닫기</button></form>
        </div>
      </dialog>
    </>
  );
}
