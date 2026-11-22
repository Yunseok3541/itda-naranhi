"use client";
// 추천 기준 정하기 (/policies/setup): 정책 탭에서 맞춤 추천을 위해 정보를 처음 알려 줄 때 (기획: docs/기획/프로필.md)
// - 묻는 것: 요즘의 나 3개(시작 질문 ④ 연락할 사람 · ⑤ 생활 형태 · ⑥ 필요한 도움) + 신청 정보 6개(정책 신청 정보)
//   시작 질문 ①~③은 데모를 시작할 때 이미 물었으니 다시 묻지 않고, 저장할 때 그대로 둔다
// - 한 화면에 질문 하나씩 (시작 질문·마음 짚기와 같은 별 카드, 별 순서, 밀려 들어오는 전환). 드롭다운에 숨기지 않고 선택지를 모두 보여 줌
// - 요즘의 나를 마치면 한 번 쉬어 감: 신청 정보는 더 민감하니 이어서 알려 줄지 고르게 하고, 여기까지만 저장할 수도 있게
// - 모두 선택. 안 고르면 다음 버튼이 "건너뛰기". 이전·다음 버튼은 질문마다 카드 길이가 달라도 화면 아래 같은 자리
// - 저장하면 정책 화면이 새 기준으로 다시 불러오게 표시하고(markPoliciesStale) 정책 추천으로 돌아감
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  EMPTY_POLICY_INFO, EMPTY_START, INCOME, JOB, LIVING, MARRIED, NEEDS, SCHOOL, SPECIAL, SUPPORT, parseBirthYear,
  type PolicyInfo, type StartAnswers,
} from '@/lib/profile';
import { client, markPoliciesStale, type Mode, type ProfileUpdate } from '@/lib/mobile-data';
import { Choices } from './profile-form';
import { ScreenBar, StarProgress } from './screen-kit';
import './policy-setup.css';

type Key = 'support' | 'living' | 'needs' | 'birth' | 'job' | 'school' | 'married' | 'income' | 'special';
/** 질문 순서. 'break' = 요즘의 나를 마치고 신청 정보로 넘어가기 전 쉼표 */
const ORDER: (Key | 'break')[] = ['support', 'living', 'needs', 'break', 'birth', 'job', 'school', 'married', 'income', 'special'];
const QUESTIONS = ORDER.filter((k): k is Key => k !== 'break');
/** 앞의 몇 개가 "요즘의 나"인지 (나머지는 신청 정보) */
const ME_COUNT = 3;
/** 별 순서의 화면 읽기용 이름 */
const NAMES: Record<Key, string> = {
  support: '연락할 사람', living: '생활 형태', needs: '필요한 도움',
  birth: '태어난 해', job: '일', school: '학력', married: '결혼', income: '연소득', special: '해당 상황',
};

/** 서버와 같은 기준(한국 날짜)의 올해. 출생연도는 만 15~45세쯤만 받음 (lib/profile.ts parseBirthYear) */
const thisYear = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));

export default function PolicySetup({ mode, onExit, onSaved }: {
  mode: Mode;
  /** 첫 질문에서 [이전] → 정책 추천으로 (저장하지 않음) */
  onExit: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState<StartAnswers>(EMPTY_START);
  const [info, setInfo] = useState<PolicyInfo>(EMPTY_POLICY_INFO);
  const [birth, setBirth] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'load-error'>('loading');
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const step = useRef<HTMLDivElement>(null);
  const shownPos = useRef(pos);

  // 다른 화면으로 갔다 돌아오면 첫 질문부터 (cacheComponents로 숨겨진 화면도 상태가 남음, 마음 짚기와 같은 방식)
  // 다시 보일 때 아래 불러오기도 다시 돌아 저장된 답을 새로 읽음
  useLayoutEffect(() => () => { setPos(0); setDir('fwd'); setError(''); setState('loading'); }, []);
  useEffect(() => {
    let active = true;
    client(mode).profile()
      .then(p => {
        if (!active) return;
        setStart(p.startAnswers ?? EMPTY_START); setInfo(p.policyInfo); setBirth(p.birthYear ? String(p.birthYear) : '');
        setError(''); setState('ready');
      })
      .catch(e => {
        if (!active) return;
        setError(e instanceof Error ? e.message : '저장된 답을 불러오지 못했어요.');
        setState('load-error');
      });
    return () => { active = false; };
  }, [mode, reload]);
  // 질문이 바뀌면 맨 위로, 화면 읽기 프로그램도 새 질문부터 읽게
  useEffect(() => {
    if (shownPos.current === pos) return;
    shownPos.current = pos;
    window.scrollTo({ top: 0 });
    step.current?.focus({ preventScroll: true });
  }, [pos]);

  const year = thisYear();
  const birthValue = parseBirthYear(birth, year); // undefined = 아직 다 적지 않았거나 범위 밖
  const current = ORDER[pos];
  const last = pos === ORDER.length - 1;
  const busy = state !== 'ready';
  const answered = (key: Key) => key === 'birth' ? birth !== ''
    : (key === 'support' || key === 'living' || key === 'needs' ? start[key] : info[key]) !== null;
  const blocked = current === 'birth' && birthValue === undefined;

  function go(next: number) {
    setDir(next > pos ? 'fwd' : 'back');
    setPos(next);
    setError('');
  }
  async function save(update: ProfileUpdate) {
    if (busy) return;
    setState('saving'); setError('');
    try {
      await client(mode).saveProfile(update);
      markPoliciesStale();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요. 고른 답은 그대로 있어요.');
      setState('ready');
    }
  }
  function next() {
    if (blocked) return;
    if (last) void save({ startAnswers: start, policyInfo: info, birthYear: birthValue ?? null });
    else go(pos + 1);
  }

  const setS = <F extends 'support' | 'living' | 'needs'>(f: F) => (v: StartAnswers[F]) => setStart({ ...start, [f]: v });
  const setI = <F extends keyof PolicyInfo>(f: F) => (v: PolicyInfo[F]) => setInfo({ ...info, [f]: v });

  function question(key: Key) {
    switch (key) {
      case 'support': return <Choices legend="힘들 때 연락할 수 있는 사람이 있나요?" hint="없다면 상담·마음건강 지원을 조금 더 앞에 보여 드려요."
        options={SUPPORT} value={start.support} onChange={setS('support')} disabled={busy} />;
      case 'living': return <Choices legend="지금 누구와 지내요?" hint="혼자 지낸다면 주거·생활비 지원을 조금 더 앞에 보여 드려요."
        options={LIVING} value={start.living} onChange={setS('living')} disabled={busy} />;
      case 'needs': return <Choices legend="요즘 가장 도움이 필요한 건?" hint="고른 분야의 정책을 먼저 보여 드려요. 여러 개 골라도 돼요."
        options={NEEDS} multiple value={start.needs} onChange={setS('needs')} disabled={busy} />;
      case 'birth': return <div className="policy-setup-birth">
        <p id="policy-setup-year-label" className="policy-setup-legend">태어난 해를 알려 주세요</p>
        <p className="choice-hint">나이 조건이 맞지 않는 정책을 미리 빼 드려요. 위아래로 끌어서 맞춰 주세요.</p>
        <BirthWheel from={year - 45} to={year - 15} value={birthValue ?? null} disabled={busy}
          onChange={y => setBirth(y === null ? '' : String(y))} labelledBy="policy-setup-year-label" />
      </div>;
      case 'job': return <Choices legend="지금 일하고 있나요?" options={JOB} value={info.job} onChange={setI('job')} disabled={busy} />;
      case 'school': return <Choices legend="학력은 어떻게 되나요?" hint="가장 최근 기준으로 골라 주세요."
        options={SCHOOL} value={info.school} onChange={setI('school')} disabled={busy} />;
      case 'married': return <Choices legend="결혼했나요?" hint="미혼·신혼부부처럼 결혼 여부를 보는 정책이 있어서 물어요."
        options={MARRIED} value={info.married} onChange={setI('married')} disabled={busy} />;
      case 'income': return <Choices legend="본인 연소득은 어느 정도예요?" hint="가족 소득 말고 나의 1년 소득이에요."
        options={INCOME} value={info.income} onChange={setI('income')} disabled={busy} />;
      case 'special': return <Choices legend="해당되는 상황이 있나요?" hint="여러 개 골라도 돼요"
        options={SPECIAL} multiple value={info.special} onChange={setI('special')} none="해당 없어요" disabled={busy} />;
    }
  }

  const bar = <ScreenBar title="추천 기준 정하기" back="/policies" backLabel="정책 추천으로 돌아가기" />;
  if (state === 'loading' || state === 'load-error') return <div className="policy-setup">
    {bar}
    {state === 'loading' ? <p role="status">저장된 답을 확인하고 있어요…</p> : <>
      <p className="error" role="alert">{error}</p>
      <button type="button" className="secondary" onClick={() => { setState('loading'); setReload(n => n + 1); }}>다시 불러오기</button>
    </>}
  </div>;

  // 별 순서: 9개 질문 (쉼표에서는 요즘의 나 3개가 켜진 채 신청 정보 첫 별이 다음 차례로 빛남)
  const progress = current === 'break' ? ME_COUNT : QUESTIONS.indexOf(current);
  const topic = progress < ME_COUNT ? '요즘의 나' : '신청 정보';
  const label = state === 'saving' ? '저장 중…'
    : current === 'break' ? '이어서 알려 주기'
    : last ? '저장하고 추천 보기'
    : answered(current) ? '다음' : '건너뛰기';

  return <div className="policy-setup">
    {bar}
    <section className="card policy-setup-card" aria-label="추천 기준 질문">
      <div className="policy-setup-top">
        <StarProgress steps={QUESTIONS.map(k => NAMES[k])} current={progress} label="질문 순서 (요즘의 나 3개, 신청 정보 6개)" />
        {/* 시작 질문과 같은 머리글: 별 아래 묶음 이름 + 매 질문 같은 안내 한 줄 */}
        <h2 className="policy-setup-topic">{topic}</h2>
        <p className="small">모두 선택이에요. 고르지 않고 넘어가도 괜찮아요.</p>
      </div>
      <div key={pos} ref={step} tabIndex={-1} className="policy-setup-step step-slide" data-dir={dir}>
        {current === 'break' ? <div className="policy-setup-break">
          <h2 className="policy-setup-legend">신청 정보도 알려 줄래요?</h2>
          <p>나이·일·학력·결혼·소득·해당 상황, 6가지를 물어요. 알려 주면 신청 조건이 맞지 않는 정책을 추천에서 미리 빼 드려요.</p>
          <ul className="policy-setup-promises" aria-label="알아 두기">
            <li><span aria-hidden="true">✓</span>AI에 보내지 않아요</li>
            <li><span aria-hidden="true">✓</span>하나씩 건너뛸 수 있어요</li>
            <li><span aria-hidden="true">✓</span>언제든 지울 수 있어요</li>
          </ul>
          <p className="small">자격은 정책 원문에서 꼭 다시 확인해 주세요.</p>
          {/* 여기서 마치는 길은 숨기지 않되, 화면 아래 고정된 "이어서 알려 주기"와 겹치지 않게 카드 안 작은 글자로 */}
          <button type="button" className="text-button policy-setup-stop" disabled={busy}
            onClick={() => void save({ startAnswers: start })}>여기까지만 저장하고 추천 보기</button>
        </div> : question(current)}
      </div>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    {/* 이전 · 다음: 화면 아래 고정 → 질문마다 카드 길이가 달라도 버튼은 늘 같은 자리 (엄지 영역) */}
    <nav className="policy-setup-nav" aria-label="질문 이동">
      <button type="button" className="secondary" disabled={busy} onClick={() => pos === 0 ? onExit() : go(pos - 1)}>이전</button>
      <button type="button" disabled={busy || blocked} onClick={next}>{label}</button>
    </nav>
  </div>;
}

/** 태어난 해 휠: 위아래로 끌어서 가운데 칸에 맞추면 그 해 (숫자를 눌러도, ↑↓ 키로도).
 *  처음엔 안 고른 상태 — 가운데 연도가 흐리게 보이고, 사용자가 직접 움직이기 전에는 값으로 치지 않음 (그대로 "건너뛰기" 가능) */
const ROW = 44, VISIBLE = 5;
function BirthWheel({ from, to, value, onChange, disabled, labelledBy }: {
  from: number; to: number; value: number | null; onChange: (year: number | null) => void; disabled?: boolean; labelledBy: string;
}) {
  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const wheel = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const settle = useRef<number | undefined>(undefined);
  const [centered, setCentered] = useState(() => years.indexOf(value ?? to - 10));
  const index = (y: number) => Math.max(0, Math.min(years.length - 1, years.indexOf(y)));
  // 처음 그릴 때: 고른 해(없으면 기본 위치)를 가운데로, 사용자가 움직인 것으로 치지 않음
  useLayoutEffect(() => {
    const el = wheel.current;
    if (el) el.scrollTop = index(value ?? to - 10) * ROW;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function scrollTo(i: number, smooth = true) {
    wheel.current?.scrollTo({ top: i * ROW, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  }
  function onScroll() {
    const el = wheel.current;
    if (!el) return;
    const i = Math.max(0, Math.min(years.length - 1, Math.round(el.scrollTop / ROW)));
    setCentered(i);
    window.clearTimeout(settle.current);
    // 멈추면 가운데 해를 고름 (사용자가 직접 움직였을 때만)
    settle.current = window.setTimeout(() => { if (touched.current) onChange(years[i]); }, 120);
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'PageUp' ? -5 : event.key === 'PageDown' ? 5 : 0;
    if (!step) return;
    event.preventDefault();
    touched.current = true;
    const i = Math.max(0, Math.min(years.length - 1, centered + step));
    scrollTo(i); onChange(years[i]);
  }
  const shown = years[centered];
  return <div className="birth-wheel-wrap" data-empty={value === null || undefined}>
    <div className="birth-wheel-frame">
      <div ref={wheel} className="birth-wheel" role="listbox" tabIndex={disabled ? -1 : 0} aria-labelledby={labelledBy}
        aria-activedescendant={value !== null ? `birth-${value}` : undefined}
        onScroll={onScroll} onKeyDown={onKey}
        onPointerDown={() => { touched.current = true; }} onWheel={() => { touched.current = true; }} onTouchStart={() => { touched.current = true; }}
        style={{ height: ROW * VISIBLE, paddingBlock: ROW * (VISIBLE - 1) / 2 }}>
        {years.map((y, i) => <div key={y} id={`birth-${y}`} role="option" aria-selected={value === y}
          className={`birth-wheel-item${i === centered ? ' centered' : ''}`} style={{ height: ROW }}
          onClick={() => { if (disabled) return; touched.current = true; scrollTo(i); onChange(y); }}>{y}</div>)}
      </div>
      <span className="birth-wheel-band" aria-hidden="true"><span>년</span></span>
    </div>
    <p className="birth-wheel-state" aria-live="polite">
      {value !== null ? <><b>{value}년생</b>으로 골랐어요</> : <>아직 고르지 않았어요 · 끌어서 맞춰 주세요 <span className="sr-only">(가운데 {shown}년)</span></>}
    </p>
    {value !== null && <button type="button" className="text-button birth-wheel-clear" disabled={disabled}
      onClick={() => { touched.current = false; onChange(null); }}>선택 지우기</button>}
  </div>;
}
