// 천구 배경 데이터 만들기 → web/public/sky/celestial.json (한 번 만들어 커밋해 둔 파일. 다시 만들 때만 실행)
//
// 원본: d3-celestial 0.7.35 (BSD-3-Clause, Olaf Frohn) 의 data/stars.6.json, data/mw.json
//   별 위치·밝기는 XHIP(Extended Hipparcos Compilation, VizieR V/137D) 기반
//   라이선스 전문: web/public/sky/LICENSE-d3-celestial.txt
//
// 실행 방법 (저장소 밖 임시 폴더에서):
//   mkdir /tmp/stardata && cd /tmp/stardata
//   npm pack d3-celestial@0.7.35 && tar xzf d3-celestial-0.7.35.tgz && npm i d3-geo@3
//   node <저장소>/web/scripts/build-celestial-data.mjs /tmp/stardata/package/data <저장소>/web/public/sky/celestial.json
//
// 결과 형식 (작게 만들려고 배열로 저장)
//   stars:     [적경(도), 적위(도), 등급, 색지수 B-V×100]  — 5.5등급보다 밝은 별만
//   milkyway:  [적경(도), 적위(도), 밝기 1~5]            — 하늘을 3° 격자로 나눠 은하수 안에 드는 칸만
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const [dataDir, outFile] = process.argv.slice(2);
if (!dataDir || !outFile) {
  console.error("사용법: node build-celestial-data.mjs <d3-celestial data 폴더> <출력 json 경로>");
  process.exit(1);
}
// d3-geo는 임시 폴더(현재 작업 폴더)에 설치한 것을 쓴다
const { geoContains } = createRequire(join(process.cwd(), "noop.js"))("d3-geo");

const MAG_LIMIT = 5.5;
const GRID = 3;
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const toRa = (lon) => (lon < 0 ? lon + 360 : lon); // d3-celestial은 적경을 -180~180으로 저장

const starsJson = JSON.parse(readFileSync(join(dataDir, "stars.6.json"), "utf8"));
const stars = starsJson.features
  .filter((f) => f.properties.mag <= MAG_LIMIT)
  .sort((a, b) => a.properties.mag - b.properties.mag) // 밝은 별부터 (그릴 때 어두운 별이 위로 덮지 않게)
  .map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const bv = Number.parseFloat(f.properties.bv);
    return [round(toRa(lon)), round(lat), round(f.properties.mag, 1), Number.isFinite(bv) ? Math.round(bv * 100) : 60];
  });

const mw = JSON.parse(readFileSync(join(dataDir, "mw.json"), "utf8"));
const levels = mw.features.map((f) => ({ level: Number(String(f.id).replace(/\D/g, "")), feature: f })); // ol1(가장 넓고 흐림) ~ ol5(가장 밝음)
const milkyway = [];
for (let dec = -90 + GRID / 2; dec < 90; dec += GRID) {
  // 극 근처는 칸이 좁아지므로 적경 간격을 넓힌다 (점이 몰리지 않게)
  const step = GRID / Math.max(Math.cos((dec * Math.PI) / 180), 0.2);
  for (let ra = step / 2; ra < 360; ra += step) {
    const lon = ra > 180 ? ra - 360 : ra;
    let level = 0;
    for (const l of levels) if (l.level > level && geoContains(l.feature, [lon, dec])) level = l.level;
    if (level > 0) milkyway.push([round(ra, 1), round(dec, 1), level]);
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ source: "d3-celestial 0.7.35 (BSD-3-Clause), XHIP", magLimit: MAG_LIMIT, grid: GRID, stars, milkyway }));
console.log(`별 ${stars.length}개, 은하수 칸 ${milkyway.length}개 → ${outFile}`);
