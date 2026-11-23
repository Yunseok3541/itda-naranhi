import { useId } from 'react';
import type { AccessoryId } from '@/lib/shop';

type Box = [x: number, y: number, width: number, height: number];
type Portrait = {
  crown: Box;
  forehead: string;
  donor?: 'pin';
  // Optional horizontal registration of the uncovered artwork around x = 0.
  uncoverScaleX?: number;
  uncoveredOutline?: string;
  hatShape: string;
  // Upper head aligned to the crown illustration in the same 180-unit stage.
  uncovered: Box;
  pin: Box;
};

const portraits: Record<string, Portrait> = {
  person: {
    crown: [37.3, 21.2, 106.6, 155.8],
    forehead: 'M44 -8H129V42Q108 48 90 50T44 57Z',
    hatShape: 'M40 -8H132V50Q104 48 80 55T40 66Z',
    uncovered: [37, 30, 106, 148], pin: [98, 44, 15, 12],
  },
  saebit: {
    crown: [14.6, 38.6, 159.8, 138.4], donor: 'pin',
    forehead: 'M-5 -8H67V65Q57 87 39 83T-5 88Z',
    hatShape: 'M-5 -8H73V70Q56 88 39 82T-5 89Z',
    uncovered: [14.9, 45.5, 159.9, 131.5], pin: [136, 99, 18, 15],
  },
  yunseul: {
    crown: [6, 76.5, 168.1, 100.5],
    forehead: 'M43 62H97V105Q82 125 66 118L40 105L43 99Z',
    hatShape: 'M12 47H104V107Q80 125 62 117T12 110Z',
    uncovered: [8, 80, 169, 95], pin: [49, 103, 16, 13],
  },
  doran: {
    crown: [6.8, 22.6, 166.7, 154.4],
    forehead: 'M109 34Q130 24 151 38L152 47L148 56L149 62L154 66L157 74L156 78Q143 69 129 71Q114 73 103 84L99 83L100 70L105 63L109 57L108 51L105 46Z',
    hatShape: 'M76 -8H180V77Q151 72 131 78T76 91Z',
    uncovered: [-60.3, 6, 168, 149], uncoverScaleX: 1.85,
    uncoveredOutline: 'M95 42L104 40Q111 51 118 65Q119 69 124 68Q135 65 142 69Q146 66 147 60L155 40H163Q155 57 153 70Q158 75 161 82L99 88Q105 77 104 69Q103 58 95 42Z',
    pin: [127, 67, 17, 14],
  },
  sobok: {
    crown: [30.8, 22.5, 119, 154.5],
    forehead: 'M41 -8H104L102 50Q85 55 67 60L50 63L41 54Z',
    hatShape: 'M34 -8H119V53Q90 51 70 64T34 86Z',
    uncovered: [36, 29, 119, 145], pin: [87, 49, 14, 11],
  },
  dalkong: {
    crown: [32.2, 18.3, 115.8, 158.7],
    forehead: 'M50 -8H125L123 46Q101 54 80 57L50 70Z',
    hatShape: 'M41 -8H136V48Q111 49 89 56T41 74Z',
    uncovered: [33, 35, 113, 140], pin: [101, 46, 15, 12],
  },
  noeul: {
    crown: [25, 3.6, 130, 173.4],
    forehead: 'M70 -8H116L115 55Q96 65 74 59Z',
    hatShape: 'M63 -8H125L122 62Q99 57 69 65Z',
    uncovered: [27, 9, 132, 171], pin: [109, 56, 15, 12],
  },
  moa: {
    crown: [23.5, 22.1, 133.3, 154.9],
    forehead: 'M48 -8H134L132 54Q115 61 95 68T48 83Z',
    hatShape: 'M43 -8H147V62Q119 56 95 68T43 90Z',
    uncovered: [27, 36, 128, 137], pin: [84, 54, 17, 14],
  },
  yeoul: {
    crown: [20.6, 21.8, 138.8, 155.2],
    forehead: 'M91 -8H160V57Q141 58 119 49L91 48Z',
    hatShape: 'M88 -8H158V58Q143 57 125 50L88 44Z',
    uncovered: [18, 31, 142, 145], pin: [114, 43, 15, 12],
  },
  baram: {
    crown: [31.1, 21.6, 117.4, 155.4],
    forehead: 'M40 -8H107L104 49Q85 54 65 60L40 65Z',
    hatShape: 'M34 -8H122V55Q99 48 78 55T34 75Z',
    uncovered: [29, 34, 128, 141], pin: [57, 48, 15, 12],
  },
  mulggam: {
    crown: [13, 14.9, 154.1, 162.1],
    forehead: 'M33 -8H118V48Q90 54 71 61T33 79Z',
    hatShape: 'M31 -8H127V51Q96 52 71 63T31 82Z',
    uncovered: [10, 43, 160, 137], pin: [60, 51, 15, 12],
  },
  posil: {
    crown: [25.9, 24.1, 126.8, 152.9], donor: 'pin',
    forehead: 'M61 -8H113L115 46Q102 53 88 52L66 61Z',
    hatShape: 'M49 -8H127L122 49Q100 45 82 57L49 71Z',
    uncovered: [27.2, 25.8, 125.8, 151.2], pin: [97, 45, 14, 11],
  },
};

function Art({ src, box: [x, y, width, height] }: { src: string; box: Box }) {
  return <image href={src} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMax meet" />;
}

export default function ShopCharacterPreview({ character, item }: {
  character: string;
  item: AccessoryId | null;
}) {
  const instance = useId();
  const id = Object.hasOwn(portraits, character) ? character : 'person';
  const pose = portraits[id];
  const crown = `/shop/worn/${id}-star-crown.webp`;
  const bare = id === 'person' ? '/sky-preview/person.webp' : `/catalog/${id}.webp`;
  const donor = pose.donor === 'pin' ? `/shop/worn/${id}-star-pin.webp` : bare;
  const hat = item === 'moon-hat';
  const region = hat ? pose.hatShape : pose.forehead;
  const overlay = hat ? `/shop/worn/${id}-moon-hat.webp` : donor;
  // Keep the crown portrait as the registration reference. Only pixels in the
  // headwear area may switch, including the hair revealed by the small pin.
  return (
    <svg className="sky-person" viewBox="0 0 180 180" aria-hidden="true" data-accessory={item ?? undefined}>
      {item === 'star-crown' ? <Art src={crown} box={pose.crown} /> : <>
        <defs>
          {pose.uncoveredOutline && <clipPath id={`${instance}-outline`}><path d={pose.uncoveredOutline} /></clipPath>}
          <filter id={`${instance}-edge`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          {(['body', 'head'] as const).map(layer => (
            <mask key={layer} id={`${instance}-${layer}`} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
              {layer === 'body' && <rect width="180" height="180" fill="white" />}
              <path d={region} fill={layer === 'head' ? 'white' : 'black'} filter={`url(#${instance}-edge)`} />
            </mask>
          ))}
        </defs>
        <g style={{ isolation: 'isolate' }}>
          <g mask={`url(#${instance}-head)`}>
            <g clipPath={!hat && pose.uncoveredOutline ? `url(#${instance}-outline)` : undefined}>
              <g transform={!hat && pose.uncoverScaleX ? `scale(${pose.uncoverScaleX},1)` : undefined}>
                <Art src={overlay} box={hat ? [6, 4, 168, 173] : pose.uncovered} />
              </g>
            </g>
          </g>
          <g mask={`url(#${instance}-body)`} style={{ mixBlendMode: 'plus-lighter' }}><Art src={crown} box={pose.crown} /></g>
        </g>
        {item === 'star-pin' && <Art src="/shop/star-pin.svg" box={pose.pin} />}
      </>}
    </svg>
  );
}
