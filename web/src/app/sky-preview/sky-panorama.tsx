"use client";

import { useEffect, useRef } from 'react';
import './sky-preview.css';

const fov = Math.PI / 2.8;

function wrapped(value: number, period: number) {
  return ((value % period) + period) % period;
}

export default function SkyPanorama() {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hills = useRef<HTMLDivElement>(null);
  const heading = useRef(0);
  const renderFrame = useRef<() => void>(() => {});
  const pointer = useRef<{ id: number; x: number } | null>(null);

  useEffect(() => {
    const host = surface.current;
    const stage = canvas.current;
    if (!host || !stage) return;
    const context = stage.getContext('2d');
    if (!context) return;
    const sky = new Image();
    const texture = document.createElement('canvas');
    let requested = 0;
    function draw() {
      requested = 0;
      if (!context || !stage || !host || !texture.width || !texture.height) return;
      const { width, height } = stage;
      const viewportAngle = width / height > .78 ? 1.5 : fov;
      const pixelsPerRadian = texture.width / 6.3;
      const step = Math.max(2, Math.ceil(width / 160));
      for (let x = 0; x < width; x += step) {
        const rays = (position: number) => Math.atan((position * 2 / width - 1) * Math.tan(viewportAngle / 2));
        const source = wrapped(texture.width / 4 + (rays(x) - heading.current) * pixelsPerRadian, texture.width);
        const span = (rays(x + step) - rays(x)) * pixelsPerRadian;
        const first = Math.min(span, texture.width - source);
        const drawn = step * first / span;
        context.drawImage(texture, source, 0, first, texture.height, x, 0, drawn, height);
        if (first < span) context.drawImage(texture, 0, 0, span - first, texture.height, x + drawn, 0, step - drawn, height);
      }
      if (hills.current) hills.current.style.backgroundPositionX = `${wrapped(heading.current * host.clientWidth / viewportAngle * 1.28, host.clientWidth * 2)}px`;
    }
    function schedule() {
      if (!requested) requested = requestAnimationFrame(draw);
    }
    function resize() {
      if (!host || !stage) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      stage.width = Math.max(1, Math.round(host.clientWidth * dpr));
      stage.height = Math.max(1, Math.round(host.clientHeight * dpr));
      schedule();
    }
    renderFrame.current = schedule;
    sky.onload = () => {
      // A mirrored second arc makes both joins continuous when the view wraps.
      texture.width = sky.naturalWidth * 2;
      texture.height = sky.naturalHeight;
      const paint = texture.getContext('2d');
      if (!paint) return;
      paint.drawImage(sky, 0, 0);
      paint.translate(texture.width, 0);
      paint.scale(-1, 1);
      paint.drawImage(sky, 0, 0);
      schedule();
    };
    sky.src = '/sky-preview/panorama.webp';
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => {
      observer.disconnect();
      sky.onload = null;
      cancelAnimationFrame(requested);
      renderFrame.current = () => {};
    };
  }, []);

  function turn(pixels: number) {
    if (!surface.current) return;
    const { clientWidth: width, clientHeight: height } = surface.current;
    heading.current += pixels / width * (width / height > .78 ? 1.5 : fov);
    renderFrame.current();
  }

  return (
    <main className="panorama-shell">
      <div className="panorama-surface" ref={surface} tabIndex={0}
        role="region" aria-label="은하수 밤하늘. 좌우로 끌거나 방향키로 둘러보세요."
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          turn(event.key === 'ArrowRight' ? 45 : -45);
        }}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          pointer.current = { id: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const active = pointer.current;
          if (!active || active.id !== event.pointerId) return;
          turn(event.clientX - active.x);
          active.x = event.clientX;
        }}
        onLostPointerCapture={() => { pointer.current = null; }}>
        <canvas ref={canvas} className="panorama-canvas" aria-hidden="true" />
        <div ref={hills} className="panorama-hills" aria-hidden="true" />
        <div className="panorama-grass" aria-hidden="true" />
        <div className="panorama-person" aria-hidden="true" />
      </div>
    </main>
  );
}
