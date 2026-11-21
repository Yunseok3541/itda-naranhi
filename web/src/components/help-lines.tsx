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
    return <p className="help-phone-row" key={line}><a className="help-phone" href={`tel:${number.replace('-', '')}`}>
      <span className="help-phone-name">{title}{hours && <small>{hours.trim().slice(1, -1)}</small>}</span>
      <strong><SkyControlIcon name="phone" />{number}</strong>
    </a></p>;
  })}</div>;
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
