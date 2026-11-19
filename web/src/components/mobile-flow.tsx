"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {ApiError, client, weatherNames, type Mode, type Star, type Checkin, type Recommendation, type Help} from '@/lib/mobile-data';
const labels={untried:'아직 만나기 전',dim:'손을 뻗은 별',bright:'딴 별'};
const constellationPoints = [[10, 68], [30, 27], [50, 61], [70, 21], [90, 55]];
const navigation = [
  { href: '/sky', label: '내 밤하늘', screen: 'sky' },
  { href: '/checkin', label: '오늘의 별', screen: 'checkin' },
  { href: '/centers', label: '청년센터', screen: 'centers' },
];

const koreanDate = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric',
});

function memoryDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[1]}년 ${Number(dateOnly[2])}월 ${Number(dateOnly[3])}일`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : koreanDate.format(date);
}

export default function MobileFlow({screen='sky',starId}:{screen?:string;starId?:number}){
 const [mode,M]=useState<Mode>('api'),[ready,R]=useState(false),[loaded,L]=useState(false),[busy,B]=useState(false),[error,E]=useState('');const lock=useRef(false);
 const memoryPanel = useRef<HTMLElement>(null);
 const [stars,S]=useState<Star[]>([]),[selected,SS]=useState<Star|null>(null),[help,H]=useState<Help>(null),[text,T]=useState(''),[choice,C]=useState('home'),[check,K]=useState<Checkin|null>(null),[items,I]=useState<Recommendation[]|null>(null);
 const [needsSession,setNeedsSession]=useState(false),[fallback,setFallback]=useState(false);
 const [status,Q]=useState<'dim'|'bright'>('dim'),[reason,N]=useState(''),[reflection,F]=useState(''),[saved,V]=useState(''),[draft,D]=useState(''),[notice,U]=useState('');
 function reportError(error: unknown) {
   if (error instanceof ApiError) {
     if (error.help) H(error.help);
     if (error.needsSession) setNeedsSession(true);
   }
   E(error instanceof ApiError && error.status === 503
     ? `${error.message} 작성한 내용은 그대로 있어요. 잠시 후 다시 시도해 주세요.`
     : error instanceof Error ? error.message : '처리하지 못했어요. 다시 시도해 주세요.');
 }
 useEffect(() => {
   let active = true;
   async function load() {
     try {
       const mode = localStorage.getItem('naranhi-mode');
       if (mode === 'api' || mode === 'example') {
         M(mode);
         R(true);
         const sky = await client(mode).sky();
         if (active) S(sky.stars);
       }
     } catch (error) {
       if (active) reportError(error);
     } finally {
       if (active) L(true);
     }
   }
   void Promise.resolve().then(() => { if (active) return load(); });
   return () => { active = false; };
 }, []);
 async function run(fn: () => Promise<void>) {
   if (lock.current) return;
   lock.current = true;
   B(true);
   E('');
   try { await fn(); } catch (error) { reportError(error); }
   finally { lock.current = false; B(false); }
 }
 async function restartSession() {
   await client('api').start();
   K(null);
   I(null);
   SS(null);
   setNeedsSession(false);
   S((await client('api').sky()).stars);
   R(true);
   U('데모를 다시 시작했어요. 작성한 내용으로 다시 시도해 주세요.');
 }
 useEffect(() => {
   if (selected) memoryPanel.current?.focus();
 }, [selected]);
 const star=stars.find(s=>s.starId===starId);
 if(!loaded)return <main className="shell">밤하늘을 준비하고 있어요…</main>;
 return <main className="shell" lang="ko"><header><Link className="brand" href="/">✧ 나란히</Link>{ready&&mode==='example'&&<span className="small">예시 기록</span>}<button className="text-button" onClick={()=>H({title:'도움받을 곳',lines:['이 앱은 상담을 대신하지 않아요. 지역 청년센터·정신건강복지센터에서 도움받을 곳을 찾아보세요.']})}>도움받을 곳</button></header>
 {help&&<aside className="help" role="alert"><h2>{help.title}</h2>{help.lines.map(line=><p key={line}>{line}</p>)}</aside>}
 {error&&<p className="error" role="alert">{error}</p>}
 {needsSession&&<section className="card"><p>데모 세션을 다시 시작해 주세요. 작성한 글은 이 화면에 그대로 있어요.</p><button disabled={busy} onClick={()=>run(restartSession)}>데모 다시 시작</button></section>}
 {!ready?<><div className="intro"><span className="welcome-icon" aria-hidden="true">✦<sup>✧</sup></span><h1>오늘의 작은 시도가<br/>별이 되는 곳</h1><p>다 해내지 않아도 괜찮아요.<br/>손을 뻗은 순간도 하늘에 남아요.</p><button disabled={busy} onClick={()=>run(async()=>{await client(mode).start();S((await client(mode).sky()).stars);R(true);})}>{busy?'준비 중…':'데모 시작'}</button></div><details className="onboarding"><summary>시작 질문과 체험 방식</summary><section className="card"><h2>가상 내용으로 체험해 주세요</h2><p>실제 개인정보를 입력하지 마세요.</p><label>체험 방식<select value={mode} onChange={e=>M(e.target.value as Mode)}><option value="example">예시 모드 · 브라우저 저장</option><option value="api">실제 API · 서버 세션</option></select></label><label>요즘 할 수 있는 활동 범위는?<select><option>집 안</option><option>집 앞</option><option>혼자 외출</option><option>사람 있는 곳</option></select></label><fieldset><legend>부담되는 상황은? (여러 개 선택 가능)</legend>{['사람 만나기','낯선 곳','전화·대화','아침에 일어나기'].map(x=><label className="check" key={x}><input type="checkbox"/>{x}</label>)}</fieldset><label>혼자 하고 싶은가, 다른 사람과의 활동도 알아보고 싶은가?<select><option>혼자 하고 싶어요</option><option>함께하는 활동도 알아보고 싶어요</option></select></label><p className="small">질문 답변은 이 화면에서만 보여요. {mode==='api'?'체크인과 별 기록은 데모 세션에 저장돼요.':'예시 기록은 이 브라우저에 저장돼요.'}</p></section></details></>:<>
 <nav className="bottom-nav" aria-label="주 메뉴">
   {navigation.map(tab => <Link key={tab.href} href={tab.href}
     aria-current={screen === tab.screen || (screen === 'star' && tab.screen === 'checkin') ? 'page' : undefined}>
     {tab.label}
   </Link>)}
 </nav>
 {screen==='sky'&&<><div className="intro"><h1>내 밤하늘</h1><p>작은 시도들이 모여, 나만의 하늘로.</p></div><section className="constellation" aria-label="내 별자리"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={constellationPoints.slice(0, stars.length).map(point=>point.join(",")).join(" ")} fill="none" stroke="#A894BC" vectorEffect="non-scaling-stroke" /></svg>{stars.slice(0,5).map((s,i)=><button key={s.starId} className={'sky-star '+s.status} style={{left:`${constellationPoints[i][0]}%`,top:`${constellationPoints[i][1]}%`}} onClick={()=>SS(s)} aria-label={`${s.title}, ${labels[s.status]}`}>{s.status==='untried'?'☆':s.status==='dim'?'◐':'★'}</button>)}</section><p className="small">☆ 아직 만나기 전　◐ 손을 뻗은 별　★ 딴 별</p><Link className="primary" href="/checkin">오늘 할 수 있는 별 찾기 →</Link>{selected&&<section ref={memoryPanel} tabIndex={-1} className="card memory" aria-label="별의 기억"><h2>{selected.title}</h2><p>{labels[selected.status]}</p>{selected.memories.length?selected.memories.map(m=><article key={m.attemptId}><time dateTime={m.date}>{memoryDate(m.date)}</time><p>{m.reflection||'말없이 남긴 작은 시도'}</p></article>):<p>아직 기억이 없어요.</p>}<Link className="primary" href={`/stars/${selected.starId}`}>이 별 기록하기</Link><button className="secondary" onClick={()=>SS(null)}>기억 닫기</button></section>}<h2>별에 담긴 기억</h2>{stars.map(s=><button className="star-row" key={s.starId} onClick={()=>SS(s)}><span className={s.status}>{s.status==='untried'?'☆':s.status==='dim'?'◐':'★'}</span><span>{s.title}<small>{labels[s.status]}</small></span><span>›</span></button>)}{!stars.length&&<p>표시할 별이 없어요.</p>}<button className="secondary" disabled={busy} onClick={()=>run(async()=>S((await client(mode).sky()).stars))}>밤하늘 다시 불러오기</button></>}
 {screen==='checkin'&&<><h1>오늘은 어떤 하루인가요?</h1><section className="card"><label>마음에 떠오른 한 줄<textarea disabled={busy} maxLength={300} value={text} onChange={e=>{T(e.target.value);K(null);I(null);}} placeholder="가상 내용으로 적어 주세요"/></label><fieldset><legend>오늘은 어떤 활동이 괜찮을까요?</legend><div className="choices">{[['rest','쉬어 가기'],['home','집 안'],['near','집 근처'],['out','바깥']].map(([v,l])=><button key={v} disabled={busy} className="secondary" aria-pressed={choice===v} onClick={()=>{C(v);K(null);I(null);}}>{l}</button>)}</div></fieldset><button disabled={busy||!text.trim()} onClick={()=>run(async()=>{K(null);I(null);const r=await client(mode).checkin(text,choice);K(r);H(r.help);if(r.checkinId===null)E('저장하지 못했어요. 입력은 그대로 있어요. 다시 저장해 주세요.');})}>{busy?'처리 중…':check?.checkinId===null?'체크인 저장 재시도':'한 줄 기록하기'}</button></section>{check&&<section className="card"><h2>마음 날씨 · {weatherNames[check.weather]||check.weather}</h2><p>{mode==='example'?'예시 날씨예요.':check.usedFallback?'기본 날씨를 보여드려요.':'AI가 고른 날씨예요.'} 다르면 바꿔 주세요.</p><p className="small">진단이 아닌 참고 기록이에요.</p>{check.checkinId!==null&&<><label>내 마음에 가까운 날씨<select disabled={busy} value={check.weather} onChange={e=>{const weather=e.target.value;run(async()=>{await client(mode).weather(check.checkinId!,weather);K({...check,weather});});}}>{Object.entries(weatherNames).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button disabled={busy} onClick={()=>run(async()=>{const result=await client(mode).recommendations(check.checkinId!);I(result.items);setFallback(result.usedFallback);})}>오늘의 별 추천받기</button></>}</section>}{items&&<section><h2>오늘의 별</h2><p className="small">{mode==='example'?'예시 추천이에요.':fallback?'기본 추천이에요.':'AI가 만든 추천은 틀릴 수 있어요.'}</p>{items.length?items.map(i=><Link className="card recommendation" key={i.starId} href={`/stars/${i.starId}`}><span className="gold">✧</span><h3>{i.title}</h3><p>{i.reason}</p><strong>이 별 만나기 →</strong></Link>):<section className="card"><h3>오늘은 쉬어 가도 괜찮아요</h3><p>추천된 별이 없어요. 다른 활동 범위를 고르거나 밤하늘에서 쉬어 가세요.</p><Link href="/sky">내 밤하늘로</Link></section>}</section>}</>}
 {screen==='star'&&<><h1>{star?.title||'별을 찾고 있어요'}</h1>{!star?<section className="card"><p>별을 불러오지 못했거나 없는 주소예요.</p><Link href="/sky">밤하늘로 돌아가기</Link><button disabled={busy} onClick={()=>run(async()=>S((await client(mode).sky()).stars))}>다시 불러오기</button></section>:saved?<section className="card saved"><h2>오늘의 순간을 담았어요</h2><p>{saved}</p><p className="small">{mode==='example'?'가상 기록을 이 브라우저에 저장했어요.':'AI가 만든 응원은 틀릴 수 있어요.'}</p><Link className="primary" href="/sky">내 밤하늘에서 기억 보기 →</Link></section>:<section className="card"><p>해낸 만큼, 혹은 손을 뻗은 만큼.<br/>어느 쪽이든 소중한 오늘의 기록이에요.</p><div className="choices">{([['bright','하늘의 별 따기'],['dim','손 뻗어 보기']] as const).map(([v,l])=><button key={v} className="secondary" disabled={busy} aria-pressed={status===v} onClick={()=>Q(v)}>{l}</button>)}</div>{(starId===16||starId===17)&&<><p>기기 좌표는 저장하지 않아요. 목표 장소 연동 전이라 직접 도착 기록을 사용해 주세요.</p><button className="secondary" onClick={()=>{if(!navigator.geolocation){U('위치를 지원하지 않아요. 직접 도착 기록을 사용해 주세요.');return;}navigator.geolocation.getCurrentPosition(()=>U('위치를 사용할 수 있어요. 현재는 직접 기록으로 남겨요.'),()=>U('위치를 사용할 수 없어요. 직접 기록으로 남겨요.'));}}>위치 사용 확인</button><p>직접 도착 기록으로 저장해요.</p></>}{status==='dim'&&<label>어떤 점이 어려웠나요? (선택)<select value={reason} onChange={e=>N(e.target.value)}><option value="">말하지 않아도 괜찮아요</option>{[['crowded','사람이 많았어요'],['weather','날씨·상황이 안 맞았어요'],['tired','몸·마음이 힘들었어요'],['no_time','시간이 없었어요'],['not_for_me','나랑 안 맞았어요'],['cost','돈이 들어서요'],['other','기타']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}<label>오늘을 기억할 한 줄<textarea disabled={busy} maxLength={300} value={reflection} onChange={e=>F(e.target.value)} placeholder="짧게 적어도, 비워 두어도 괜찮아요"/></label><button disabled={busy} onClick={()=>run(async()=>{const r=await client(mode).attempt({starId:star.starId,status,reflection,verifyMethod:'self',...(status==='dim'&&reason?{stopReason:reason}:{})});H(r.help);V(r.cheer||'당신의 하늘에 기록을 남겼어요.');try{S((await client(mode).sky()).stars);}catch(error){reportError(error);E('기록은 저장됐지만 밤하늘을 다시 읽지 못했어요. 밤하늘에서 다시 불러와 주세요.');}})}>{busy?'기록을 담는 중…':'이 순간 저장하기'}</button></section>}</>}
 {screen==='centers'&&<><h1>사람 곁으로, 천천히</h1><section className="card"><h2>우리 동네 청년센터</h2><p>가상 센터 · 실제 운영 정보가 아니에요.</p><Link className="secondary" href="/centers/demo">센터 상세 보기</Link></section>{mode==='api'?<p>센터 API 계약이 아직 없어 실제 목록·문의 저장은 연결하지 않았어요.</p>:<section className="card"><h2>문의 문장 준비하기</h2><p>초안이에요. 보내기 전에 확인해 주세요.</p><label>문의 문장<textarea value={draft} onChange={e=>{D(e.target.value);U('');}}/></label><button className="secondary" onClick={()=>D('안녕하세요. 센터를 처음 이용하려고 합니다. 예약 없이 잠깐 둘러봐도 괜찮을까요?')}>예시 초안 채우기</button><button disabled={!draft.trim()} onClick={()=>{try{localStorage.setItem('naranhi-example-inquiry',draft);U('초안만 이 브라우저에 저장했어요. 실제로 전송하지 않았어요.');}catch{E('초안을 저장하지 못했어요.');}}}>초안만 저장하기</button><button className="secondary" onClick={()=>D(localStorage.getItem('naranhi-example-inquiry')||'')}>저장한 초안 불러오기</button><Link className="secondary" href="/stars/17">앞까지 가 보기 · 가상 장소 직접 도착 기록</Link><p>가상 장소의 시연이에요. 실제 GPS 도착 판정은 제공하지 않아요.</p><Link href="/sky">오늘은 여기서 마치기</Link></section>}</>}
 </>}{notice&&<p role="status">{notice}</p>}<footer>시연용 서비스 · 실제 개인정보를 입력하지 마세요.{ready&&<button className="text-button" disabled={busy} onClick={()=>{localStorage.removeItem('naranhi-mode');R(false);K(null);I(null);H(null);V('');SS(null);E('');setNeedsSession(false);}}>체험 방식 다시 선택</button>}</footer></main>;
}
