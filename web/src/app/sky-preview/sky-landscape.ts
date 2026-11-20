import { projector, RAD, unit, type SkyView } from '@/lib/sky-view';

function ridge(altitude: number, phase: number, color: string) {
  // A continuous 360-degree silhouette. The same peaks come back after a full turn.
  const points = Array.from({ length: 360 }, (_, degree) => {
    const lon = degree * RAD + phase;
    const peak = 1.8 * Math.sin(lon * 3) + 1.2 * Math.cos(lon * 7) + 0.65 * Math.sin(lon * 13);
    return unit(degree, altitude + peak);
  });
  return { points, color };
}

const ridges = [ridge(7, 0.3, '#352b51'), ridge(4, 1.8, '#211a38'), ridge(0, 3.4, '#120f23')];
const twilight = unit(315, 1);

export function drawSkyLight(context: CanvasRenderingContext2D, view: SkyView, width: number, height: number) {
  context.fillStyle = '#100b22';
  context.fillRect(0, 0, width, height);
  const project = projector(view, width, height);
  const horizon = project(unit(view.lon / RAD, 0));
  const haze = height * 0.85;
  if (horizon && horizon.y - haze < height) {
    const gradient = context.createLinearGradient(0, horizon.y - haze, 0, horizon.y);
    gradient.addColorStop(0, '#52336d00');
    gradient.addColorStop(0.5, '#51356d62');
    gradient.addColorStop(1, '#80629a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  const light = project(twilight);
  if (light && light.z > 0) {
    const radius = height * 0.52;
    const gradient = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, radius);
    gradient.addColorStop(0, '#d5a4d777');
    gradient.addColorStop(1, '#d5a4d700');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
}

export function drawGround(context: CanvasRenderingContext2D, view: SkyView, width: number, height: number) {
  const project = projector(view, width, height);
  const heading = Math.round(view.lon / RAD);
  for (const { points, color } of ridges) {
    const visible = [];
    for (let offset = 90; offset >= -90; offset -= 1) {
      const p = project(points[(heading + offset + 360) % 360]);
      if (p) visible.push(p);
    }
    if (visible.length < 2 || visible.every(p => p.y >= height)) continue;
    context.beginPath();
    context.moveTo(visible[0].x, visible[0].y);
    for (const p of visible.slice(1)) context.lineTo(p.x, p.y);
    context.lineTo(visible.at(-1)!.x, height);
    context.lineTo(visible[0].x, height);
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }
}
