"use client";

// 신청 도우미 (챗봇형, 고민기록 #39 → 자유 대화 #43). 정책 카드의 [신청 도와줘]로 연다
// - 입력창 하나로 바로 대화 (chat). 확실한 말("서류 뭐야")은 서버가 규칙으로 바로, 나머지는 AI가 원문 안에서 답함
// - 버튼은 입력창 위 칩으로: 신청 순서 · 서류 · 뭐라고 말하지? · 말하기 연습 · 작게 시작
// - 말하기 연습은 따로 들어가는 모드 (AI가 담당자 역할 → 도우미 답과 섞이지 않게)
// - 대화는 저장하지 않음 (창을 닫으면 사라짐). 예시 모드는 서버 없이 같은 규칙 문장으로 답한다 (AI 없음)
import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MAX_TURNS, chatFallback, docsReply, fallbackScript, fallbackStaffLine, INTENT_LABEL, PRACTICE_MAX_TURNS, PRACTICE_SUGGEST,
  practiceReply, routeChat, scriptReply, startReply, stepsReply, type HelperIntent, type HelperPolicy, type HelperReply,
} from '@/lib/apply-helper';
import { request, type Help, type Mode } from '@/lib/mobile-data';

type Reply = HelperReply & { help?: Help };
type Message = { id: number; from: 'me' | 'bot'; text: string; reply?: Reply };
type Turn = { role: 'user' | 'staff' | 'bot'; text: string };

const CHIPS: HelperIntent[] = ['steps', 'docs', 'script', 'practice', 'start'];

/** 예시 모드: 서버 없이 규칙 문장으로 */
function exampleReply(policy: HelperPolicy, intent: HelperIntent, text: string, userTurns: number): Reply {
  if (intent === 'steps') return stepsReply(policy);
  if (intent === 'docs') return docsReply(policy);
  if (intent === 'start') return startReply(policy);
  if (intent === 'script') return scriptReply(policy, fallbackScript(policy, text || null), 'fallback');
  if (intent === 'practice') return practiceReply(fallbackStaffLine(userTurns), null, userTurns, 'rule');
  const routed = routeChat(text);
  if (routed === 'practice') return PRACTICE_SUGGEST;
  if (routed === 'steps' || routed === 'docs' || routed === 'start') return { ...exampleReply(policy, routed, '', 0), intent: 'chat' };
  return chatFallback();
}

export default function ApplyHelper({ policyId, title, mode, examplePolicy, onClose }: {
  policyId: number; title: string; mode: Mode; examplePolicy: HelperPolicy; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMode, setInputMode] = useState<'chat' | 'practice'>('chat');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // 자유 대화 기록(user/bot)과 연습 기록(user/staff)은 따로 (연습 상대 말이 도우미 대화에 섞이지 않게)
  const [chatLog, setChatLog] = useState<Turn[]>([]);
  const [practiceLog, setPracticeLog] = useState<Turn[]>([]);
  const [lastQuestion, setLastQuestion] = useState('');
  const nextId = useRef(1);

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, busy]);

  const push = (m: Omit<Message, 'id'>) => setMessages(prev => [...prev, { ...m, id: nextId.current++ }]);
  const chatTurns = chatLog.filter(t => t.role === 'user').length;
  const practiceTurns = practiceLog.filter(t => t.role === 'user').length;

  async function ask(intent: HelperIntent, said = '') {
    if (busy) return;
    const practicing = intent === 'practice';
    push({ from: 'me', text: said || INTENT_LABEL[intent] });
    if (intent === 'chat') setLastQuestion(said);
    if (practicing && !said) setPracticeLog([]); // 연습 버튼 = 처음부터
    setBusy(true);
    try {
      // 대본은 방금 대화에서 물어본 말(원문에 없던 것)을 넣어 만든다
      const sendText = intent === 'script' ? lastQuestion : said;
      const sendHistory = practicing ? (said ? practiceLog : []) : intent === 'chat' ? chatLog : undefined;
      const turns = practicing ? (said ? practiceTurns + 1 : 0) : chatTurns + 1;
      const reply: Reply = mode === 'api'
        ? await request<Reply>(`policies/${policyId}/helper`, 'POST', { intent, ...(sendText ? { text: sendText } : {}), ...(sendHistory ? { history: sendHistory } : {}) })
        : exampleReply(examplePolicy, intent, sendText, turns);
      push({ from: 'bot', text: reply.reply, reply });
      if (practicing) {
        const base = said ? practiceLog : [];
        setPracticeLog([...base, ...(said ? [{ role: 'user' as const, text: said }] : []), ...(reply.staffLine ? [{ role: 'staff' as const, text: reply.staffLine }] : [])]);
        setInputMode(reply.turnsLeft ? 'practice' : 'chat');
      } else {
        // 버튼으로 본 것도 대화 기록에 남겨 "응", "그거"를 AI가 이해하게
        setChatLog(prev => [...prev, { role: 'user', text: said || INTENT_LABEL[intent] }, { role: 'bot', text: (reply.reply || reply.sections.map(s => s.title).join(', ')).slice(0, 300) }]);
      }
    } catch (e) {
      const help = (e as { help?: Help }).help ?? null;
      push({ from: 'bot', text: e instanceof Error ? e.message : '지금은 도와드리기 어려워요.', reply: { intent, reply: '', sections: [], source: 'rule', followUps: [], help } });
    } finally { setBusy(false); }
  }

  function send() {
    const t = text.trim();
    if (!t) return;
    setText('');
    void ask(inputMode, t);
  }

  const chatFull = inputMode === 'chat' && chatTurns >= CHAT_MAX_TURNS;
  return <dialog ref={dialog} className="apply-helper" aria-labelledby="apply-helper-title" onClose={onClose}>
    <header>
      <div>
        <p className="small">신청 도우미</p>
        <h2 id="apply-helper-title">{title}</h2>
      </div>
      <button type="button" className="apply-helper-close" onClick={() => dialog.current?.close()} aria-label="닫기">✕</button>
    </header>
    <div className="apply-helper-log" aria-live="polite">
      <div className="bubble bot"><p>어디서 막혔는지 편하게 말해 주세요. 원문에 있는 내용만 알려 드려요. 이 대화는 저장하지 않아요.</p></div>
      {messages.map(m => <Bubble key={m.id} message={m} onPick={intent => void ask(intent)} disabled={busy} />)}
      {busy && <div className="bubble bot" role="status"><p>생각하고 있어요…</p></div>}
      <div ref={end} />
    </div>
    <div className="apply-helper-foot">
      {inputMode === 'chat' && <nav className="apply-helper-menu" aria-label="자주 묻는 것">
        {CHIPS.map(intent => <button key={intent} type="button" disabled={busy} onClick={() => void ask(intent)}>{INTENT_LABEL[intent]}</button>)}
      </nav>}
      <form className="apply-helper-input" onSubmit={e => { e.preventDefault(); send(); }}>
        <label htmlFor="apply-helper-text" className="small">
          {inputMode === 'practice' ? `담당자에게 할 말 (남은 연습 ${PRACTICE_MAX_TURNS - practiceTurns}번)` : chatFull ? '대화는 여기까지예요. 위 버튼은 계속 쓸 수 있어요.' : '궁금한 점이나 걱정되는 것'}
        </label>
        <div>
          <input id="apply-helper-text" type="text" maxLength={200} value={text} onChange={e => setText(e.target.value)} autoComplete="off" disabled={chatFull}
            placeholder={inputMode === 'practice' ? '예: 안녕하세요, 정책 문의드려요' : '예: 혼자 사는데 신청할 수 있어요?'} />
          <button type="submit" disabled={busy || !text.trim() || chatFull}>보내기</button>
        </div>
        {inputMode === 'practice' && <button type="button" className="apply-helper-link" onClick={() => { setInputMode('chat'); setPracticeLog([]); }}>연습 그만하기</button>}
      </form>
    </div>
  </dialog>;
}

function Bubble({ message, onPick, disabled }: { message: Message; onPick: (intent: HelperIntent) => void; disabled: boolean }) {
  const r = message.reply;
  if (message.from === 'me') return <div className="bubble me"><p>{message.text}</p></div>;
  return <div className="bubble bot">
    {r?.staffLine && <p className="staff"><span className="small">담당자</span>{r.staffLine}</p>}
    {r?.tip && <p className="tip">✦ {r.tip}</p>}
    {message.text && message.text.split('\n').map((line, i) => <p key={i} className={i > 0 ? 'small' : undefined}>{line}</p>)}
    {/* 자유 대화에 붙는 원문 목록은 접어 둔다 (답 문장이 먼저 보이게). 버튼으로 요청한 목록은 바로 펼침 */}
    {r?.sections.map(s => r.intent === 'chat' && r.source === 'ai'
      ? <details key={s.title} className="apply-helper-more"><summary>{s.title} 보기</summary><ol>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ol></details>
      : <div key={s.title}><h3>{s.title}</h3><ol>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ol></div>)}
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
    {r && r.source === 'ai' && (r.intent === 'script' || r.intent === 'chat') && <p className="small">AI가 원문을 바탕으로 만들었어요. 틀릴 수 있어요.</p>}
    {r && r.source === 'ai' && r.intent === 'practice' && <p className="small">연습용 AI 담당자예요. 실제 안내와 다를 수 있어요.</p>}
    {r?.help && <div className="help"><h3>{r.help.title}</h3>{r.help.lines.map(line => <p key={line}>{line}</p>)}</div>}
    {r && r.followUps.length > 0 && <div className="apply-helper-follow">
      {r.followUps.map(intent => <button key={intent} type="button" disabled={disabled} onClick={() => onPick(intent)}>{INTENT_LABEL[intent]}</button>)}
    </div>}
  </div>;
}
