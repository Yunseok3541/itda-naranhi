"use client";
import HelpLines from './help-lines';

// 신청 도우미 (챗봇형, 고민기록 #39 → 자유 대화 #43). 정책 카드의 [신청 도와줘]로 연다
// - 입력창 하나로 바로 대화 (chat). 확실한 말("서류 뭐야")은 서버가 규칙으로 바로, 나머지는 AI가 원문 안에서 답함
// - 빠른 질문은 대화 위에, 자유 입력은 아래에 둔다
// - 말하기 연습은 따로 들어가는 모드 (AI가 담당자 역할 → 도우미 답과 섞이지 않게)
// - AI 답은 정확하지 않을 수 있다는 안내: 입력창 아래에 항상 (고민기록 #46)
// - 대화는 서버에 저장하지 않음. 이 브라우저 탭에만 정책별로 남아 창을 닫았다 열어도 이어짐, 탭을 닫거나 [대화 지우기]로 사라짐 (고민기록 #44)
// - 예시 모드는 서버 없이 같은 규칙 문장으로 답한다 (AI 없음)
import { useEffect, useRef, useState } from 'react';
import {
  CHAT_MAX_TURNS, docsReply, exampleChatReply, fallbackScript, fallbackStaffLine, INTENT_LABEL, PRACTICE_MAX_TURNS, PRACTICE_SUGGEST,
  practiceReply, routeChat, scriptReply, startReply, stepsReply, type HelperIntent, type HelperPolicy, type HelperReply,
} from '@/lib/apply-helper';
import { chatKey, clearChat, loadChat, saveChat } from '@/lib/apply-helper-store';
import { request, type Help, type Mode } from '@/lib/mobile-data';
import { useCloseDialogOnHide } from './use-close-dialog-on-hide';

type Reply = HelperReply & { help?: Help };
type Message = { id: number; from: 'me' | 'bot'; text: string; reply?: Reply };
type Turn = { role: 'user' | 'staff' | 'bot'; text: string };

const QUICK_QUESTIONS = [
  ['steps', '신청 순서'], ['docs', '필요한 서류'], ['script', '문의 문장'],
] as const;
const EXERCISES = ['practice', 'start'] as const;
/** 서버가 받는 대화 기록은 21줄까지 → 최근 20줄만 보냄 (칩을 눌러도 기록이 쌓여 넘칠 수 있었음) */
const SEND_LOG = 20;

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
  return exampleChatReply(policy, text);
}

export default function ApplyHelper({ policyId, title, mode, examplePolicy, onClose }: {
  policyId: number; title: string; mode: Mode; examplePolicy: HelperPolicy; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useCloseDialogOnHide(dialog);
  const log = useRef<HTMLDivElement>(null);
  // 이 탭에 남아 있던 대화 (창을 다시 열면 이어짐). 연습 중이던 것은 이어지지 않고 대화 모드로 시작
  const storeKey = chatKey(mode, policyId);
  const [restored] = useState(() => loadChat<Message, Turn>(storeKey));
  const [messages, setMessages] = useState<Message[]>(restored?.messages ?? []);
  const [inputMode, setInputMode] = useState<'chat' | 'practice'>('chat');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // 자유 대화 기록(user/bot)과 연습 기록(user/staff)은 따로 (연습 상대 말이 도우미 대화에 섞이지 않게)
  const [chatLog, setChatLog] = useState<Turn[]>(restored?.chatLog ?? []);
  const [practiceLog, setPracticeLog] = useState<Turn[]>([]);
  const [lastQuestion, setLastQuestion] = useState(restored?.lastQuestion ?? '');
  const nextId = useRef(Math.max(0, ...(restored?.messages ?? []).map(m => m.id)) + 1);
  const [showRestored, setShowRestored] = useState(!!restored);

  useEffect(() => { dialog.current?.showModal(); }, []);
  // 폰 키보드가 올라오면 실제로 보이는 높이(visualViewport)가 줄어듦 → 그만큼 창을 올리고 줄여 입력창이 가려지지 않게 (고민기록 #45)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const d = dialog.current;
    if (!vv || !d) return;
    const fit = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      d.style.setProperty('--kb', `${kb}px`);
      // 키보드가 올라와 있으면 보이는 화면을 거의 다 써서 대화 내용이 보이게
      if (kb > 0) d.style.setProperty('--dh', `${Math.round(vv.height - 8)}px`); else d.style.removeProperty('--dh');
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, []);
  function scrollToLatest() {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }
  useEffect(() => { if (messages.length || busy) scrollToLatest(); }, [messages, busy]);
  // 바뀔 때마다 이 탭에 저장 (저장 못 해도 대화는 계속됨)
  useEffect(() => { saveChat(storeKey, { messages, chatLog, lastQuestion }); }, [storeKey, messages, chatLog, lastQuestion]);

  function clearConversation() {
    clearChat(storeKey);
    setMessages([]); setChatLog([]); setPracticeLog([]); setLastQuestion(''); setInputMode('chat'); setShowRestored(false);
  }

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
      const sendHistory = practicing ? (said ? practiceLog : []) : intent === 'chat' ? chatLog.slice(-SEND_LOG) : undefined;
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
  return <dialog ref={dialog} className="apply-helper" aria-labelledby="apply-helper-title" onClose={event => {
    // 개발 모드에서 효과가 다시 실행되면 이전 close 이벤트가 재개방 후 도착할 수 있다.
    if (!event.currentTarget.open) onClose();
  }}>
    <header>
      <div>
        <p className="small">신청 도우미</p>
        <h2 id="apply-helper-title">{title}</h2>
      </div>
      <div className="apply-helper-head-actions">
        {messages.length > 0 && <button type="button" className="apply-helper-clear" onClick={clearConversation} disabled={busy}>대화 지우기</button>}
        <button type="button" className="apply-helper-close" onClick={() => dialog.current?.close()} aria-label="닫기">✕</button>
      </div>
    </header>
    {/* 한 번 알면 되는 안내라 접지 않고 짧은 한 줄로 늘 보이게 */}
    <p className="apply-helper-privacy"><span aria-hidden="true">🔒</span> 서버에 저장하지 않아요 · 탭을 닫거나 ‘대화 지우기’를 누르면 사라져요</p>
    {inputMode === 'chat' && <nav className="apply-helper-menu" aria-label="빠른 질문">
      <div className="apply-helper-quick">
        {QUICK_QUESTIONS.map(([intent, label]) => <button key={intent} type="button" disabled={busy}
          onClick={() => void ask(intent)}>{label}</button>)}
      </div>
      <div className="apply-helper-extra">
        {EXERCISES.map(intent => <button key={intent} type="button" disabled={busy}
          onClick={() => void ask(intent)}>{INTENT_LABEL[intent]}</button>)}
      </div>
    </nav>}
    <div ref={log} className="apply-helper-log" aria-live="polite">
      {messages.length === 0 && !busy && <p className="apply-helper-empty">빠른 질문을 고르거나 궁금한 점을 적어 주세요.</p>}
      {showRestored && messages.length > 0 && <p className="small apply-helper-restored" role="status">이전 대화를 이어서 보여 드려요.</p>}
      {messages.map(m => <Bubble key={m.id} message={m} onPick={intent => void ask(intent)} disabled={busy} />)}
      {busy && <div className="bubble bot" role="status"><p>생각하고 있어요…</p></div>}
    </div>
    <div className="apply-helper-foot">
      <form className="apply-helper-input" onSubmit={e => { e.preventDefault(); send(); }}>
        <label htmlFor="apply-helper-text" className="small">
          {inputMode === 'practice' ? `담당자에게 할 말 (남은 연습 ${PRACTICE_MAX_TURNS - practiceTurns}번)` : chatFull ? '대화는 여기까지예요. 위 버튼은 계속 쓸 수 있어요.' : '궁금한 점이나 걱정되는 것'}
        </label>
        <div>
          <input id="apply-helper-text" aria-describedby="apply-helper-disclaimer" type="text" maxLength={200} value={text} onChange={e => setText(e.target.value)} autoComplete="off" disabled={chatFull}
            onFocus={scrollToLatest}
            placeholder={inputMode === 'practice' ? '예: 안녕하세요, 정책 문의드려요' : '예: 혼자 사는데 신청할 수 있어요?'} />
          <button type="submit" disabled={busy || !text.trim() || chatFull}>보내기</button>
        </div>
        {inputMode === 'practice' && <button type="button" className="apply-helper-link" onClick={() => { setInputMode('chat'); setPracticeLog([]); }}>연습 그만하기</button>}
      </form>
      <p id="apply-helper-disclaimer" className="apply-helper-disclaimer">AI 답은 정확하지 않을 수 있어요. 신청 전에는 원문이나 담당자에게 확인해 주세요.</p>
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
      ? <details key={s.title} className="apply-helper-more"><summary><span>원문 {s.title} {s.items.length}개 보기</span><span className="apply-helper-more-go" aria-hidden="true">›</span></summary><ol>{s.items.map((item, i) => <li key={i}>{item}</li>)}</ol></details>
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
    {r && r.source === 'ai' && (r.intent === 'script' || (r.intent === 'chat' && r.basis === '원문')) && <p className="small">AI가 원문을 바탕으로 만들었어요. 틀릴 수 있어요.</p>}
    {r && r.source === 'ai' && r.intent === 'chat' && r.basis === '일반' && <p className="small apply-helper-general">원문에 없는 일반적인 설명이에요. 이 정책에 맞는지는 원문이나 담당자에게 확인해 주세요.</p>}
    {r && r.source === 'ai' && r.intent === 'practice' && <p className="small">연습용 AI 담당자예요. 실제 안내와 다를 수 있어요.</p>}
    {r?.help && <div className="help"><h3>{r.help.title}</h3><HelpLines lines={r.help.lines} /></div>}
    {r && r.followUps.length > 0 && <div className="apply-helper-follow">
      {r.followUps.map(intent => <button key={intent} type="button" disabled={disabled} onClick={() => onPick(intent)}>{INTENT_LABEL[intent]}</button>)}
    </div>}
  </div>;
}
