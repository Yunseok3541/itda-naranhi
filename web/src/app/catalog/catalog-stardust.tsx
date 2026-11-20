import Image from 'next/image';
import { useRef } from 'react';

const width = 384;
const height = 400;
const sampleSize = 128;
const silver = '214,212,241';
const lavender = '170,155,225';
const blue = '159,180,255';
const moonlight = '239,231,255';

const referenceWidth = 765;
const referenceHeight = 1024;
// Artwork rectangles in the supplied sheet, excluding the card borders and captions.
const referenceCrops: Record<string, [x: number, y: number, width: number, height: number]> = {
  saebit: [14, 244, 232, 242],
  yunseul: [271, 244, 233, 242],
  doran: [528, 244, 233, 242],
  sobok: [14, 640, 232, 244],
  dalkong: [271, 640, 233, 244],
  noeul: [528, 640, 233, 244],
};

// Each friend has a few brighter pockets; the outer dust still follows the original art.
const brightPockets: Record<string, [number, number][]> = {
  saebit: [[.21,.35],[.40,.46],[.56,.52],[.79,.37],[.74,.68]],
  yunseul: [[.23,.36],[.38,.52],[.50,.58],[.27,.68],[.79,.57]],
  doran: [[.29,.47],[.51,.51],[.63,.37],[.77,.24],[.27,.69],[.65,.70]],
  sobok: [[.23,.65],[.38,.53],[.60,.39],[.69,.56],[.81,.30]],
  dalkong: [[.40,.27],[.62,.29],[.46,.51],[.39,.62],[.65,.78]],
  noeul: [[.32,.28],[.64,.34],[.49,.45],[.54,.60],[.59,.76]],
};

function randomFor(key: string) {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function paintStardust(canvas: HTMLCanvasElement, source: HTMLImageElement, id: string) {
  const context = canvas.getContext('2d');
  const mask = document.createElement('canvas');
  mask.width = sampleSize;
  mask.height = sampleSize;
  const alphaContext = mask.getContext('2d');
  if (!context || !alphaContext) return;

  const fit = Math.min(width * .78 / source.naturalWidth, height * .80 / source.naturalHeight);
  const drawWidth = source.naturalWidth * fit;
  const drawHeight = source.naturalHeight * fit;
  alphaContext.drawImage(source,
    (width - drawWidth) / 2 / width * sampleSize,
    (height - drawHeight) / 2 / height * sampleSize,
    drawWidth / width * sampleSize,
    drawHeight / height * sampleSize,
  );

  // The artwork's alpha sets the particle density and clips the faint underpainting.
  const alpha = alphaContext.getImageData(0, 0, sampleSize, sampleSize).data;
  const positions: [number, number][] = [];
  for (let y = 0; y < sampleSize; y++) {
    for (let x = 0; x < sampleSize; x++) {
      if (alpha[(y * sampleSize + x) * 4 + 3] > 144) {
        positions.push([(x + .5) / sampleSize * width, (y + .5) / sampleSize * height]);
      }
    }
  }
  if (!positions.length) return;

  const random = randomFor(id);
  const pick = () => positions[Math.floor(random() * positions.length)];
  const spread = (scale: number) => (random() + random() + random() - 1.5) * scale;

  function glow(x: number, y: number, radius: number, color: string, opacity: number) {
    if (!context) return;
    const halo = context.createRadialGradient(x, y, 0, x, y, radius);
    halo.addColorStop(0, `rgba(${color},${opacity})`);
    halo.addColorStop(.42, `rgba(${color},${opacity * .41})`);
    halo.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = halo;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  context.clearRect(0, 0, width, height);
  const silhouette = alphaContext.createLinearGradient(0, 0, 0, sampleSize);
  silhouette.addColorStop(0, `rgba(${lavender},.13)`);
  silhouette.addColorStop(.53, `rgba(${silver},.17)`);
  silhouette.addColorStop(1, `rgba(${blue},.085)`);
  alphaContext.globalCompositeOperation = 'source-in';
  alphaContext.fillStyle = silhouette;
  alphaContext.fillRect(0, 0, sampleSize, sampleSize);
  context.save();
  context.filter = 'blur(12px)';
  context.drawImage(mask, 0, 0, width, height);
  context.restore();

  for (let i = 0; i < 46; i++) {
    const [x, y] = pick();
    glow(x + spread(28), y + spread(24), 22 + random() * 43, i % 3 === 0 ? blue : lavender, .029 + random() * .039);
  }

  const pockets = brightPockets[id]?.map(([x, y]) => [x * width, y * height]) ??
    Array.from({ length: 6 }, pick);
  pockets.forEach(([x, y], index) => {
    const tone = index % 4 === 3 ? blue : index % 3 === 0 ? moonlight : silver;
    glow(x, y, 35 + random() * 40, tone, .19 + random() * .12);
    glow(x, y, 13 + random() * 10, tone, .3 + random() * .12);
    glow(x, y, 4 + random() * 3, moonlight, .56);
  });

  for (let i = 0; i < 2300; i++) {
    const aroundPocket = i % 3 === 0;
    const [x, y] = aroundPocket ? pockets[Math.floor(i / 3) % pockets.length] : pick();
    const scatter = aroundPocket ? 46 : i % 7 === 0 ? 66 : 27;
    const px = x + spread(scatter);
    const py = y + spread(scatter);
    const bright = i % 87 === 0;
    const radius = bright ? 1.12 + random() * .96 : .3 + random() ** 2 * 1.15;
    const tone = i % 7 === 0 ? blue : silver;
    if (bright) glow(px, py, 7 + random() * 6, tone, .28);
    context.fillStyle = `rgba(${tone},${bright ? .78 : .15 + random() * .49})`;
    context.beginPath();
    context.arc(px, py, radius, 0, Math.PI * 2);
    context.fill();
  }
}

export default function CatalogStardust({ id, large }: { id: string; large: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const crop = referenceCrops[id];
  if (crop) {
    const [x, y, cropWidth, cropHeight] = crop;
    return <span className="catalog-reference-art" aria-hidden="true" style={{
      aspectRatio: `${cropWidth} / ${cropHeight}`,
      backgroundSize: `${referenceWidth / cropWidth * 100}% ${referenceHeight / cropHeight * 100}%`,
      backgroundPosition: `${x / (referenceWidth - cropWidth) * 100}% ${y / (referenceHeight - cropHeight) * 100}%`,
    }} />;
  }

  return (
    <>
      <canvas ref={canvas} width={width} height={height} className="catalog-stardust" aria-hidden="true" />
      <Image
        className="catalog-stardust-source"
        src={`/catalog/${id}.webp`}
        alt=""
        fill
        unoptimized
        loading={large ? 'eager' : 'lazy'}
        onLoad={event => {
          if (canvas.current) paintStardust(canvas.current, event.currentTarget, id);
        }}
      />
    </>
  );
}
