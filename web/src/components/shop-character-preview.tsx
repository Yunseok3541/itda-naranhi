import { useId } from 'react';
import type { AccessoryId } from '@/lib/shop';

type Fit = [x: number, y: number, width: number, height: number, red: number, green: number, blue: number];
type Variant = Exclude<AccessoryId, 'moon-hat'> | 'bare';

// Fitted to each moon-hat portrait in the same 180-unit stage. RGB multipliers
// match midtones sampled from the body, excluding the accessory and backdrop.
const fits: Record<string, Record<Variant, Fit>> = {
  baram: {
    'star-crown': [31.1, 21.6, 117.4, 155.4, 1.0, 0.99, 0.99],
    'star-pin': [31.3, 23.3, 128.1, 153.7, 1.0, 0.95, 0.92],
    'bare': [31.0, 39.3, 126.8, 138.9, 1.03, 0.99, 0.98],
  },
  dalkong: {
    'star-crown': [32.2, 18.3, 115.8, 158.7, 0.99, 0.98, 0.98],
    'star-pin': [38.0, 37.8, 111.4, 139.2, 1.0, 0.99, 0.97],
    'bare': [30.7, 25.5, 119.2, 153.1, 1.04, 1.0, 0.98],
  },
  doran: {
    'star-crown': [6.8, 22.6, 166.7, 154.4, 1.0, 1.0, 1.01],
    'star-pin': [3.2, 32.2, 167.6, 144.8, 0.99, 0.96, 0.97],
    'bare': [2.8, 41.6, 175.0, 137.5, 1.03, 0.98, 0.97],
  },
  moa: {
    'star-crown': [23.5, 22.1, 133.3, 154.9, 1.0, 1.0, 1.0],
    'star-pin': [28.7, 41.4, 125.6, 135.6, 0.96, 0.96, 0.93],
    'bare': [27.7, 45.1, 129.9, 133.5, 1.0, 1.01, 0.96],
  },
  mulggam: {
    'star-crown': [13.0, 14.9, 154.1, 162.1, 1.0, 0.99, 0.99],
    'star-pin': [14.4, 37.3, 154.2, 139.7, 1.0, 1.06, 1.1],
    'bare': [15.3, 48.0, 150.8, 130.6, 1.09, 1.1, 1.2],
  },
  noeul: {
    'star-crown': [25.0, 3.6, 130.0, 173.4, 1.0, 0.99, 0.96],
    'star-pin': [28.3, -2.7, 133.1, 179.7, 1.03, 0.97, 0.92],
    'bare': [31.6, 14.1, 120.1, 164.6, 1.06, 0.96, 0.9],
  },
  person: {
    'star-crown': [37.3, 21.2, 106.6, 155.8, 1.0, 1.0, 0.99],
    'star-pin': [39.0, 30.9, 103.5, 146.1, 0.99, 0.94, 0.97],
    'bare': [38.7, 32.0, 103.8, 145.3, 1.02, 0.91, 0.93],
  },
  posil: {
    'star-crown': [25.9, 24.1, 126.8, 152.9, 1.0, 0.99, 0.99],
    'star-pin': [27.2, 25.8, 125.8, 151.2, 1.0, 0.99, 0.99],
    'bare': [8.6, 20.2, 164.3, 164.3, 1.03, 1.01, 1.02],
  },
  saebit: {
    'star-crown': [14.6, 38.6, 159.8, 138.4, 0.99, 0.99, 0.99],
    'star-pin': [14.9, 45.5, 159.9, 131.5, 1.02, 0.99, 1.03],
    'bare': [8.3, 55.5, 173.9, 126.9, 1.01, 0.94, 1.07],
  },
  sobok: {
    'star-crown': [30.8, 22.5, 119.0, 154.5, 1.0, 1.0, 1.0],
    'star-pin': [41.8, 33.5, 105.5, 143.5, 0.97, 0.97, 0.99],
    'bare': [30.7, 31.8, 120.7, 146.5, 1.03, 0.96, 0.95],
  },
  yeoul: {
    'star-crown': [20.6, 21.8, 138.8, 155.2, 1.0, 1.0, 1.0],
    'star-pin': [21.0, 30.6, 136.6, 146.4, 0.99, 0.99, 1.02],
    'bare': [20.9, 35.3, 138.5, 143.2, 1.01, 0.94, 1.02],
  },
  yunseul: {
    'star-crown': [6.0, 76.5, 168.1, 100.5, 0.99, 0.99, 0.99],
    'star-pin': [2.2, 78.7, 172.5, 98.3, 1.01, 0.98, 0.93],
    'bare': [-0.6, 87.5, 175.9, 91.1, 1.0, 0.97, 0.94],
  },
};

export default function ShopCharacterPreview({ character, item }: {
  character: string;
  item: AccessoryId | null;
}) {
  const tintId = useId();
  const fit = item === 'moon-hat' ? undefined : fits[character]?.[item ?? 'bare'];
  const [x, y, width, height, red, green, blue] = fit ?? [6, 4, 168, 173, 1, 1, 1];
  const baseArt = character === 'person' ? '/sky-preview/person.webp' : `/catalog/${character}.webp`;
  const art = item ? `/shop/worn/${character}-${item}.webp` : baseArt;

  return (
    <svg className="sky-person" viewBox="0 0 180 180" aria-hidden="true">
      {fit && <defs>
        <filter id={tintId} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={red} />
            <feFuncG type="linear" slope={green} />
            <feFuncB type="linear" slope={blue} />
          </feComponentTransfer>
        </filter>
      </defs>}
      <image href={art} data-accessory={item ?? undefined} x={x} y={y} width={width} height={height}
        preserveAspectRatio="xMidYMax meet" filter={fit ? `url(#${tintId})` : undefined} />
    </svg>
  );
}
