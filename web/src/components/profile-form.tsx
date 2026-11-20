"use client";
// 시작 질문 · 정책 신청 정보 입력 (기획: docs/기획/프로필.md). 모든 답은 선택, 기본값은 "답하지 않음"
import { useEffect, useState } from 'react';
import {
  BURDEN, EMPTY_POLICY_INFO, EMPTY_START, INCOME, JOB, LIVING, MARRIED, NEEDS, RANGE, SCHOOL, SPECIAL, SUPPORT, WITH,
  type PolicyInfo, type StartAnswers,
} from '@/lib/profile';
import { client, type Mode } from '@/lib/mobile-data';

const SKIP = '답하지 않을래요';

function Pick<K extends string>({ label, options, value, onChange, disabled }: {
  label: string; options: readonly (readonly [K, string])[]; value: K | null; onChange: (v: K | null) => void; disabled?: boolean;
}) {
  return <label>{label}<select disabled={disabled} value={value ?? ''} onChange={e => onChange((e.target.value || null) as K | null)}>
    <option value="">{SKIP}</option>
    {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
  </select></label>;
}

/** 여러 개 고르기. 아무것도 안 고르면 null(답하지 않음). none을 주면 "해당 없어요" 칸이 생기고 빈 배열로 저장 */
function Many<K extends string>({ legend, options, value, onChange, none, disabled }: {
  legend: string; options: readonly (readonly [K, string])[]; value: K[] | null; onChange: (v: K[] | null) => void; none?: string; disabled?: boolean;
}) {
  const toggle = (k: K) => {
    const cur = value ?? [];
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    onChange(next.length ? next : null);
  };
  return <fieldset disabled={disabled}><legend>{legend}</legend>
    {options.map(([k, l]) => <label className="check" key={k}><input type="checkbox" checked={!!value?.includes(k)} onChange={() => toggle(k)} />{l}</label>)}
    {none && <label className="check"><input type="checkbox" checked={value !== null && value.length === 0} onChange={e => onChange(e.target.checked ? [] : null)} />{none}</label>}
  </fieldset>;
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

export function StartQuestions({ value, onChange, disabled, step }: { value: StartAnswers; onChange: (v: StartAnswers) => void; disabled?: boolean; step?: number }) {
  const set = <F extends keyof StartAnswers>(f: F) => (v: StartAnswers[F]) => onChange({ ...value, [f]: v });
  const shows = (index: number) => step === undefined || step === index;
  return <>
    {shows(0) && <Pick label="요즘 할 수 있는 활동 범위는?" options={RANGE} value={value.range} onChange={set('range')} disabled={disabled} />}
    {shows(1) && <Many legend="부담되는 상황은? (여러 개 선택 가능)" options={BURDEN} value={value.burden} onChange={set('burden')} disabled={disabled} />}
    {shows(2) && <Pick label="혼자 하고 싶은가, 다른 사람과의 활동도 알아보고 싶은가?" options={WITH} value={value.with} onChange={set('with')} disabled={disabled} />}
    {shows(3) && <Pick label="힘들 때 연락할 수 있는 사람이 있나요?" options={SUPPORT} value={value.support} onChange={set('support')} disabled={disabled} />}
    {shows(4) && <Pick label="지금 누구와 지내요?" options={LIVING} value={value.living} onChange={set('living')} disabled={disabled} />}
    {shows(5) && <Many legend="요즘 가장 도움이 필요한 건? (여러 개 선택 가능)" options={NEEDS} value={value.needs} onChange={set('needs')} disabled={disabled} />}
  </>;
}

export function PolicyInfoQuestions({ value, birthYear, onChange, onBirthYear, disabled }: {
  value: PolicyInfo; birthYear: string; onChange: (v: PolicyInfo) => void; onBirthYear: (v: string) => void; disabled?: boolean;
}) {
  const set = <F extends keyof PolicyInfo>(f: F) => (v: PolicyInfo[F]) => onChange({ ...value, [f]: v });
  return <>
    <label>출생연도<input inputMode="numeric" maxLength={4} placeholder={SKIP} disabled={disabled} value={birthYear} onChange={e => onBirthYear(e.target.value.replace(/\D/g, ''))} /></label>
    <Pick label="일하고 있나요?" options={JOB} value={value.job} onChange={set('job')} disabled={disabled} />
    <Pick label="학력" options={SCHOOL} value={value.school} onChange={set('school')} disabled={disabled} />
    <Pick label="결혼" options={MARRIED} value={value.married} onChange={set('married')} disabled={disabled} />
    <Pick label="본인 연소득" options={INCOME} value={value.income} onChange={set('income')} disabled={disabled} />
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
    <h1>{onSaved ? '내 추천 기준' : '내 정보'}</h1>
    <p className="small">{onSaved ? '바꾸고 싶은 답만 고쳐 주세요. 저장하면 새 기준으로 맞춤 정책을 보여 드려요. 모든 답은 선택이에요.' : '모든 답은 선택이에요. 답에 따라 사람을 나누지 않고, 오늘의 별과 정책을 고를 때만 참고해요. 실제 개인정보 대신 가상 내용으로 체험해 주세요.'}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {onSaved ? <section className="card onboarding-step">
      <h2>시작 질문</h2>
      <StartQuestions value={start} onChange={setStart} disabled={busy} />
    </section> : step === answerFields.length ? <>
      <StartResult answers={start} />
      <button onClick={() => setStep(0)}>답 다시 보기</button>
    </> : <section className="card onboarding-step">
      <h2 aria-live="polite">시작 질문 <span>{step + 1}/{answerFields.length}</span></h2>
      <StartQuestions value={start} onChange={setStart} step={step} disabled={busy} />
      <div className="choices">
        <button className="secondary" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>이전</button>
        <button disabled={busy} onClick={() => step < answerFields.length - 1 ? setStep(step + 1) : save({ startAnswers: start }, '시작 질문 답을 저장했어요.')}>
          {state === 'saving' ? '저장 중…' : step < answerFields.length - 1 ? '다음' : '저장하고 결과 보기'}
        </button>
      </div>
    </section>}
    <details className="card">
      <summary>정책 신청 정보 (선택)</summary>
      <p className="small">알려 주시면 신청 조건이 맞지 않는 정책을 추천에서 미리 빼 드려요. 이 정보는 AI에 보내지 않고, 자격은 원문에서 꼭 다시 확인해 주세요.</p>
      <PolicyInfoQuestions value={info} birthYear={birth} onChange={setInfo} onBirthYear={setBirth} disabled={busy} />
      {!onSaved && <button disabled={busy || (birth !== '' && birth.length !== 4)} onClick={() => save({ policyInfo: info, birthYear }, '정책 신청 정보를 저장했어요.')}>{state === 'saving' ? '저장 중…' : '정책 신청 정보 저장'}</button>}
      <button className="secondary" disabled={busy} onClick={() => {
        if (onSaved) { setInfo(EMPTY_POLICY_INFO); setBirth(''); }
        else void save({ policyInfo: null, birthYear: null }, '정책 신청 정보를 모두 지웠어요.');
      }}>{onSaved ? '입력값 비우기' : '정책 신청 정보 모두 지우기'}</button>
    </details>
    {onSaved && <button disabled={busy || (birth !== '' && birth.length !== 4)} onClick={() => save({ startAnswers: start, policyInfo: info, birthYear }, '')}>
      {state === 'saving' ? '저장 중…' : '저장하고 추천 보기'}
    </button>}
    {message && <p role="status">{message}</p>}
  </>;
}
