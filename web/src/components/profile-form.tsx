"use client";
// 시작 질문 · 정책 신청 정보 입력 (기획: docs/기획/프로필.md). 모든 답은 선택, 기본값은 "답하지 않음"
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BURDEN, EMPTY_POLICY_INFO, EMPTY_START, INCOME, JOB, LIVING, MARRIED, NEEDS, RANGE, SCHOOL, SPECIAL, SUPPORT, WITH,
  type PolicyInfo, type StartAnswers,
} from '@/lib/profile';
import { client, markPoliciesStale, type Mode } from '@/lib/mobile-data';
import GlassSelect from './glass-select';
import './profile-form.css';

const SKIP = '답하지 않을래요';

/** 하나 고르기. glass=true면 밤하늘 반투명 드롭다운 (데모 시작 질문), 아니면 기본 select (내 정보 화면) */
function Pick<K extends string>({ label, options, value, onChange, disabled, glass }: {
  label: string; options: readonly (readonly [K, string])[]; value: K | null; onChange: (v: K | null) => void; disabled?: boolean; glass?: boolean;
}) {
  if (glass) {
    return <GlassSelect<K | null> label={label} value={value} onChange={onChange} disabled={disabled}
      options={[{ value: null, label: SKIP }, ...options.map(([k, l]) => ({ value: k, label: l }))]} />;
  }
  return <label>{label}<select disabled={disabled} value={value ?? ''} onChange={e => onChange((e.target.value || null) as K | null)}>
    <option value="">{SKIP}</option>
    {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select></label>;
}

/** 여러 개 고르기 (정책 신청 정보의 특별한 상황 등). 별 카드 모양은 Choices와 같음 */
function Many<K extends string>({ legend, options, value, onChange, none, disabled }: {
  legend: string; options: readonly (readonly [K, string])[]; value: K[] | null; onChange: (v: K[] | null) => void; none?: string; disabled?: boolean;
}) {
  return <Choices legend={legend} hint="여러 개 골라도 돼요" options={options} multiple value={value} onChange={onChange} none={none} disabled={disabled} />;
}

/** 고르기 공통 (docs/기능발견성-조사.md: 선택지를 숨기지 않고 모두 보이게, 같은 기능은 같은 모양).
 *  하나 고르기(라디오)와 여러 개 고르기(체크박스)를 같은 별 카드로. 실제 입력은 화면에서만 숨겨 키보드·화면 읽기 프로그램은 그대로.
 *  아무것도 안 고르면 null(답하지 않음). 하나 고르기는 고른 카드를 다시 누르면 선택이 풀림 */
type ChoiceProps<K extends string> = {
  legend: string; hint?: string; options: readonly (readonly [K, string])[]; subs?: Partial<Record<K, string>>; disabled?: boolean;
} & (
  { multiple: true; value: K[] | null; onChange: (v: K[] | null) => void; none?: string }
  | { multiple?: false; value: K | null; onChange: (v: K | null) => void; none?: undefined }
);
export function Choices<K extends string>(props: ChoiceProps<K>) {
  const { legend, hint, options, subs, disabled } = props;
  const name = useId();
  const picked = (k: K) => props.multiple ? !!props.value?.includes(k) : props.value === k;
  const pick = (k: K) => {
    if (!props.multiple) { props.onChange(props.value === k ? null : k); return; }
    const cur = props.value ?? [];
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    props.onChange(next.length ? next : null);
  };
  const card = (key: string, label: string, checked: boolean, onToggle: () => void, sub?: string) =>
    <label key={key} className={`choice-card${sub ? ' with-sub' : ''}`}>
      <input type={props.multiple ? 'checkbox' : 'radio'} name={name} checked={checked} disabled={disabled}
        onChange={onToggle}
        // 라디오는 고른 것을 다시 눌러도 change가 안 생김 → 클릭으로 풀기
        onClick={!props.multiple && checked ? onToggle : undefined} />
      <span className="choice-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <svg className="choice-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.6 6 6.4.6-4.9 4.2 1.5 6.3L12 16.6l-5.6 3.3 1.5-6.3L3 9.4l6.4-.6z" /></svg>
    </label>;
  return <fieldset className="choice-cards" disabled={disabled}>
    <legend>{legend}</legend>
    {hint && <p className="choice-hint">{hint}</p>}
    {options.map(([k, l]) => card(k, l, picked(k), () => pick(k), subs?.[k]))}
    {props.multiple && props.none && card('none', props.none, props.value !== null && props.value.length === 0,
      () => props.onChange(props.value !== null && props.value.length === 0 ? null : []))}
  </fieldset>;
}

/** 활동 범위는 시작 단계를 정하므로 차이가 분명하게 한 줄씩 (docs/기획/프로필.md ①) */
const RANGE_SUB = {
  home: '방이나 집 안에서', near: '현관 앞, 1층 편의점 정도', out: '혼자 동네 산책이나 가게', people: '센터·모임처럼 사람이 있는 곳',
} as const;

/** 시작 질문 순서 (StartQuestions의 step 번호와 같음) */
const STEP_KEYS = ['range', 'burden', 'with', 'support', 'living', 'needs'] as const;
/** 그 질문에 답을 골랐는지 (안 골랐으면 다음 버튼을 "건너뛰기"로) */
export function startStepAnswered(value: StartAnswers, step: number) {
  const answer = value[STEP_KEYS[step]];
  return Array.isArray(answer) ? answer.length > 0 : answer !== null;
}

/** 질문 진행: 별이 하나씩 켜짐 (처음 시작 안내의 진행 점과 같은 자리·색) */
export function StepStars({ current, total }: { current: number; total: number }) {
  return <span className="step-stars" role="img" aria-label={`${total}개 중 ${current + 1}번째 질문`}>
    {Array.from({ length: total }, (_, i) => <i key={i} data-on={i <= current || undefined} />)}
  </span>;
}

const answerFields = [
  ['range', '활동 범위', RANGE], ['burden', '부담되는 상황', BURDEN], ['with', '활동 방식', WITH],
  ['support', '연락할 사람', SUPPORT], ['living', '생활 형태', LIVING], ['needs', '필요한 도움', NEEDS],
] as const;

export function StartResult({ answers, demo = false }: { answers: StartAnswers; demo?: boolean }) {
  return <section className="card onboarding-result" aria-label="입력 결과">
    <h2>내가 고른 답</h2>
    <dl>{answerFields.slice(0, demo ? 3 : answerFields.length).map(([key, label, options]) => {
      const value = answers[key];
      const selected = options.filter(([code]) => Array.isArray(value) ? value.some(item => item === code) : value === code);
      return <div key={key}><dt>{label}</dt><dd>{selected.map(([, text]) => text).join(', ') || '답하지 않음'}</dd></div>;
    })}</dl>
  </section>;
}

export function StartQuestions({ value, onChange, disabled, step, policy = false }: {
  value: StartAnswers; onChange: (v: StartAnswers) => void; disabled?: boolean; step?: number; policy?: boolean;
}) {
  const set = <F extends keyof StartAnswers>(f: F) => (v: StartAnswers[F]) => onChange({ ...value, [f]: v });
  const rangeHint = policy ? '평소 활동 범위를 정책 추천에 참고해요.'
    : '평소 기준이에요. 오늘의 범위는 오늘의 별에서 따로 골라요.';
  const questions = [
    <Choices key="range" legend="어디까지 편하게 다닐 수 있어요?" hint={rangeHint} options={RANGE} subs={RANGE_SUB} value={value.range} onChange={set('range')} disabled={disabled} />,
    <Choices key="burden" legend="어떤 게 부담돼요?" hint="여러 개 골라도 돼요" options={BURDEN} multiple value={value.burden} onChange={set('burden')} disabled={disabled} />,
    <Choices key="with" legend="활동은 어떻게 해 보고 싶어요?" options={WITH} value={value.with} onChange={set('with')} disabled={disabled} />,
    <Choices key="support" legend="힘들 때 연락할 수 있는 사람이 있나요?" options={SUPPORT} value={value.support} onChange={set('support')} disabled={disabled} />,
    <Choices key="living" legend="지금 누구와 지내요?" options={LIVING} value={value.living} onChange={set('living')} disabled={disabled} />,
    <Choices key="needs" legend="요즘 가장 도움이 필요한 건?" hint="여러 개 골라도 돼요" options={NEEDS} multiple value={value.needs} onChange={set('needs')} disabled={disabled} />,
  ];
  if (step !== undefined) return questions[step] ?? null;
  // 추천 기준 화면: 접기 대신 설정 앱처럼 한 줄 목록 → 누르면 그 질문 창
  return policy ? <ul className="criteria-rows">
    {questions.map((question, index) => <CriteriaRow key={question.key} label={answerFields[index][1]}
      summary={answerSummary(value, index)} disabled={disabled}>{question}</CriteriaRow>)}
  </ul> : <>{questions}</>;
}

export function PolicyInfoQuestions({ value, birthYear, onChange, onBirthYear, disabled }: {
  value: PolicyInfo; birthYear: string; onChange: (v: PolicyInfo) => void; onBirthYear: (v: string) => void; disabled?: boolean;
}) {
  const set = <F extends keyof PolicyInfo>(f: F) => (v: PolicyInfo[F]) => onChange({ ...value, [f]: v });
  return <>
    <label>출생연도<input inputMode="numeric" maxLength={4} placeholder={SKIP} disabled={disabled} value={birthYear} onChange={e => onBirthYear(e.target.value.replace(/\D/g, ''))} /></label>
    <Pick label="일하고 있나요?" options={JOB} value={value.job} onChange={set('job')} disabled={disabled} glass />
    <Pick label="학력" options={SCHOOL} value={value.school} onChange={set('school')} disabled={disabled} glass />
    <Pick label="결혼" options={MARRIED} value={value.married} onChange={set('married')} disabled={disabled} glass />
    <Pick label="본인 연소득" options={INCOME} value={value.income} onChange={set('income')} disabled={disabled} glass />
    <Many legend="해당되는 상황이 있나요? (여러 개 선택 가능)" options={SPECIAL} value={value.special} onChange={set('special')} none="해당 없어요" disabled={disabled} />
  </>;
}

/** 내 정보 화면: 불러오기 → 고치기 → 저장. 정책 신청 정보는 한 번에 지울 수 있음 */
export function ProfileScreen({ mode, onSaved }: { mode: Mode; onSaved?: () => void }) {
  const [start, setStart] = useState<StartAnswers>(EMPTY_START);
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState<PolicyInfo>(EMPTY_POLICY_INFO);
  const [birth, setBirth] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'load-error'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    client(mode).profile()
      .then(p => {
        if (!active) return;
        setStart(p.startAnswers ?? EMPTY_START); setInfo(p.policyInfo); setBirth(p.birthYear ? String(p.birthYear) : '');
        setState('ready');
      })
      .catch(e => {
        if (!active) return;
        setError(e instanceof Error ? e.message : '정보를 불러오지 못했어요.');
        setState('load-error');
      });
    return () => { active = false; };
  }, [mode]);

  async function save(update: Parameters<ReturnType<typeof client>['saveProfile']>[0], done: string) {
    setState('saving'); setMessage(''); setError('');
    try {
      const p = await client(mode).saveProfile(update);
      markPoliciesStale();
      if (onSaved) {
        onSaved();
        return;
      }
      if (update.startAnswers) {
        setStart(p.startAnswers ?? EMPTY_START);
        setStep(answerFields.length);
      } else {
        setInfo(p.policyInfo);
        setBirth(p.birthYear ? String(p.birthYear) : '');
      }
      setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요. 고른 답은 그대로 있어요.');
    } finally { setState('ready'); }
  }

  const busy = state !== 'ready';
  const birthYear = birth ? Number(birth) : null;
  return <>
    <p className="small">{onSaved ? '바꾸고 싶은 답만 고쳐 주세요. 저장하면 새 기준으로 맞춤 정책을 보여 드려요. 모든 답은 선택이에요.' : '모든 답은 선택이에요. 답에 따라 사람을 나누지 않고, 오늘의 별과 정책을 고를 때만 참고해요. 실제 개인정보 대신 가상 내용으로 체험해 주세요.'}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {onSaved ? <section className="card onboarding-step" aria-label="추천 기준 질문">
      <StartQuestions value={start} onChange={setStart} disabled={busy} policy />
    </section> : step === answerFields.length ? <>
      <StartResult answers={start} />
      <button onClick={() => setStep(0)}>답 다시 보기</button>
    </> : <section className="card onboarding-step">
      <h2 className="step-head">시작 질문 <StepStars current={step} total={answerFields.length} /></h2>
      <StartQuestions value={start} onChange={setStart} step={step} disabled={busy} />
      <div className="choices">
        <button className="secondary" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>이전</button>
        <button disabled={busy} onClick={() => step < answerFields.length - 1 ? setStep(step + 1) : save({ startAnswers: start }, '시작 질문 답을 저장했어요.')}>
          {state === 'saving' ? '저장 중…' : step < answerFields.length - 1 ? (startStepAnswered(start, step) ? '다음' : '건너뛰기') : '저장하고 결과 보기'}
        </button>
      </div>
    </section>}
    {/* 접기 대신 위 질문들과 같은 한 줄 목록 → 누르면 입력 창 */}
    <section className="card criteria-policy-info">
      <ul className="criteria-rows">
        <CriteriaRow label="정책 신청 정보 (선택)" summary={policyInfoFilled(info, birth) ? '입력함' : '입력 안 함'} disabled={busy} done={onSaved ? '다 입력했어요' : '닫기'}>
          <p className="small">알려 주시면 신청 조건이 맞지 않는 정책을 추천에서 미리 빼 드려요. 이 정보는 AI에 보내지 않고, 자격은 원문에서 꼭 다시 확인해 주세요.</p>
          <PolicyInfoQuestions value={info} birthYear={birth} onChange={setInfo} onBirthYear={setBirth} disabled={busy} />
          {!onSaved && <button disabled={busy || (birth !== '' && birth.length !== 4)} onClick={() => save({ policyInfo: info, birthYear }, '정책 신청 정보를 저장했어요.')}>{state === 'saving' ? '저장 중…' : '정책 신청 정보 저장'}</button>}
          <button className="secondary" disabled={busy} onClick={() => {
            if (onSaved) { setInfo(EMPTY_POLICY_INFO); setBirth(''); }
            else void save({ policyInfo: null, birthYear: null }, '정책 신청 정보를 모두 지웠어요.');
          }}>{onSaved ? '입력값 비우기' : '정책 신청 정보 모두 지우기'}</button>
        </CriteriaRow>
      </ul>
    </section>
    {onSaved && <button disabled={busy || (birth !== '' && birth.length !== 4)} onClick={() => save({ startAnswers: start, policyInfo: info, birthYear }, '')}>
      {state === 'saving' ? '저장 중…' : '저장하고 추천 보기'}
    </button>}
    {message && <p role="status">{message}</p>}
  </>;
}

/** 고른 답을 한 줄로 (목록 오른쪽에 보이는 값) */
function answerSummary(value: StartAnswers, index: number) {
  const [key, , options] = answerFields[index];
  const answer = value[key];
  const labels = (options as readonly (readonly [string, string])[]).filter(([code]) => Array.isArray(answer) ? (answer as string[]).includes(code) : answer === code).map(([, l]) => l);
  if (Array.isArray(answer) && answer.length === 0) return '해당 없어요';
  return labels.length ? labels.join(', ') : '선택 안 함';
}

const noSubscribe = () => () => {};

/** 설정 목록 한 줄: [이름 · 지금 값 ›] → 누르면 아래에서 올라오는 창 */
export function CriteriaRow({ label, summary, disabled, children, done = '다 골랐어요' }: {
  label: string; summary: string; disabled?: boolean; children: ReactNode; done?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // 창은 페이지 맨 바깥(body)에 그림: 사파리는 흐림 효과(backdrop-filter)가 걸린 카드 안의 창을 카드 안쪽에 잘못 그릴 수 있음
  // 서버에서 그릴 때는 body가 없으니 브라우저에서만 (useSyncExternalStore: 서버 false / 브라우저 true)
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const host = inBrowser ? document.body : null;
  const close = () => dialog.current?.close();
  const sheet = <dialog ref={dialog} className="criteria-sheet night-ui" aria-labelledby={titleId}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <header><h2 id={titleId}>{label}</h2>
        <button type="button" className="text-button criteria-sheet-close" aria-label={`${label} 닫기`} onClick={close}>✕</button></header>
      <div className="criteria-sheet-body">{children}</div>
      <button type="button" className="criteria-sheet-done" onClick={close}>{done}</button>
    </dialog>;
  return <li>
    <button type="button" className="text-button criteria-row" aria-haspopup="dialog" disabled={disabled} onClick={() => dialog.current?.showModal()}>
      <span className="criteria-row-label">{label}</span>
      <span className={`criteria-row-value${summary === '선택 안 함' || summary === '입력 안 함' ? ' empty' : ''}`}>{summary}</span>
      <span className="criteria-row-go" aria-hidden="true">›</span>
    </button>
    {host && createPortal(sheet, host)}
  </li>;
}

/** 정책 신청 정보를 하나라도 입력했는지 (목록 오른쪽 "입력함 / 입력 안 함") */
function policyInfoFilled(info: PolicyInfo, birth: string) {
  return birth !== '' || Object.values(info).some(v => Array.isArray(v) ? v.length > 0 : v !== null);
}
