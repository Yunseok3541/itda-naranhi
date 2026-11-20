"use client";

// 신청 도우미 (챗봇형, 고민기록 #39). 정책 카드의 [신청 도와줘]로 연다
// - 버튼으로 시작: 신청 순서 · 서류 · 뭐라고 말하지? · 말하기 연습 · 직접 물어볼래 · 작게 시작
// - 말하기 연습과 직접 질문만 글을 적는다. 대화는 저장하지 않음 (창을 닫으면 사라짐)
// - 예시 모드는 서버 없이 같은 규칙 문장으로 답한다 (AI 없음)
import { useEffect, useRef, useState } from 'react';
import {
  docsReply, fallbackScript, fallbackStaffLine, INTENT_LABEL, notFoundReply, practiceReply, PRACTICE_MAX_TURNS, scriptReply,
  startReply, stepsReply, type HelperIntent, type HelperPolicy, type HelperReply,
} from '@/lib/apply-helper';
import { request, type Help, type Mode } from '@/lib/mobile-data';

type Reply = HelperReply & { help?: Help };
type Message = { id: number; from: 'me' | 'bot'; text: string; reply?: Reply };
type Turn = { role: 'user' | 'staff'; text: string };

const MENU: HelperIntent[] = ['steps', 'docs', 'script', 'practice', 'ask', 'start'];

/** 예시 모드: 서버 없이 규칙 문장으로 */
function exampleReply(policy: HelperPolicy, intent: HelperIntent, text: string, userTurns: number): Reply {
  if (intent === 'steps') return stepsReply(policy);
  if (intent === 'docs') return docsReply(policy);
  if (intent === 'start') return startReply(policy);
  if (intent === 'script') return scriptReply(policy, fallbackScript(policy, text || null), 'fallback');
  if (intent === 'practice') return practiceReply(fallbackStaffLine(userTurns), null, userTurns, 'rule');
  return notFoundReply();
}

export default function ApplyHelper({ policyId, title, mode, examplePolicy, onClose }: {
  policyId: number; title: string; mode: Mode; examplePolicy: HelperPolicy; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<'ask' | 'practice' | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Turn[]>([]);
  const [lastQuestion, setLastQuestion] = useState('');
  const nextId = useRef(1);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  const push = (m: Omit<Message, 'id'>) => setMessages(prev => [...prev, { ...m, id: nextId.current++ }]);

  async function ask(intent: HelperIntent, said = '') {
    if (busy) return;
    const userTurns = history.filter(t => t.role === 'user').length + (said ? 1 : 0);
    // 직접 질문은 글을 받은 뒤에, 연습은 시작 버튼이면 담당자 인사부터
    if (intent === 'ask' && !said) { setInput('ask'); return; }
    push({ from: 'me', text: said || INTENT_LABEL[intent] });
    if (intent === 'ask') setLastQuestion(said);
    if (intent !== 'practice') { setInput(null); setHistory([]); }
    setBusy(true);
    try {
      // 대본은 방금 물어본 질문(원문에 없던 것)을 넣어 만든다
      const sendText = intent === 'script' ? said || lastQuestion : said;
      const sendHistory = intent === 'practice' ? history : undefined;
      const reply: Reply = mode === 'api'
        ? await request<Reply>(`policies/${policyId}/helper`, 'POST', { intent, ...(sendText ? { text: sendText } : {}), ...(sendHistory ? { history: sendHistory } : {}) })
        : exampleReply(examplePolicy, intent, sendText, userTurns);
      push({ from: 'bot', text: reply.reply, reply });
      if (intent === 'practice') {
        const next: Turn[] = [...history, ...(said ? [{ role: 'user' as const, text: said }] : []), ...(reply.staffLine ? [{ role: 'staff' as const, text: reply.staffLine }] : [])];
        setHistory(next);
        setInput(reply.turnsLeft ? 'practice' : null);
      }
    } catch (e) {
      const help = (e as { help?: Help }).help ?? null;
      push({ from: 'bot', text: e instanceof Error ? e.message : '지금은 도와드리기 어려워요.', reply: { intent, reply: '', sections: [], source: 'rule', followUps: [], help } });
    } finally { setBusy(false); }
  }

  function send() {
    const t = text.trim();
    if (!t || !input) return;
    setText('');
    void ask(input, t);
  }

  return <dialog ref={dialog} className="apply-helper" aria-labelledby="apply-helper-title" onClose={onClose}>
    <header>
      <div>
        <p className="small">신청 도우미</p>
        <h2 id="apply-helper-title">{title}</h2>
      </div>
      <button type="button" className="apply-helper-close" onClick={() => dialog.current?.close()} aria-label="닫기">✕</button>
    </header>
    <div className="apply-helper-log" aria-live="polite">
      <div className="bubble bot"><p>어디서 막혔는지 골라 주세요. 원문에 있는 내용만 알려 드려요. 이 대화는 저장하지 않아요.</p></div>
      {messages.map(m => <Bubble key={m.id} message={m} onPick={intent => void ask(intent)} disabled={busy} />)}
      {busy && <div className="bubble bot" role="status"><p>생각하고 있어요…</p></div>}
      <div ref={end} />
    </div>
    {input ? <form className="apply-helper-input" onSubmit={e => { e.preventDefault(); send(); }}>
      <label htmlFor="apply-helper-text" className="small">
        {input === 'practice' ? `담당자에게 할 말 (남은 연습 ${PRACTICE_MAX_TURNS - history.filter(t => t.role === 'user').length}번)` : '궁금한 점 (원문에서 찾아 볼게요)'}
      </label>
      <div>
        <input id="apply-helper-text" type="text" maxLength={200} value={text} onChange={e => setText(e.target.value)} autoComplete="off"
          placeholder={input === 'practice' ? '예: 안녕하세요, 정책 문의드려요' : '예: 혼자 신청해도 돼요?'} />
        <button type="submit" disabled={busy || !text.trim()}>보내기</button>
      </div>
      <button type="button" className="apply-helper-link" onClick={() => { setInput(null); setHistory([]); }}>
        {input === 'practice' ? '연습 그만하기' : '다른 걸 고를래요'}
      </button>
    </form> : <nav className="apply-helper-menu" aria-label="도움 고르기">
      {MENU.map(intent => <button key={intent} type="button" disabled={busy} onClick={() => void ask(intent)}>{INTENT_LABEL[intent]}</button>)}
    </nav>}
  </dialog>;
}

function Bubble({ message, onPick, disabled }: { message: Message; onPick: (intent: HelperIntent) => void; disabled: boolean }) {
  const r = message.reply;
  if (message.from === 'me') return <div className="bubble me"><p>{message.text}</p></div>;
  return <div className="bubble bot">
    {r?.staffLine && <p className="staff"><span className="small">담당자</span>{r.staffLine}</p>}
    {r?.tip && <p className="tip">✦ {r.tip}</p>}
    {message.text && message.text.split('\n').map((line, i) => <p key={i} className={i > 0 ? 'small' : undefined}>{line}</p>)}
    {r?.sections.map(s => <div key={s.title}><h3>{s.title}</h3><ol>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ol></div>)}
    {r?.script && <div className="script">
      <h3>{r.script.label}</h3>
      <p>{r.script.opening}</p>
      <ul>{r.script.questions.map(q => <li key={q}>{q}</li>)}</ul>
      <p>{r.script.closing}</p>
      <button type="button" className="apply-helper-link" onClick={() => {
        const all = [r.script!.opening, ...r.script!.questions, r.script!.closing].join('\n');
        void navigator.clipboard?.writeText(all).catch(() => {});
      }}>대본 복사하기</button>
    </div>}
    {r && r.source === 'ai' && r.intent === 'script' && <p className="small">AI가 원문을 바탕으로 만들었어요. 틀릴 수 있어요.</p>}
    {r && r.source === 'ai' && r.intent === 'practice' && <p className="small">연습용 AI 담당자예요. 실제 안내와 다를 수 있어요.</p>}
    {r?.help && <div className="help"><h3>{r.help.title}</h3>{r.help.lines.map(line => <p key={line}>{line}</p>)}</div>}
    {r && r.followUps.length > 0 && <div className="apply-helper-follow">
      {r.followUps.map(intent => <button key={intent} type="button" disabled={disabled} onClick={() => onPick(intent)}>{INTENT_LABEL[intent]}</button>)}
    </div>}
  </div>;
}
