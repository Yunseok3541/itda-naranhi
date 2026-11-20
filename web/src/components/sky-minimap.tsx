"use client";

import { useId, useRef } from 'react';
import { projector, scaleFor, toLonLat, type Frame, type SkyView, type Vec3 } from '@/lib/sky-view';

type Point = [number, number];
type Projection = (point: Vec3) => Point | null;
type Constellation = { points: Vec3[]; edges: [number, number][] };

const rings = [11, 22, 33, 44];
const spokes = Array.from({ length: 12 }, (_, index) => index * 30);
const backgroundStars: Point[] = [
  [19, 34], [27, 69], [35, 23], [40, 73], [44, 37], [47, 15], [55, 79],
  [60, 24], [68, 65], [73, 37], [77, 67], [82, 53], [16, 56], [32, 58],
];

function plotWholeSky(point: Vec3): Point {
  const { lon, lat } = toLonLat(point);
  const radius = (Math.PI / 2 - lat) / Math.PI * 44;
  return [50 + radius * Math.sin(lon), 50 - radius * Math.cos(lon)];
}

function plotNearbySky(active: Constellation, center: Vec3): Projection {
  const { lon, lat } = toLonLat(center);
  const project = projector({ lon, lat, fov: Math.PI / 2 }, 100, 100);
  const points = active.points.map(project).filter(point => point !== null);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const factor = Math.min(54 / Math.max(width, 3), 37 / Math.max(height, 3));
  const middleX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const middleY = (Math.max(...ys) + Math.min(...ys)) / 2;
  return point => {
    const projected = project(point);
    return projected ? [
      50 + (projected.x - middleX) * factor,
      49 + (projected.y - middleY) * factor,
    ] : null;
  };
}

// Invert the projection of the main sky so the outline follows pan and zoom.
function footprint(view: SkyView, frame: Frame, plot: Projection) {
  const { lon, lat, fov } = view;
  const scale = scaleFor(fov, frame.width, frame.height);
  const forward: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const east: Vec3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vec3 = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const perimeter = [[0,0],[.5,0],[1,0],[1,.5],[1,1],[.5,1],[0,1],[0,.5]];
  const corners = perimeter.map(([x, y]) => {
    const u = (.5 - x) * frame.width / scale;
    const v = (.5 - y) * frame.height / scale;
    const q = (u * u + v * v) / 4;
    const ray: Vec3 = [
      (forward[0] * (1 - q) + east[0] * u + north[0] * v) / (1 + q),
      (forward[1] * (1 - q) + east[1] * u + north[1] * v) / (1 + q),
      (forward[2] * (1 - q) + east[2] * u + north[2] * v) / (1 + q),
    ];
    return plot(ray);
  });
  return corners.every(point => point !== null) ? corners.map(point => point!.join(',')).join(' ') : undefined;
}

function SkyChart({ skies, view, frame, active, overview = false, plot }: {
  skies: Constellation[];
  view: SkyView;
  frame: Frame | null;
  active: number;
  overview?: boolean;
  plot: Projection;
}) {
  const id = useId();
  const outline = frame ? footprint(view, frame, plot) : undefined;
  return (
    <svg className="minimap-chart" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-disc`}><circle cx="50" cy="50" r="47.5" /></clipPath>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0" stopColor="#f8f4ff" stopOpacity=".82" />
          <stop offset=".3" stopColor="#e4dcff" stopOpacity=".52" />
          <stop offset="1" stopColor="#d9d1ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-disc)`}>
        {rings.map(radius => <circle key={radius} cx="50" cy="50" r={radius} className="minimap-grid" />)}
        {spokes.map(rotation => <path key={rotation} d="M50 50V5" transform={`rotate(${rotation} 50 50)`} className="minimap-grid" />)}
        {backgroundStars.map(([x, y], index) =>
          <circle key={index} className="minimap-dust" cx={x} cy={y} r={index % 4 === 0 ? .85 : .47} />
        )}
        {outline && <polygon className="minimap-view" points={outline} />}
        {skies.map((sky, i) => {
          const featured = i === active;
          if (!overview && !featured) return null;
          const points = sky.points.map(plot);
          return <g key={i} className={featured ? 'minimap-featured' : 'minimap-secondary'}>
            {sky.edges.map(([a, b]) => {
              const from = points[a], to = points[b];
              return from && to ? <line key={`${a}-${b}`} className="minimap-edge"
                x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} /> : null;
            })}
            {points.map((point, index) => point && <g key={index}>
              {featured && <circle cx={point[0]} cy={point[1]} r={overview ? 3.2 : 8} fill={`url(#${id}-halo)`} />}
              <circle className="minimap-star" cx={point[0]} cy={point[1]} r={overview ? 1.05 : 1.85} />
            </g>)}
          </g>;
        })}
      </g>
      <circle className="minimap-rim" cx="50" cy="50" r="47.5" />
    </svg>
  );
}

export default function SkyMinimap({ groups, centers, skies, view, frame, active, revealed, onJump }: {
  groups: { id: number; name: string }[];
  centers: Vec3[];
  skies: { points: Vec3[]; edges: [number, number][] }[];
  view: SkyView;
  frame: Frame | null;
  active: number;
  revealed: boolean;
  onJump: (index: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const compactPlot = skies[active]?.points.length && centers[active]
    ? plotNearbySky(skies[active], centers[active]) : plotWholeSky;
  return (
    <>
      <button type="button" className="sky-minimap" data-revealed={revealed} aria-label="전체 성도 열기"
        aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <SkyChart skies={skies} view={view} frame={frame} active={active} plot={compactPlot} />
      </button>
      <dialog className="sky-map-dialog" ref={dialog} aria-label="전체 성도">
        <h2>전체 성도</h2>
        <div className="sky-map-overview">
          <SkyChart skies={skies} view={view} frame={frame} active={active} plot={plotWholeSky} overview />
        </div>
        <p>별자리를 골라 그쪽 하늘로 이동하세요.</p>
        {groups.map((group, index) => <button type="button" key={group.id} className="ghost"
          aria-current={index === active ? 'true' : undefined}
          onClick={() => { dialog.current?.close(); onJump(index); }}>
          {group.name}
        </button>)}
        <form method="dialog"><button className="ghost">닫기</button></form>
      </dialog>
    </>
  );
}
