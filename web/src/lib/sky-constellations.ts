// 실제 별자리 모양을 앱 하늘에 배치한다 (퀘스트 별 하나 = 실제 별 하나).
// 좌표: d3-celestial 0.7.35 data/constellations.lines.json (BSD-3-Clause, public/sky/LICENSE-d3-celestial.txt)
// points 순서 = 별자리 안 퀘스트 순서(position), edges = 실제 별자리 선
import { cameraAxes, RAD, toLonLat, unit, type Vec3 } from './sky-view';

type SkyShape = { points: [number, number][]; edges: [number, number][] }; // [적경°, 적위°]

const SHAPES: Record<number, SkyShape> = {
  // 카시오페이아자리
  1: {
    points: [[28.5989, 63.6701], [21.454, 60.2353], [14.1772, 60.7167], [10.1268, 56.5373], [2.2945, 59.1498]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  // 돌고래자리
  2: {
    points: [[-51.6968, 11.3033], [-50.6127, 14.5951], [-50.0905, 15.9121], [-48.3381, 16.1241], [-49.1353, 15.0746]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
  },
  // 거문고자리
  3: {
    points: [[-78.8068, 37.6051], [-78.9051, 39.6127], [-80.7653, 38.7837], [-76.3738, 36.8986], [-75.2641, 32.6896], [-77.48, 33.3627]],
    edges: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 5], [5, 0]],
  },
  // 작은곰자리
  4: {
    points: [[-123.9853, 77.7945], [-115.6238, 75.7553], [-129.8179, 71.834], [-137.3236, 74.1555], [-108.5073, 82.0373], [-96.9458, 86.5865], [37.9545, 89.2641]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 5], [5, 6]],
  },
  // 토끼자리
  5: {
    points: [[91.5388, -14.9353], [89.1012, -14.1677], [86.7389, -14.822], [83.1826, -17.8223], [78.2329, -16.2055], [76.3653, -22.371], [82.0613, -20.7594], [86.1158, -22.4484], [87.8304, -20.8791], [78.3078, -12.9413], [79.8939, -13.1768]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [9, 4], [4, 10]],
  },
  // 여우자리
  6: {
    points: [[-70.9457, 21.3904], [-67.8236, 24.6649], [-61.6346, 24.0796], [-59.7248, 27.7536], [-56.0578, 27.8142]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  // 카멜레온자리
  7: {
    points: [[124.6315, -76.9197], [158.8671, -78.6078], [161.318, -80.4696], [-175.4132, -79.3122], [179.9066, -78.2218]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
  },
  // 백조자리
  8: {
    points: [[-41.7659, 30.2269], [-48.4472, 33.9703], [-54.4429, 40.2567], [-63.7563, 45.1308], [-67.5735, 51.7298], [-70.7243, 53.3685], [-49.642, 45.2803], [-60.9235, 35.0834], [-67.3197, 27.9597]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 2], [2, 7], [7, 8]],
  },
  // 독수리자리
  9: {
    points: [[-63.4351, 10.6133], [-62.3042, 8.8683], [-61.1717, 6.4068], [-57.1738, -0.8215], [-61.8818, 1.0057], [-68.6254, 3.1148], [-73.6475, 13.8635], [-73.4378, -4.8826]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 1], [1, 5], [5, 7]],
  },
  // 화가자리 — 연결선 3점에 영역 안 실제 별 2개(HIP 29276, 28991)를 더해 기존 퀘스트를 유지
  10: {
    points: [[102.0477, -61.9414], [87.4569, -56.1667], [86.8212, -51.0665], [92.5746, -54.9686], [91.7641, -62.1546]],
    edges: [[0, 1], [1, 2]],
  },
  // 양자리
  11: {
    points: [[42.496, 27.2605], [31.7934, 23.4624], [28.66, 20.808], [28.3826, 19.2939]],
    edges: [[0, 1], [1, 2], [2, 3]],
  },
};

export type SkyConstellation = { points: Vec3[]; edges: [number, number][] };

// 앱 하늘의 중심 위치 [경도°, 위도°]. 둘레를 따라 간격을 두고 위아래로 엇갈리게 배치한다.
const PLACEMENTS: Record<number, [number, number]> = {
  1: [18, 42],
  2: [344, 60],
  3: [306, 37],
  4: [272, 57],
  5: [236, 35],
  6: [199, 59],
  7: [162, 37],
  8: [126, 56],
  9: [89, 34],
  10: [53, 59],
  11: [354, 35],
};

function placeInSky(points: Vec3[], [lon, lat]: [number, number]): Vec3[] {
  const center = points.reduce<Vec3>((sum, point) =>
    [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0]);
  const source = cameraAxes(toLonLat(center));
  const target = cameraAxes({ lon: lon * RAD, lat: lat * RAD });
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // 별마다 좌표를 따로 보정하지 않고 같은 구면 회전을 적용해 별 사이 각거리를 유지한다.
  return points.map(point => {
    const forward = dot(point, source.forward);
    const east = dot(point, source.east);
    const north = dot(point, source.north);
    const component = (axis: number) => forward * target.forward[axis] + east * target.east[axis] + north * target.north[axis];
    return [component(0), component(1), component(2)];
  });
}

/**
 * 별자리 id와 별 수로 하늘 모양을 돌려준다
 * 구버전 DB에서도 별자리를 같은 곳에 배치하고, 아직 없는 별로 이어지는 선은 숨긴다.
 */
export function skyConstellation(id: number, count: number): SkyConstellation {
  const shape = SHAPES[id];
  if (shape && count <= shape.points.length) return {
    points: placeInSky(shape.points.map(([ra, dec]) => unit(ra, dec)), PLACEMENTS[id]).slice(0, count),
    edges: shape.edges.filter(([a, b]) => a < count && b < count),
  };
  const ra0 = (120 + id * 47) % 360, dec0 = 20;
  const points = Array.from({ length: count }, (_, i): Vec3 => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    return unit(ra0 + (t - 0.5) * 14, dec0 + Math.sin(t * Math.PI) * 5);
  });
  return { points, edges: points.slice(1).map((_, i): [number, number] => [i, i + 1]) };
}
