import type { AccessoryId } from '@/lib/shop';

// Crown position in each character's square artwork, measured from its top left.
const heads: Record<string, [number, number, number]> = {
  person: [50, 35, 46], sculpted: [47, -16, 53],
  baram: [40, 10, 36], dalkong: [61, 14, 38], doran: [78, 33, 28],
  moa: [71, 14, 37], mulggam: [49, 21, 38], noeul: [49, 24, 38],
  saebit: [50, 34, 46], sobok: [53, 18, 43], yeoul: [72, 11, 29], yunseul: [19, 43, 29],
};

export default function WornAccessory({ item, character, animate = false }: {
  item: AccessoryId; character: string; animate?: boolean;
}) {
  const [x, y, span] = heads[character] ?? heads.person;
  const pin = item === 'star-pin';
  const width = pin ? span * .47 : span;
  return <image data-accessory={item} className={animate ? 'accessory-arrives' : undefined}
    style={{ pointerEvents: 'none' }} href={`/shop/${item}.svg`}
    x={x - width / 2 + (pin ? span * .32 : 0)} y={y - width * (pin ? .12 : .66)}
    width={width} height={width * .8} />;
}
