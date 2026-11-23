import type { AccessoryId } from '@/lib/shop';
import { useId } from "react";

// 메인 배경 캐릭터 (사람, 성별이 드러나지 않게): 2등신 · 둥근 짧은 머리 · 후드티와 바지 · 웃는 눈
// 사용자를 바라보며 한 손을 하늘로 흔듦. 메인에서는 오늘의 별을 여는 단추의 그림으로 쓴다.
// 긴 머리·치마·속눈썹·화장처럼 성별을 떠올리게 하는 요소는 넣지 않는다
// 예전 그림(public/sky-preview/foreground.webp)은 되돌리기용으로 남겨 둠
export default function SkyPerson({ portrait = false, sculpted = false, character = 'person', item = null, animate = false }: {
  portrait?: boolean; sculpted?: boolean; character?: string; item?: AccessoryId | null; animate?: boolean;
}) {
  const haloId = useId();
  const wornArt = item ? `/shop/worn/${character}-${item}.webp` : null;
  const wornClass = animate && item === 'star-pin' ? 'accessory-arrives' : undefined;
  if (sculpted && character !== 'person') return <svg className="sky-person" viewBox={portrait ? '-28 17 156 156' : '0 0 100 172'} aria-hidden="true">
    <svg y="54" x="-8" width="116" height="116" viewBox="0 0 100 100" overflow="visible">
      {wornArt
        ? <image data-accessory={item} className={wornClass} href={wornArt} x="-9" y="-26" width="118" height="126" preserveAspectRatio="xMidYMax meet" />
        : <image href={`/catalog/${character}.webp`} width="100" height="100" />}
    </svg>
  </svg>;
  if (sculpted) return (
    <svg className="sky-person" viewBox={portrait ? (item === 'moon-hat' ? '-43 -87 186 186' : '-34 -62 168 168') : '0 0 100 172'} aria-hidden="true">
      <ellipse cx="50" cy="166" rx="24" ry="4.5" fill="#0b0818" opacity=".45" />
      <defs>
        <radialGradient id={haloId}>
          <stop stopColor="#ffe0a4" stopOpacity=".42" />
          <stop offset=".48" stopColor="#c4a1ff" stopOpacity=".30" />
          <stop offset="1" stopColor="#ab83ef" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="86" rx="77" ry="75" fill={`url(#${haloId})`} />
      {wornArt
        ? <image data-accessory={item} className={wornClass} href={wornArt} x="-23.2" y="-72" width="146.4" height="237" preserveAspectRatio="xMidYMax meet" />
        : <image href="/sky-preview/person.webp" x="-23.2" y="-42" width="146.4" height="207" preserveAspectRatio="xMidYMax meet" />}
      <path d="M91 35 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4z" fill="#f6cf7d" className="sky-person-spark" />
    </svg>
  );
  const hair = '#3a2d55';
  const skin = '#f6dccb';
  const hoodie = '#8c7ad6';
  const hoodieShade = '#6f5dbb';
  return (
    <svg className="sky-person" viewBox={portrait ? '0 8 100 100' : '0 0 100 172'} aria-hidden="true">
      {/* 발밑 그림자 */}
      <ellipse cx="50" cy="166" rx="24" ry="4.5" fill="#0b0818" opacity=".45" />
      {/* 다리·운동화 */}
      <path d="M40 128h9v30h-9z M51 128h9v30h-9z" fill="#3b3360" />
      <ellipse cx="44" cy="160" rx="7.5" ry="4.6" fill="#f1edf9" />
      <ellipse cx="56" cy="160" rx="7.5" ry="4.6" fill="#f1edf9" />
      <path d="M36.6 161.5h14.8 M48.6 161.5h14.8" stroke="#cfc6e6" strokeWidth="1.6" strokeLinecap="round" />
      {/* 내린 팔 (몸 뒤) */}
      <path d="M33 93 L27 119" stroke={hoodieShade} strokeWidth="10" strokeLinecap="round" />
      <circle cx="26.5" cy="122.5" r="4.6" fill={skin} />
      {/* 후드티 몸통 */}
      <path d="M31 93 Q33 84 41 82 L59 82 Q67 84 69 93 L71.5 128 Q50 133.5 28.5 128 Z" fill={hoodie} />
      <path d="M28.5 124 Q50 130 71.5 124 L71.5 128.5 Q50 134 28.5 128.5 Z" fill={hoodieShade} />
      {/* 앞주머니·끈 */}
      <path d="M37 109 Q50 106 63 109 L61.5 120 Q50 123 38.5 120 Z" fill={hoodieShade} opacity=".75" />
      <path d="M45.5 87 L44.5 100 M54.5 87 L55.5 100" stroke="#f1edf9" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="44.4" cy="101.2" r="1.4" fill="#f1edf9" />
      <circle cx="55.6" cy="101.2" r="1.4" fill="#f1edf9" />
      {/* 든 팔 (하늘로 손 흔들기) + 손끝 별 */}
      <path d="M66 90 Q76 76 81 56" stroke={hoodie} strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="82" cy="50.5" r="5" fill={skin} />
      <path d="M91 35 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4z" fill="#f6cf7d" className="sky-person-spark" />
      {/* 후드(목 뒤) */}
      <ellipse cx="50" cy="83" rx="17" ry="6" fill={hoodieShade} />
      {/* 귀·얼굴 */}
      <circle cx="25.5" cy="62" r="4.4" fill={skin} />
      <circle cx="74.5" cy="62" r="4.4" fill={skin} />
      <circle cx="50" cy="58" r="25" fill={skin} />
      {/* 둥근 짧은 머리 + 앞머리 + 삐친 머리 한 가닥 */}
      <path d="M24.5 61 Q21 31 50 29.5 Q79 31 75.5 61 Q72.5 51 66.5 47.5 Q62.5 54 56.5 49 Q51.5 55.5 46 48.5 Q40.5 54.5 35 47.5 Q28.5 51.5 24.5 61 Z" fill={hair} />
      <path d="M50 30 Q53 21 60 22 Q54 24 53.5 30" fill="none" stroke={hair} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33 38 Q40 32 48 32" fill="none" stroke="#6c5a96" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
      {/* 웃는 눈 · 볼 · 입 */}
      <path d="M38.5 63 q4 -4.4 8 0 M53.5 63 q4 -4.4 8 0" fill="none" stroke={hair} strokeWidth="2.3" strokeLinecap="round" />
      <ellipse cx="36.5" cy="69" rx="4.2" ry="2.6" fill="#f2a7a7" opacity=".6" />
      <ellipse cx="63.5" cy="69" rx="4.2" ry="2.6" fill="#f2a7a7" opacity=".6" />
      <path d="M46.6 70.2 q3.4 3.4 6.8 0" fill="none" stroke="#8a4b5a" strokeWidth="1.8" strokeLinecap="round" />
      {/* 뒤쪽 하늘빛 테두리 */}
      <path d="M71 40 A25 25 0 0 1 75.5 60" fill="none" stroke="#c9b8ff" strokeWidth="1.6" opacity=".55" />
      <path d="M69.5 96 L71.5 126" stroke="#c9b8ff" strokeWidth="1.4" opacity=".4" strokeLinecap="round" />
    </svg>
  );
}
