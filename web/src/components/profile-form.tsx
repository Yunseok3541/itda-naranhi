"use client";
// 시작 질문 · 정책 신청 정보 입력 (기획: docs/기획/프로필.md). 모든 답은 선택, 기본값은 "답하지 않음"
import { useEffect, useState } from 'react';
import {
  BURDEN, EMPTY_POLICY_INFO, EMPTY_START, INCOME, JOB, LIVING, MARRIED, NEEDS, RANGE, SCHOOL, SPECIAL, SUPPORT, WITH,
  type PolicyInfo, type StartAnswers,
} from '@/lib/profile';
import { client, type Mode } from '@/lib/mobile-data';
import GlassSelect from './glass-select';

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

/** 시작 질문. extra=true면 ④~⑥까지 */
export function StartQuestions({ value, onChange, extra, disabled, step }: { value: StartAnswers; onChange: (v: StartAnswers) => void; extra?: boolean; disabled?: boolean; step?: number }) {
  const set = <F extends keyof StartAnswers>(f: F) => (v: StartAnswers[F]) => onChange({ ...value, [f]: v });
  const glass = step !== undefined; // 데모 시작의 질문별 화면은 밤하늘 반투명 드롭다운
  return <>
    {(step === undefined || step === 0) && <Pick label="요즘 할 수 있는 활동 범위는?" options={RANGE} value={value.range} onChange={set('range')} disabled={disabled} glass={glass} />}
    {(step === undefined || step === 1) && <Many legend="부담되는 상황은? (여러 개 선택 가능)" options={BURDEN} value={value.burden} onChange={set('burden')} disabled={disabled} />}
    {(step === undefined || step === 2) && <Pick label="혼자 하고 싶은가, 다른 사람과의 활동도 알아보고 싶은가?" options={WITH} value={value.with} onChange={set('with')} disabled={disabled} glass={glass} />}
    {extra && <>
      <Pick label="힘들 때 연락할 수 있는 사람이 있나요?" options={SUPPORT} value={value.support} onChange={set('support')} disabled={disabled} />
      <Pick label="지금 누구와 지내요?" options={LIVING} value={value.living} onChange={set('living')} disabled={disabled} />
      <Many legend="요즘 가장 도움이 필요한 건? (여러 개 선택 가능)" options={NEEDS} value={value.needs} onChange={set('needs')} disabled={disabled} />
    </>}
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
export function ProfileScreen({ mode }: { mode: Mode }) {
  const [start, setStart] = useState<StartAnswers>(EMPTY_START);
  const [info, setInfo] = useState<PolicyInfo>(EMPTY_POLICY_INFO);
  const [birth, setBirth] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'saving'>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    client(mode).profile()
      .then(p => { if (!active) return; setStart(p.startAnswers ?? EMPTY_START); setInfo(p.policyInfo); setBirth(p.birthYear ? String(p.birthYear) : ''); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : '정보를 불러오지 못했어요.'); })
      .finally(() => { if (active) setState('ready'); });
    return () => { active = false; };
  }, [mode]);

  async function save(update: Parameters<ReturnType<typeof client>['saveProfile']>[0], done: string) {
    setState('saving'); setMessage(''); setError('');
    try {
      const p = await client(mode).saveProfile(update);
      setStart(p.startAnswers ?? EMPTY_START); setInfo(p.policyInfo); setBirth(p.birthYear ? String(p.birthYear) : '');
      setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요. 고른 답은 그대로 있어요.');
    } finally { setState('ready'); }
  }

  const busy = state !== 'ready';
  const birthYear = birth ? Number(birth) : null;
  return <>
    <h1>내 정보</h1>
    <p className="small">모든 답은 선택이에요. 답에 따라 사람을 나누지 않고, 오늘의 별과 정책을 고를 때만 참고해요. 실제 개인정보 대신 가상 내용으로 체험해 주세요.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="card">
      <h2>시작 질문</h2>
      <StartQuestions value={start} onChange={setStart} extra disabled={busy} />
      <button disabled={busy} onClick={() => save({ startAnswers: start }, '시작 질문 답을 저장했어요.')}>{state === 'saving' ? '저장 중…' : '시작 질문 저장'}</button>
    </section>
    <section className="card">
      <h2>정책 신청 정보 (선택)</h2>
      <p className="small">알려 주시면 신청 조건이 맞지 않는 정책을 추천에서 미리 빼 드려요. 이 정보는 AI에 보내지 않고, 자격은 원문에서 꼭 다시 확인해 주세요.</p>
      <PolicyInfoQuestions value={info} birthYear={birth} onChange={setInfo} onBirthYear={setBirth} disabled={busy} />
      <button disabled={busy || (birth !== '' && birth.length !== 4)} onClick={() => save({ policyInfo: info, birthYear }, '정책 신청 정보를 저장했어요.')}>{state === 'saving' ? '저장 중…' : '정책 신청 정보 저장'}</button>
      <button className="secondary" disabled={busy} onClick={() => save({ policyInfo: null, birthYear: null }, '정책 신청 정보를 모두 지웠어요.')}>정책 신청 정보 모두 지우기</button>
    </section>
    {message && <p role="status">{message}</p>}
  </>;
}
