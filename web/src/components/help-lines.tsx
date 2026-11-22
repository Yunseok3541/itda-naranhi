"use client";
import { useId, useRef } from 'react';
import { HELP_MESSAGE } from '@/lib/safety';
import SkyControlIcon from './sky-control-icon';

export const HELP = {
  title: '도움받을 곳',
  lines: [
    '이 앱은 상담을 대신하지 않아요. 힘들 때는 혼자 감당하지 않아도 돼요.',
    ...HELP_MESSAGE.lines.slice(0, 2),
    '가까운 청년센터·정신건강복지센터에서도 도움을 받을 수 있어요.',
  ],
};

export default function HelpLines({ lines }: { lines: string[] }) {
  return <div className="help-lines">{lines.map(line => {
    const contact = /^(자살예방상담전화|정신건강위기상담전화) (109|1577-0199)( \(24시간\))?$/.exec(line);
    if (!contact) return <p className="help-copy" key={line}>{line}</p>;
    const [, title, number, hours] = contact;
    return <HelpPhone key={line} title={title} number={number} hours={hours?.trim().slice(1, -1)} />;
  })}</div>;
}

/** 상담 전화: 누르면 바로 걸지 않고 안내 창을 한 번 띄움 (고민기록 #61)
 *  실수로 눌러 갑자기 전화가 걸리면 놀라거나 다시는 누르지 않을 수 있어서. 모양은 청년센터 전화 확인 창(centers-screen.tsx)과 같게
 *  말투는 "정말 걸까요?"처럼 되묻지 않고 "연결할게요"처럼 앞으로 이어 줌 (망설이게 하지 않으려고) */
function HelpPhone({ title, number, hours }: { title: string; number: string; hours?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => dialog.current?.close();
  const tel = `tel:${number.replace('-', '')}`;
  // <p> 안에는 <dialog>를 둘 수 없어 <div>로
  return <div className="help-phone-row">
    {/* 링크 모양(앱 공통 금빛 버튼 규칙을 피함)은 그대로 두고, 누르면 바로 걸지 않고 확인 창을 띄움 */}
    <a className="help-phone" href={tel} aria-haspopup="dialog"
      onClick={event => { event.preventDefault(); dialog.current?.showModal(); }}>
      <span className="help-phone-name">{title}{hours && <small>{hours}</small>}</span>
      <strong><SkyControlIcon name="phone" />{number}</strong>
    </a>
    <dialog ref={dialog} className="screen-help-dialog center-call-dialog" aria-labelledby={titleId}
      onClick={event => {
        // 창 바깥(어두운 배경)을 누르면 닫힘. 창 안쪽 여백과 구분하려고 위치로 판단,
        // 안쪽 단추·안쪽 창에서 올라온 클릭(키보드로 누르면 좌표가 0)은 무시하려고 대상도 확인
        const r = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close();
      }}>
      <h2 id={titleId}>{title}에 연결할게요</h2>
      <p className="center-call-number"><SkyControlIcon name="phone" />{number}</p>
      <p className="small">{hours ? `${hours} 받아요. ` : ''}아래 버튼을 누르면 바로 전화가 걸려요.</p>
      <a className="primary center-call-go" href={tel} onClick={close}>전화 걸기</a>
      <button type="button" className="text-button center-call-cancel" onClick={close}>다음에 할게요</button>
    </dialog>
  </div>;
}

export function HelpPanelContent({ titleId, title, lines, onClose }: {
  titleId: string; title: string; lines: string[]; onClose: () => void;
}) {
  return <>
    <header className="help-panel-heading">
      <h2 id={titleId}><SkyControlIcon name="help" /> {title}</h2>
      <button type="button" className="text-button help-panel-close" aria-label="도움받을 곳 닫기" onClick={onClose}>
        <SkyControlIcon name="close" />
      </button>
    </header>
    <HelpLines lines={lines} />
  </>;
}
