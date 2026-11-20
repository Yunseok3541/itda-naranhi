// 앱 별자리 → 실제 하늘의 위치 (퀘스트 별 하나 = 실제 별 하나)
// 좌표: d3-celestial 0.7.35 data/constellations.lines.json (BSD-3-Clause, public/sky/LICENSE-d3-celestial.txt)
// points 순서 = 별자리 안 퀘스트 순서(position), edges = 실제 별자리 선
import { unit, type Vec3 } from './sky-view';

type SkyShape = { points: [number, number][]; edges: [number, number][] }; // [적경°, 적위°]

// 별자리마다 별 수별 모양 (별 수가 맞는 것을 고름)
const SHAPES: Record<number, SkyShape[]> = {
  // 카시오페이아자리 W: ε → δ → γ → α → β
  1: [{
    points: [[28.5989, 63.6701], [21.454, 60.2353], [14.1772, 60.7167], [10.1268, 56.5373], [2.2945, 59.1498]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  }],
  // 돌고래자리: ε(꼬리) → δ → α → γ → β → δ (몸통 마름모)
  2: [{
    points: [[308.3032, 11.3033], [309.3873, 14.5951], [309.9095, 15.9121], [311.6619, 16.1241], [310.8647, 15.0746]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]],
  }],
  3: [
    // 거문고자리 7개 (지금 데이터): 평행사변형 β → γ → δ → ζ, 위로 ε → κ, 마지막 목표 별은 가장 밝은 베가(α)
    // κ(274.9655, +36.0645, 4.3등급)는 선 데이터에 없어 stars.6.json에서 더해 베가와 이음
    {
      points: [[282.52, 33.3627], [284.7359, 32.6896], [283.6262, 36.8986], [281.1932, 37.6051], [281.0949, 39.6127], [274.9655, 36.0645], [279.2347, 38.7837]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 6], [6, 3], [5, 6]],
    },
    // 거문고자리 6개 (예전 데이터): ζ, ε, 베가 삼각형 + 평행사변형 ζ → δ → γ → β
    {
      points: [[281.1932, 37.6051], [281.0949, 39.6127], [279.2347, 38.7837], [283.6262, 36.8986], [284.7359, 32.6896], [282.52, 33.3627]],
      edges: [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 5], [5, 0]],
    },
  ],
};

export type SkyConstellation = { points: Vec3[]; edges: [number, number][] };

/**
 * 별자리 id와 별 수로 하늘 모양을 돌려준다
 * 실제 모양이 없거나 별 수가 다르면(새 별자리 추가 등) 빈 하늘 쪽에 작은 호 모양으로 만들어 앱이 깨지지 않게 한다
 */
export function skyConstellation(id: number, count: number): SkyConstellation {
  const shape = SHAPES[id]?.find(s => s.points.length === count);
  if (shape) return { points: shape.points.map(([ra, dec]) => unit(ra, dec)), edges: shape.edges };
  const ra0 = (120 + id * 47) % 360, dec0 = 20;
  const points = Array.from({ length: count }, (_, i): Vec3 => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    return unit(ra0 + (t - 0.5) * 14, dec0 + Math.sin(t * Math.PI) * 5);
  });
  return { points, edges: points.slice(1).map((_, i): [number, number] => [i, i + 1]) };
}
