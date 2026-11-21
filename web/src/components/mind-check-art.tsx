// 마음 짚기 그림 (모두 장식이라 aria-hidden. 뜻은 옆 글자가 전함)
// - MindScopeArt: 렌즈 속에 하트가 있는 망원경 (마음 짚기 대표 그림)
// - 묶음마다 다른 그림 말: 외로움 = 빈도 점, 곁에 있는 사람 = 별 무리(사람 = 내 하늘의 별), 지난 2주 마음 = 달 모양(자주일수록 꽉 찬 달)
// SVG 그라데이션 id는 화면마다 겹치지 않게 useId로 만든다 (숨겨 둔 이전 화면에 같은 id가 있으면 그림이 안 보일 수 있음)
import { useId } from 'react';
import type { ScaleId } from '@/lib/mind-check';

const useSvgId = (prefix: string) => prefix + useId().replace(/[^\w-]/g, '');

/** 4갈래 별 (✦) 경로. 가운데 (cx, cy), 반지름 r */
const sparkle = (cx: number, cy: number, r: number) => {
  const k = r * .24;
  return `M${cx} ${cy - r}L${cx + k} ${cy - k}L${cx + r} ${cy}L${cx + k} ${cy + k}L${cx} ${cy + r}L${cx - k} ${cy + k}L${cx - r} ${cy}L${cx - k} ${cy - k}Z`;
};

export function MindScopeArt({ size = 120 }: { size?: number }) {
  const id = useSvgId('scope');
  const u = (name: string) => `url(#${id}-${name})`;
  return <svg className="mind-scope" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-bg`} cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="#3d2f74" /><stop offset="1" stopColor="#160f33" /></radialGradient>
      <linearGradient id={`${id}-tube`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2d5ff" /><stop offset=".55" stopColor="#a78be8" /><stop offset="1" stopColor="#6f56b8" /></linearGradient>
      <linearGradient id={`${id}-hood`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cdb9ff" /><stop offset="1" stopColor="#7a60c4" /></linearGradient>
      <radialGradient id={`${id}-glass`} cx="45%" cy="40%" r="75%"><stop offset="0" stopColor="#4a6fd0" /><stop offset=".6" stopColor="#22357e" /><stop offset="1" stopColor="#131c4a" /></radialGradient>
      <radialGradient id={`${id}-halo`}><stop offset="0" stopColor="#ff9fbd" stopOpacity=".55" /><stop offset="1" stopColor="#ff9fbd" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-heart`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffc9d9" /><stop offset="1" stopColor="#ff7fa8" /></linearGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill={u('bg')} stroke="rgba(190,160,255,.5)" strokeWidth="2" />
    <g fill="#eee9ff">
      <circle cx="26" cy="30" r="1.1" opacity=".7" /><circle cx="40" cy="17" r=".8" opacity=".5" /><circle cx="19" cy="57" r=".9" opacity=".45" />
      <circle cx="101" cy="74" r="1" opacity=".5" /><circle cx="88" cy="97" r=".8" opacity=".4" />
    </g>
    <path className="mind-scope-twinkle" d={sparkle(100, 29, 5)} fill="#f6cf7d" />
    <path d={sparkle(33, 42, 3.2)} fill="#f6cf7d" opacity=".8" />
    {/* 삼각대 */}
    <g strokeLinecap="round" fill="none">
      <path d="M58 70 L58 104" stroke="#4b3b86" strokeWidth="3.2" />
      <path d="M57 70 L40 102" stroke="#7d67c2" strokeWidth="3.4" />
      <path d="M59 70 L76 102" stroke="#7d67c2" strokeWidth="3.4" />
    </g>
    {/* 망원경 몸통: 오른쪽 위를 향함 */}
    <g transform="translate(56 66) rotate(-32)">
      <rect x="-38" y="-4.5" width="11" height="9" rx="2.5" fill="#8a74cf" stroke="#2a1f57" strokeWidth="1" />
      <path d="M-28 -6.5 L16 -11.5 L16 11.5 L-28 6.5 Z" fill={u('tube')} stroke="#2a1f57" strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="-8" y="-10" width="5.5" height="20" rx="1.8" fill="#f6cf7d" stroke="#2a1f57" strokeWidth=".9" />
      <rect x="14" y="-16" width="9" height="32" rx="3.5" fill={u('hood')} stroke="#2a1f57" strokeWidth="1.1" />
      <ellipse cx="24.5" cy="0" rx="12.5" ry="17.5" fill={u('glass')} stroke="#f6cf7d" strokeWidth="2.4" />
      <ellipse cx="18.5" cy="-10" rx="1.8" ry="3.4" fill="#fff" opacity=".28" />
    </g>
    <circle cx="56" cy="69" r="4" fill="#f6cf7d" stroke="#2a1f57" strokeWidth="1" />
    {/* 렌즈 속 하트: 회전 밖에서 똑바로 (렌즈 가운데 = 몸통 좌표 (24.5, 0)) */}
    <circle cx="76.8" cy="53" r="11" fill={u('halo')} />
    <g transform="translate(76.8 53.4) scale(1.75)">
      <path className="mind-scope-heart" d="M0 3.4 C-1.3 2.4 -4.2 .5 -4.2 -1.6 C-4.2 -3.1 -3 -4.1 -1.8 -4.1 C-1 -4.1 -.3 -3.7 0 -3 C.3 -3.7 1 -4.1 1.8 -4.1 C3 -4.1 4.2 -3.1 4.2 -1.6 C4.2 .5 1.3 2.4 0 3.4 Z" fill={u('heart')} />
    </g>
  </svg>;
}

/** 외로움 답: 자주일수록 점이 많이 참 (1~3) */
export function FrequencyDots({ value, max = 3 }: { value: number; max?: number }) {
  return <svg className="mind-glyph" viewBox="0 0 36 12" aria-hidden="true" focusable="false">
    {Array.from({ length: max }, (_, i) => <circle key={i} cx={6 + i * 12} cy="6" r="4.2"
      fill={i < value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" opacity={i < value ? 1 : .45} />)}
  </svg>;
}

// 곁에 있는 사람 답 (LSNS 값 0~5 = 없음 · 1명 · 2명 · 3~4명 · 5~8명 · 9명 이상): 사람 수만큼 별
const CLUSTERS: [number, number, number][][] = [
  [],
  [[18, 13, 6]],
  [[12, 15, 5], [25, 10, 5]],
  [[9, 16, 4.5], [19, 8, 4.5], [28, 17, 4.5]],
  [[7, 9, 3.8], [17, 17, 3.8], [27, 8, 3.8], [12, 24, 3], [29, 21, 3]],
  [[6, 8, 3.2], [14, 16, 3.2], [24, 7, 3.2], [31, 15, 3.2], [9, 24, 2.6], [20, 24, 2.6], [29, 25, 2.4], [18, 4, 2.2]],
];
export function StarCluster({ value }: { value: number }) {
  const stars = CLUSTERS[value] ?? [];
  return <svg className="mind-glyph" viewBox="0 0 36 30" aria-hidden="true" focusable="false">
    {stars.length === 0
      ? <circle cx="18" cy="15" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 3" opacity=".6" />
      : stars.map(([x, y, r], i) => <path key={i} d={sparkle(x, y, r)} fill="currentColor" />)}
  </svg>;
}

/** 지난 2주 마음 답 (WHO-5 값 0~5): 늘 그랬어요 = 보름달 … 전혀 아니었어요 = 빈 달 */
export function MoonPhase({ value }: { value: number }) {
  const f = value / 5, r = 9, cx = 12, cy = 12;
  const rx = Math.abs(1 - 2 * f) * r;
  return <svg className="mind-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".55" />
    {f > 0 && <path d={`M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx} ${cy + r}A${rx} ${r} 0 0 ${f > .5 ? 1 : 0} ${cx} ${cy - r}Z`} fill="currentColor" />}
  </svg>;
}

/** 묶음을 대표하는 그림 (소개·결과 칸): 외로움 = 홀로 있는 별, 곁에 있는 사람 = 별 무리, 지난 2주 마음 = 반달 */
export function ScaleGlyph({ scale }: { scale: ScaleId }) {
  if (scale === 'lsns') return <StarCluster value={3} />;
  if (scale === 'who5') return <MoonPhase value={3} />;
  return <svg className="mind-glyph" viewBox="0 0 36 30" aria-hidden="true" focusable="false">
    <circle cx="18" cy="15" r="11" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 3.5" opacity=".5" />
    <path d={sparkle(18, 15, 6)} fill="currentColor" />
  </svg>;
}
