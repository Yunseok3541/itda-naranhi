import './catalog-stardust.css';

const sheetWidth = 775;
const sheetHeight = 2029;
const artworkWidth = 218;
const artworkHeight = 225;

// Top-left pixel of each illustration inside the supplied catalog image.
const artworkOrigins: Partial<Record<string, readonly [x: number, y: number]>> = {
  saebit: [25, 305],
  yunseul: [280, 305],
  doran: [534, 305],
  sobok: [25, 734],
  dalkong: [280, 734],
  noeul: [534, 734],
  moa: [25, 1160],
  yeoul: [280, 1160],
  baram: [534, 1160],
  mulggam: [25, 1586],
  posil: [280, 1586],
};

export default function CatalogStardust({ id }: { id: string }) {
  const origin = artworkOrigins[id];
  if (!origin) return null;

  const [x, y] = origin;
  return (
    <span
      className="catalog-stardust"
      aria-hidden="true"
      style={{
        aspectRatio: `${artworkWidth} / ${artworkHeight}`,
        backgroundSize: `${sheetWidth / artworkWidth * 100}% ${sheetHeight / artworkHeight * 100}%`,
        backgroundPosition: `${x / (sheetWidth - artworkWidth) * 100}% ${y / (sheetHeight - artworkHeight) * 100}%`,
      }}
    />
  );
}
