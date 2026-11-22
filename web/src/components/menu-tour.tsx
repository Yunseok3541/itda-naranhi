"use client";
// 메인 메뉴 안내 (시작 안내를 마친 뒤 메인에 처음 들어왔을 때 한 번, docs/온보딩.md)
// - 버튼을 하나씩 차례로 비추고(나머지는 어둡게), 그 옆에 첫 안내 카드(.sky-hint)와 같은 모양의 설명 카드
// - 카드에는 "다음"만 (첫 안내 카드처럼 단추 하나). 어두운 곳을 눌러도 다음, Esc는 닫기. 마지막 "알겠어요"로 끝나면 다시 나오지 않음
//   → 이어서 기존 첫 안내(하늘 끌기·별 누르기) 카드가 나옴
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { finishMenuTour } from '@/lib/service-guide';
import { useCloseDialogOnHide } from './use-close-dialog-on-hide';

/** 위에서 아래, 왼쪽에서 오른쪽 순서. 화면에 없는 버튼(작은 화면에서 숨은 하늘 지도 등)은 건너뜀 */
const TARGETS: readonly { selector: string; name: string; text: string }[] = [
  { selector: '.sky-top .sky-help-button', name: '도움받을 곳', text: '힘들 때 연락할 곳을 언제든 볼 수 있어요' },
  { selector: '.sky-top .sky-resource-button', name: '청년센터·정책', text: '가까운 청년센터와 나에게 맞는 정책을 찾아요' },
  { selector: '.night-list-trigger', name: '별 목록', text: '별자리마다 해 볼 일을 목록으로 볼 수 있어요' },
  { selector: '.sky-minimap', name: '하늘 지도', text: '다른 별자리로 하늘을 옮겨 가요' },
  { selector: '.sky-quest-character', name: '오늘의 별', text: '캐릭터를 누르면 한 줄을 남기고 오늘 해 볼 별을 찾을 수 있어요' },
  { selector: '.sky-actions a[href="/profile"]', name: '프로필', text: '내 기록과 배지, 별빛 상점이 있어요' },
  { selector: '.sky-actions a[href="/catalog"]', name: '친구 도감', text: '별자리를 완성하면 만나는 친구들이에요' },
];
const PAD = 6, GAP = 14, EDGE = 16, CARD_MAX = 320;

type Spot = { name: string; text: string; top: number; left: number; width: number; height: number; radius: string };

function measure(): Spot[] {
  return TARGETS.flatMap(target => {
    const element = document.querySelector<HTMLElement>(target.selector);
    if (!element || !element.checkVisibility?.()) return [];
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.bottom < 0 || rect.top > window.innerHeight) return [];
    const radius = getComputedStyle(element).borderRadius;
    return [{ name: target.name, text: target.text, top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
      radius: radius && radius !== '0px' ? `calc(${radius} + ${PAD}px)` : '16px' }];
  });
}

/** 설명 카드 자리: 화면 위쪽 버튼이면 아래에, 아래쪽 버튼이면 위에. 가로는 화면 가운데, 꼬리는 버튼 쪽을 가리킴 */
function cardPlacement(spot: Spot) {
  const viewWidth = window.innerWidth, viewHeight = window.innerHeight;
  const width = Math.min(CARD_MAX, viewWidth - EDGE * 2);
  const left = (viewWidth - width) / 2;
  const below = spot.top + spot.height / 2 < viewHeight / 2;
  const tail = Math.min(width - 24, Math.max(24, spot.left + spot.width / 2 - left));
  const style: CSSProperties = { left, width, ['--tail' as string]: `${tail}px`,
    ...(below ? { top: spot.top + spot.height + GAP } : { bottom: viewHeight - spot.top + GAP }) };
  return { style, below };
}

export default function MenuTour() {
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [step, setStep] = useState(0);
  useCloseDialogOnHide(dialog);

  // 메인 버튼들은 등장 효과(screen-rise)로 조금 움직이며 나타남 → 효과가 끝나 자리 잡은 뒤에 재고(늦어도 1.2초), 화면 크기가 바뀌면 다시 잼
  useEffect(() => {
    let active = true;
    const update = () => { if (active) setSpots(measure()); };
    const rising = document.getAnimations()
      .filter(animation => animation instanceof CSSAnimation && animation.animationName === 'screen-rise')
      .map(animation => animation.finished.catch(() => undefined));
    const fallback = window.setTimeout(update, 1200);
    void Promise.all(rising).then(() => { window.clearTimeout(fallback); requestAnimationFrame(update); });
    window.addEventListener('resize', update);
    return () => { active = false; window.clearTimeout(fallback); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
  }, []);

  // 단계가 바뀌면 "다음" 단추로 초점 (Enter·Space로 계속 넘길 수 있게)
  useEffect(() => { next.current?.focus({ preventScroll: true }); }, [step, spots]);

  // 비출 버튼이 하나도 없으면(아주 특이한 화면) 안내를 끝냄
  useEffect(() => { if (spots && spots.length === 0) finishMenuTour(); }, [spots]);

  const spot = spots?.[Math.min(step, spots.length - 1)];
  const total = spots?.length ?? 0;
  const last = step >= total - 1;
  const advance = () => { if (last) finishMenuTour(); else setStep(s => s + 1); };
  const placement = spot ? cardPlacement(spot) : null;

  return <dialog ref={dialog} className="menu-tour" aria-labelledby="menu-tour-title" aria-describedby="menu-tour-text"
    onCancel={event => { event.preventDefault(); finishMenuTour(); }}
    onClick={advance}>
    {spot && <span className="menu-tour-spot" aria-hidden="true"
      style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: spot.radius }} />}
    {spot && placement && <div key={step} className={`menu-tour-card ${placement.below ? 'below' : 'above'}`} style={placement.style}
      onClick={event => event.stopPropagation()}>
      <p aria-live="polite">
        <b id="menu-tour-title">{spot.name} <span className="menu-tour-count">{step + 1}/{total}</span></b>
        <span id="menu-tour-text">{spot.text}</span>
      </p>
      <button ref={next} type="button" className="text-button menu-tour-next" onClick={advance}>{last ? '알겠어요' : '다음'}</button>
    </div>}
  </dialog>;
}
