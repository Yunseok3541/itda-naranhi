"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {ApiError, client, weatherNames, type Mode, type Star, type Checkin, type Recommendation, type Help} from '@/lib/mobile-data';
import NightSky from './night-sky';
import PoliciesScreen from './policies-screen';
import CentersScreen from './centers-screen';
import SkyPanorama from '@/app/sky-preview/sky-panorama';
import { ProfileScreen, StartQuestions } from './profile-form';
import { EMPTY_START, type StartAnswers } from '@/lib/profile';
import './night-sky.css';
// 하단 버튼 3개: 왼쪽 프로필 · 가운데 도감(큰 버튼) · 오른쪽 퀘스트(오늘의 별)
// 정책추천·청년센터는 메인 오른쪽 위, 도움받을 곳은 메인 왼쪽 위, 홈(내 밤하늘)은 다른 화면 머리글의 "나란히"
const icon = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ProfileIcon = () => <svg {...icon}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>;
const BookIcon = () => <svg {...icon}><path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z" /><path d="M12 6.5V20" /></svg>;
const QuestIcon = () => <svg {...icon}><path d="M5 17l4-6 5 3 5-8" /><circle cx="5" cy="17" r="1.6" fill="currentColor" /><circle cx="9" cy="11" r="1.6" fill="currentColor" /><circle cx="14" cy="14" r="1.6" fill="currentColor" /><circle cx="19" cy="6" r="1.6" fill="currentColor" /></svg>;
const navigation = [
  { href: '/profile', label: '프로필', screens: ['profile'], Icon: ProfileIcon, kind: 'side' },
  { href: '/catalog', label: '도감', screens: ['catalog'], Icon: BookIcon, kind: 'main' },
  { href: '/checkin', label: '퀘스트', screens: ['checkin', 'star'], Icon: QuestIcon, kind: 'side' },
] as const;
const HELP = {
  title: '도움받을 곳',
  lines: [
    '이 앱은 상담을 대신하지 않아요. 힘들 때는 혼자 감당하지 않아도 돼요.',
    '자살예방상담전화 109 (24시간)',
    '정신건강위기상담전화 1577-0199',
    '가까운 청년센터·정신건강복지센터에서도 도움을 받을 수 있어요.',
  ],
};

export default function MobileFlow({screen='sky',starId,centerId}:{screen?:string;starId?:number;centerId?:number}){
 const [mode,M]=useState<Mode>('example'),[ready,R]=useState(false),[loaded,L]=useState(false),[busy,B]=useState(false),[error,E]=useState('');const lock=useRef(false);
 const [stars,S]=useState<Star[]>([]),[selected,SS]=useState<Star|null>(null),[help,H]=useState<Help>(null),[text,T]=useState(''),[choice,C]=useState('home'),[check,K]=useState<Checkin|null>(null),[items,I]=useState<Recommendation[]|null>(null);
 const [needsSession,setNeedsSession]=useState(false),[fallback,setFallback]=useState(false);
 const [startAnswers,setStartAnswers]=useState<StartAnswers>(EMPTY_START);
 const [status,Q]=useState<'dim'|'bright'>('dim'),[reason,N]=useState(''),[reflection,F]=useState(''),[saved,V]=useState(''),[notice,U]=useState('');
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
 const star=stars.find(s=>s.starId===starId);
 // 메인(밤하늘)과 첫 화면은 어두운 밤하늘 테마, 나머지 화면은 아직 기존 테마
 const night = screen==='sky'||!ready;
 // 메인 "내 밤하늘"은 스크롤 없이 한 화면에 고정 (night-sky.css의 .sky-locked). 아래 안내는 "모든 별 목록" 창 안으로
 const locked = ready&&screen==='sky';
 // 페이지 스크롤 잠금은 <html>에 표시. 다른 화면으로 가면 Next가 이전 화면을 숨겨 둔 채 DOM에 남기므로
 // CSS :has(.sky-locked)로는 잠금이 풀리지 않음 → 화면이 보일 때만 붙이고 벗어나면 뗀다
 // 밤하늘 색(어두운 배경·밝은 글자)은 <html> 표시로. 이제 모든 화면이 밤하늘 분위기라 이 컴포넌트가 보이는 동안 항상 붙임
 // (예전 body:has(.sky-mode)는 Next가 숨겨 둔 이전 화면 때문에 잘못 걸렸음)
 useEffect(() => {
   const root = document.documentElement;
   root.classList.add('sky-night-page');
   return () => root.classList.remove('sky-night-page');
 }, []);
 useEffect(() => {
   if (!locked) return;
   const root = document.documentElement;
   root.classList.add('sky-locked-page');
   return () => root.classList.remove('sky-locked-page');
 }, [locked]);
 const footer = <footer>시연용 서비스 · 실제 개인정보를 입력하지 마세요.{ready&&<button className="text-button" disabled={busy} onClick={()=>{localStorage.removeItem('naranhi-mode');R(false);K(null);I(null);H(null);V('');SS(null);E('');setNeedsSession(false);}}>체험 방식 다시 선택</button>}</footer>;
 if(!loaded)return <main className="shell sky-mode"><p className="night-loading">밤하늘을 준비하고 있어요…</p></main>;
 return <>{night&&<SkyPanorama background/>}<main className={night?`shell sky-mode panorama-content${locked?' sky-locked':''}`:'shell night-ui'} lang="ko">{locked
   // 메인: 왼쪽 위 도움받을 곳, 오른쪽 위 정책추천·청년센터 (머리글 대신 모서리 버튼)
   ? <header className="sky-top">
       <button type="button" className="sky-pill" aria-expanded={help?.title===HELP.title} onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}><span aria-hidden="true">♡</span> 도움받을 곳</button>
       <div className="sky-top-right">
         <Link className="sky-pill gold" href="/policies"><span aria-hidden="true">✦</span> 정책추천</Link>
         <Link className="sky-pill small-pill" href="/centers"><span aria-hidden="true">⌖</span> 청년센터</Link>
       </div>
     </header>
   : ready
   // 다른 화면: 도감처럼 왼쪽 "← 내 밤하늘", 오른쪽 도움받을 곳
   ? <header className="sub-top"><Link className="sub-back" href="/sky"><span aria-hidden="true">←</span> 내 밤하늘</Link><span className="sub-top-right">{mode==='example'&&<span className="small">예시 기록</span>}<button type="button" className="sky-pill" aria-expanded={help?.title===HELP.title} onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}><span aria-hidden="true">♡</span> 도움받을 곳</button></span></header>
   : <header><Link className="brand" href="/">✧ 나란히</Link>{ready&&mode==='example'&&<span className="small">예시 기록</span>}{!ready&&<Link className="text-button" href="/catalog">별자리 도감</Link>}{ready&&<Link className="text-button" href="/sky">내 밤하늘</Link>}<button className="text-button" onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}>도움받을 곳</button></header>}
 {help&&<aside className="help" role="alert"><h2>{help.title}</h2>{help.lines.map(line=><p key={line}>{line}</p>)}<button type="button" className="text-button" onClick={()=>H(null)}>닫기</button></aside>}
 {error&&<p className="error" role="alert">{error}</p>}
 {needsSession&&<section className="card"><p>데모 세션을 다시 시작해 주세요. 작성한 글은 이 화면에 그대로 있어요.</p><button disabled={busy} onClick={()=>run(restartSession)}>데모 다시 시작</button></section>}
 {!ready?<><div className="intro"><span className="welcome-icon" aria-hidden="true">✦<sup>✧</sup></span><h1>오늘의 작은 시도가<br/>별이 되는 곳</h1><p>다 해내지 않아도 괜찮아요.<br/>손을 뻗은 순간도 하늘에 남아요.</p><button disabled={busy} onClick={()=>run(async()=>{await client(mode).start();if(Object.values(startAnswers).some(v=>v!==null)){try{await client(mode).saveProfile({startAnswers});}catch{U('시작 질문 답은 저장하지 못했어요. 내 정보에서 다시 저장할 수 있어요.');}}S((await client(mode).sky()).stars);R(true);})}>{busy?'준비 중…':'데모 시작'}</button><p className="small">{mode==='example'?'예시 모드 · 이 브라우저에 기록해요':'실제 API 모드 · 서버 세션에 기록해요'}</p></div><details className="onboarding"><summary>시작 질문과 체험 방식</summary><section className="card"><h2>가상 내용으로 체험해 주세요</h2><p>실제 개인정보를 입력하지 마세요.</p><label>체험 방식<select value={mode} onChange={e=>M(e.target.value as Mode)}><option value="example">예시 모드 · 브라우저 저장</option><option value="api">실제 API · 서버 세션</option></select></label><StartQuestions value={startAnswers} onChange={setStartAnswers} disabled={busy}/><p className="small">모든 질문은 선택이에요. 답하지 않아도 시작할 수 있고, 시작한 뒤 내 정보에서 더 알려 주거나 고칠 수 있어요. {mode==='api'?'답과 기록은 데모 세션에 저장돼요.':'답과 예시 기록은 이 브라우저에 저장돼요.'}</p></section></details></>:<>
 <nav className="bottom-nav dock" aria-label="주 메뉴">
   {navigation.map(tab => <Link key={tab.href} href={tab.href} className={tab.kind === 'main' ? 'dock-main' : 'dock-side'}
     aria-current={(tab.screens as readonly string[]).includes(screen) ? 'page' : undefined}>
     <tab.Icon /><span>{tab.label}</span>
   </Link>)}
 </nav>
 {screen==='sky'&&<NightSky stars={stars} selected={selected} onSelect={SS} busy={busy} onReload={()=>run(async()=>S((await client(mode).sky()).stars))} footer={footer}/>}
 {screen==='checkin'&&<><h1>오늘은 어떤 하루인가요?</h1><section className="card"><label>마음에 떠오른 한 줄<textarea disabled={busy} maxLength={300} value={text} onChange={e=>{T(e.target.value);K(null);I(null);}} placeholder="가상 내용으로 적어 주세요"/></label><fieldset><legend>오늘은 어떤 활동이 괜찮을까요?</legend><div className="choices">{[['rest','쉬어 가기'],['home','집 안'],['near','집 근처'],['out','바깥']].map(([v,l])=><button key={v} disabled={busy} className="secondary" aria-pressed={choice===v} onClick={()=>{C(v);K(null);I(null);}}>{l}</button>)}</div></fieldset><button disabled={busy||!text.trim()} onClick={()=>run(async()=>{K(null);I(null);const r=await client(mode).checkin(text,choice);K(r);H(r.help);if(r.checkinId===null)E('저장하지 못했어요. 입력은 그대로 있어요. 다시 저장해 주세요.');})}>{busy?'처리 중…':check?.checkinId===null?'체크인 저장 재시도':'한 줄 기록하기'}</button></section>{check&&<section className="card"><h2>마음 날씨 · {weatherNames[check.weather]||check.weather}</h2><p>{mode==='example'?'예시 날씨예요.':check.usedFallback?'기본 날씨를 보여드려요.':'AI가 고른 날씨예요.'} 다르면 바꿔 주세요.</p><p className="small">진단이 아닌 참고 기록이에요.</p>{check.checkinId!==null&&<><label>내 마음에 가까운 날씨<select disabled={busy} value={check.weather} onChange={e=>{const weather=e.target.value;run(async()=>{await client(mode).weather(check.checkinId!,weather);K({...check,weather});});}}>{Object.entries(weatherNames).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button disabled={busy} onClick={()=>run(async()=>{const result=await client(mode).recommendations(check.checkinId!);I(result.items);setFallback(result.usedFallback);})}>오늘의 별 추천받기</button></>}</section>}{items&&<section><h2>오늘의 별</h2><p className="small">{mode==='example'?'예시 추천이에요.':fallback?'기본 추천이에요.':'AI가 만든 추천은 틀릴 수 있어요.'}</p>{items.length?items.map(i=><Link className="card recommendation" key={i.starId} href={`/stars/${i.starId}`}><span className="gold">✧</span><h3>{i.title}</h3><p>{i.reason}</p><strong>이 별 만나기 →</strong></Link>):<section className="card"><h3>오늘은 쉬어 가도 괜찮아요</h3><p>추천된 별이 없어요. 다른 활동 범위를 고르거나 밤하늘에서 쉬어 가세요.</p><Link href="/sky">내 밤하늘로</Link></section>}</section>}</>}
 {screen==='star'&&<><h1>{star?.title||'별을 찾고 있어요'}</h1>{!star?<section className="card"><p>별을 불러오지 못했거나 없는 주소예요.</p><Link href="/sky">밤하늘로 돌아가기</Link><button disabled={busy} onClick={()=>run(async()=>S((await client(mode).sky()).stars))}>다시 불러오기</button></section>:saved?<section className="card saved"><h2>오늘의 순간을 담았어요</h2><p>{saved}</p><p className="small">{mode==='example'?'가상 기록을 이 브라우저에 저장했어요.':'AI가 만든 응원은 틀릴 수 있어요.'}</p><Link className="primary" href="/sky">내 밤하늘에서 기억 보기 →</Link></section>:<section className="card"><p>해낸 만큼, 혹은 손을 뻗은 만큼.<br/>어느 쪽이든 소중한 오늘의 기록이에요.</p><div className="choices">{([['bright','하늘의 별 따기'],['dim','손 뻗어 보기']] as const).map(([v,l])=><button key={v} className="secondary" disabled={busy} aria-pressed={status===v} onClick={()=>Q(v)}>{l}</button>)}</div>{(starId===16||starId===17)&&<><p>기기 좌표는 저장하지 않아요. 목표 장소 연동 전이라 직접 도착 기록을 사용해 주세요.</p><button className="secondary" onClick={()=>{if(!navigator.geolocation){U('위치를 지원하지 않아요. 직접 도착 기록을 사용해 주세요.');return;}navigator.geolocation.getCurrentPosition(()=>U('위치를 사용할 수 있어요. 현재는 직접 기록으로 남겨요.'),()=>U('위치를 사용할 수 없어요. 직접 기록으로 남겨요.'));}}>위치 사용 확인</button><p>직접 도착 기록으로 저장해요.</p></>}{status==='dim'&&<label>어떤 점이 어려웠나요? (선택)<select value={reason} onChange={e=>N(e.target.value)}><option value="">말하지 않아도 괜찮아요</option>{[['crowded','사람이 많았어요'],['weather','날씨·상황이 안 맞았어요'],['tired','몸·마음이 힘들었어요'],['no_time','시간이 없었어요'],['not_for_me','나랑 안 맞았어요'],['cost','돈이 들어서요'],['other','기타']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}<label>오늘을 기억할 한 줄<textarea disabled={busy} maxLength={300} value={reflection} onChange={e=>F(e.target.value)} placeholder="짧게 적어도, 비워 두어도 괜찮아요"/></label><button disabled={busy} onClick={()=>run(async()=>{const r=await client(mode).attempt({starId:star.starId,status,reflection,verifyMethod:'self',...(status==='dim'&&reason?{stopReason:reason}:{})});H(r.help);V(r.cheer||'당신의 하늘에 기록을 남겼어요.');try{S((await client(mode).sky()).stars);}catch(error){reportError(error);E('기록은 저장됐지만 밤하늘을 다시 읽지 못했어요. 밤하늘에서 다시 불러와 주세요.');}})}>{busy?'기록을 담는 중…':'이 순간 저장하기'}</button></section>}</>}
 {screen==='profile'&&<ProfileScreen mode={mode}/>}
 {screen==='policies'&&<PoliciesScreen mode={mode} onError={reportError} onClearError={()=>E('')}/>}
 {screen==='centers'&&<CentersScreen mode={mode} centerId={centerId} onError={reportError} onHelp={H} onClearError={()=>E('')}/>}
 </>}{notice&&<p role="status">{notice}</p>}{!locked&&footer}</main></>;
}
