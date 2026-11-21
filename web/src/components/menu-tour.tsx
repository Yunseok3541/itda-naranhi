"use client";
// 메인 메뉴 한 장 안내 (시작 안내를 마친 뒤 메인에 처음 들어왔을 때 한 번, docs/온보딩.md)
// - 화면을 어둡게 하고 실제 버튼 자리에 점선 테두리 + 바로 옆에 한 줄 설명 (참고: 모빌리티·배달 앱의 홈 화면 코치마크)
// - 한 장으로 끝. 아무 데나 누르거나 Esc로 닫으면 다시 나오지 않음 → 이어서 기존 첫 안내(하늘 끌기·별 누르기) 카드가 나옴
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { finishMenuTour } from '@/lib/service-guide';
import { useCloseDialogOnHide } from './use-close-dialog-on-hide';

/** 위에서 아래, 왼쪽에서 오른쪽 순서. 화면에 없는 버튼(작은 화면에서 숨은 하늘 지도 등)은 건너뜀. 설명은 버튼 옆에 한 줄로 붙으니 짧게 */
// side: 'left'면 버튼 왼쪽에 붙임 (하늘 지도는 도감 바로 위에 있어서, 위쪽에 붙이면 서로 가림)
const TARGETS: readonly { selector: string; name: string; text: string; side?: 'left' }[] = [
  { selector: '.sky-top .sky-help-button', name: '도움받을 곳', text: '힘들 때 연락할 곳' },
  { selector: '.sky-top .sky-resource-button', name: '청년센터·정책', text: '가까운 센터와 맞춤 정책' },
  { selector: '.night-list-trigger', name: '모든 별 보기', text: '내 별을 목록으로 한눈에' },
  { selector: '.sky-minimap', name: '하늘 지도', text: '다른 별자리로 이동해요', side: 'left' },
  { selector: '.sky-actions a[href="/profile"]', name: '프로필', text: '기록·배지·상점' },
  { selector: '.sky-actions .dock-main', name: '오늘의 별', text: '한 줄 쓰고 오늘의 별 찾기' },
  { selector: '.sky-actions a[href="/catalog"]', name: '도감', text: '만난 친구들', side: 'left' },
];
const PAD = 4, GAP = 8, LABEL = 30, EDGE = 8;

type Spot = {
  name: string; text: string; top: number; left: number; width: number; height: number; radius: string;
  /** 설명 자리: 화면 위쪽 버튼은 아래에, 아래쪽 버튼은 위에(가로는 버튼이 있는 쪽 끝에 맞춤), side면 버튼 왼쪽 가운데 */
  label: { top: number; left?: number; right?: number; center?: number; side?: true; maxWidth?: number };
};

function measure(): { spots: Spot[]; cardCenter: number } {
  const viewWidth = window.innerWidth, viewHeight = window.innerHeight;
  const found = TARGETS.flatMap(target => {
    const element = document.querySelector<HTMLElement>(target.selector);
    if (!element || !element.checkVisibility?.()) return [];
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.bottom < 0 || rect.top > viewHeight) return [];
    return [{ target, element, rect }];
  });
  const spots = found.map(({ target, element, rect }) => {
    const radius = getComputedStyle(element).borderRadius;
    const top = rect.top - PAD, left = rect.left - PAD, width = rect.width + PAD * 2, height = rect.height + PAD * 2;
    const upper = rect.top + rect.height / 2 < viewHeight / 2;
    const middle = rect.left + rect.width / 2;
    // 왼쪽에 붙일 때: 같은 높이에서 왼쪽에 있는 다른 버튼까지의 빈칸만큼만 (좁으면 두 줄)
    const leftNeighbor = Math.max(EDGE, ...found
      .filter(other => other.rect !== rect && other.rect.right <= rect.left && other.rect.top < rect.bottom && other.rect.bottom > rect.top)
      .map(other => other.rect.right + PAD + GAP));
    const label: Spot['label'] = target.side === 'left' ? {
      top: top + height / 2, right: viewWidth - left + GAP, side: true, maxWidth: Math.max(48, left - GAP - leftNeighbor),
    } : {
      top: upper ? top + height + GAP : top - GAP - LABEL,
      ...(middle < viewWidth / 3 ? { left: Math.max(EDGE, left) }
        : middle > viewWidth * 2 / 3 ? { right: Math.max(EDGE, viewWidth - left - width) }
        : { center: middle }),
    };
    return { name: target.name, text: target.text, top, left, width, height, label,
      radius: radius && radius !== '0px' ? `calc(${radius} + ${PAD}px)` : '14px' };
  });
  // 가운데 카드: 위쪽 설명들 아래와 아래쪽 설명들 위 사이의 한가운데
  const above = Math.max(0, ...spots.filter(s => !s.label.side && s.label.top > s.top).map(s => s.label.top + LABEL));
  // 아래쪽: 위에 붙은 설명의 윗변, 왼쪽에 붙은 설명이 있는 버튼은 버튼(과 두 줄 설명)의 윗변
  const below = Math.min(viewHeight, ...spots.filter(s => s.top > viewHeight / 2)
    .map(s => s.label.side ? Math.min(s.top, s.label.top - LABEL) : s.label.top));
  return { spots, cardCenter: below > above ? (above + below) / 2 : viewHeight / 2 };
}

export default function MenuTour() {
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<{ spots: Spot[]; cardCenter: number } | null>(null);
  // 아주 작은 화면에서 설명끼리(또는 카드·다른 버튼과) 겹치면: 버튼에는 번호만, 설명은 가운데 카드 목록으로
  const [compact, setCompact] = useState(false);
  useCloseDialogOnHide(dialog);

  // 메인 버튼들은 등장 효과(screen-rise)로 조금 움직이며 나타남 → 효과가 끝나 자리 잡은 뒤에 재고(늦어도 1.2초), 화면 크기가 바뀌면 다시 잼
  // 움직이는 도중에 재면 겹친다고 잘못 판단해 작은 화면 방식으로 바뀌므로 그 전에는 테두리·설명을 그리지 않음
  useEffect(() => {
    let active = true;
    const update = () => { if (active) setLayout(measure()); };
    const rising = document.getAnimations()
      .filter(animation => animation instanceof CSSAnimation && animation.animationName === 'screen-rise')
      .map(animation => animation.finished.catch(() => undefined));
    const fallback = window.setTimeout(update, 1200);
    void Promise.all(rising).then(() => { window.clearTimeout(fallback); requestAnimationFrame(update); });
    window.addEventListener('resize', update);
    return () => { active = false; window.clearTimeout(fallback); window.removeEventListener('resize', update); };
  }, []);

  useLayoutEffect(() => {
    const modal = dialog.current;
    if (compact || !modal || !layout?.spots.length) return;
    const boxes = [...modal.querySelectorAll<HTMLElement>('.menu-tour-label, .menu-tour-card')].map(element => element.getBoundingClientRect());
    const spotsBoxes = [...modal.querySelectorAll<HTMLElement>('.menu-tour-spot')].map(element => element.getBoundingClientRect());
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const labelsClash = boxes.some((a, i) => boxes.some((b, j) => j > i && hit(a, b)));
    // 설명 i는 버튼 i의 것. 다른 버튼 테두리를 덮거나, 카드(마지막 상자)가 버튼을 덮으면 겹침
    const card = boxes[boxes.length - 1];
    const spotClash = spotsBoxes.some((spot, i) => boxes.some((box, j) => j !== i && hit(box, spot)) || hit(card, spot));
    const offscreen = boxes.some(box => box.left < 0 || box.right > window.innerWidth || box.top < 0 || box.bottom > window.innerHeight);
    if (!labelsClash && !spotClash && !offscreen) return;
    const frame = requestAnimationFrame(() => setCompact(true));
    return () => cancelAnimationFrame(frame);
  }, [layout, compact]);

  useEffect(() => {
    const modal = dialog.current;
    if (modal && !modal.open) modal.showModal();
    start.current?.focus({ preventScroll: true });
  }, []);

  const spots = layout?.spots ?? [];
  return <dialog ref={dialog} className={`menu-tour${compact ? ' compact' : ''}`} aria-labelledby="menu-tour-title" aria-describedby="menu-tour-list"
    onCancel={event => { event.preventDefault(); finishMenuTour(); }}
    onClick={() => finishMenuTour()}>
    {spots.map((spot, i) => <span key={spot.name} aria-hidden="true">
      <span className="menu-tour-spot" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: spot.radius }}>
        {compact && <b>{i + 1}</b>}
      </span>
      {!compact && <span className={`menu-tour-label${spot.label.center !== undefined ? ' center' : ''}${spot.label.side ? ' side' : ''}`}
        style={{ top: spot.label.top, left: spot.label.left ?? spot.label.center, right: spot.label.right, maxWidth: spot.label.maxWidth }}>{spot.text}</span>}
    </span>)}
    <div className="menu-tour-card" style={layout && !compact ? { top: layout.cardCenter } : undefined}>
      <h2 id="menu-tour-title">내 밤하늘은 이렇게 생겼어요</h2>
      <ol id="menu-tour-list" className={compact ? 'menu-tour-list' : 'sr-only'}>{spots.map(spot => <li key={spot.name}><b>{spot.name}</b> {spot.text}</li>)}</ol>
      <p>하늘을 끌어 둘러보고, 반짝이는 별을 누르면 그 별의 일이 열려요.</p>
      <button ref={start} type="button" className="menu-tour-start">둘러보기 시작</button>
    </div>
  </dialog>;
}
