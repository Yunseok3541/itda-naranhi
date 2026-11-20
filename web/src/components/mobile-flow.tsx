"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {ApiError, client, type Mode, type Star, type Help} from '@/lib/mobile-data';
import NightSky from './night-sky';
import PoliciesScreen from './policies-screen';
import CentersScreen from './centers-screen';
import SkyPanorama from '@/app/sky-preview/sky-panorama';
import { StartQuestions } from './profile-form';
import ProfileHome from './profile-home';
import { PendingNextLink } from './next-step-card';
import QuestScreen from './quest-screen';
import StarScreen from './star-screen';
import { HelpContext } from './screen-kit';
import { EMPTY_START, type StartAnswers } from '@/lib/profile';
import './night-sky.css';
// 하단 버튼 3개(메인에서만): 왼쪽 프로필 · 가운데 도감(큰 버튼) · 오른쪽 퀘스트(오늘의 별)
// 정책추천·청년센터는 메인 오른쪽 위, 도움받을 곳은 메인 왼쪽 위, 홈(내 밤하늘)은 다른 화면 머리글의 "나란히"
const icon = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ProfileIcon = () => <svg {...icon}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>;
const BookIcon = () => <svg {...icon}><path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z" /><path d="M12 6.5V20" /></svg>;
const QuestIcon = () => <svg {...icon}><path d="M5 17l4-6 5 3 5-8" /><circle cx="5" cy="17" r="1.6" fill="currentColor" /><circle cx="9" cy="11" r="1.6" fill="currentColor" /><circle cx="14" cy="14" r="1.6" fill="currentColor" /><circle cx="19" cy="6" r="1.6" fill="currentColor" /></svg>;
const navigation = [
  { href: '/profile', label: '프로필', Icon: ProfileIcon, kind: 'side' },
  { href: '/catalog', label: '도감', Icon: BookIcon, kind: 'main' },
  { href: '/checkin', label: '퀘스트', Icon: QuestIcon, kind: 'side' },
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
 const [stars,S]=useState<Star[]>([]),[selected,SS]=useState<Star|null>(null),[help,H]=useState<Help>(null);
 const [needsSession,setNeedsSession]=useState(false);
 const [startAnswers,setStartAnswers]=useState<StartAnswers>(EMPTY_START);
 const [notice,U]=useState('');
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
   SS(null);
   setNeedsSession(false);
   S((await client('api').sky()).stars);
   R(true);
   U('데모를 다시 시작했어요. 작성한 내용으로 다시 시도해 주세요.');
 }
 const star=stars.find(s=>s.starId===starId);
 async function reloadSky() {
   try { S((await client(mode).sky()).stars); }
   catch (error) { reportError(error); E('기록은 저장됐지만 밤하늘을 다시 읽지 못했어요. 밤하늘에서 다시 불러와 주세요.'); }
 }
 const helpToggle = { open: help?.title===HELP.title, toggle: () => H(h=>h?.title===HELP.title?null:HELP) };
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
 const footer = <footer>시연용 서비스 · 실제 개인정보를 입력하지 마세요.{ready&&<button className="text-button" disabled={busy} onClick={()=>{localStorage.removeItem('naranhi-mode');R(false);H(null);SS(null);E('');setNeedsSession(false);}}>체험 방식 다시 선택</button>}</footer>;
 if(!loaded)return <main className="shell sky-mode"><p className="night-loading">밤하늘을 준비하고 있어요…</p></main>;
 return <HelpContext.Provider value={helpToggle}>{night&&<SkyPanorama background/>}<main className={night?`shell sky-mode panorama-content${locked?' sky-locked':''}`:'shell night-ui'} lang="ko">{locked
   // 메인: 왼쪽 위 도움받을 곳, 오른쪽 위 정책추천·청년센터 (머리글 대신 모서리 버튼)
   ? <header className="sky-top">
       <button type="button" className="sky-pill" aria-expanded={help?.title===HELP.title} onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}><span aria-hidden="true">♡</span> 도움받을 곳</button>
       <div className="sky-top-right">
         <Link className="sky-pill gold" href="/policies"><span aria-hidden="true">✦</span> 정책추천</Link>
         <Link className="sky-pill small-pill" href="/centers"><span aria-hidden="true">⌖</span> 청년센터</Link>
         <PendingNextLink mode={mode} />
       </div>
     </header>
   : ready
   // 다른 화면: 머리글 없음. 각 화면이 공통 틀의 제목 줄(screen-kit.tsx ScreenBar: ‹ 뒤로 · 제목 · ♡ 도움받을 곳)을 그림
   ? null
   : <header><Link className="brand" href="/">✧ 나란히</Link>{ready&&mode==='example'&&<span className="small">예시 기록</span>}{!ready&&<Link className="text-button" href="/catalog">별자리 도감</Link>}{ready&&<Link className="text-button" href="/sky">내 밤하늘</Link>}<button className="text-button" onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}>도움받을 곳</button></header>}
 {help&&<aside className="help" role="alert"><h2>{help.title}</h2>{help.lines.map(line=><p key={line}>{line}</p>)}<button type="button" className="text-button" onClick={()=>H(null)}>닫기</button></aside>}
 {error&&<p className="error" role="alert">{error}</p>}
 {needsSession&&<section className="card"><p>데모 세션을 다시 시작해 주세요. 작성한 글은 이 화면에 그대로 있어요.</p><button disabled={busy} onClick={()=>run(restartSession)}>데모 다시 시작</button></section>}
 {!ready?<><div className="intro"><span className="welcome-icon" aria-hidden="true">✦<sup>✧</sup></span><h1>오늘의 작은 시도가<br/>별이 되는 곳</h1><p>다 해내지 않아도 괜찮아요.<br/>손을 뻗은 순간도 하늘에 남아요.</p><button disabled={busy} onClick={()=>run(async()=>{await client(mode).start();if(Object.values(startAnswers).some(v=>v!==null)){try{await client(mode).saveProfile({startAnswers});}catch{U('시작 질문 답은 저장하지 못했어요. 내 정보에서 다시 저장할 수 있어요.');}}S((await client(mode).sky()).stars);R(true);})}>{busy?'준비 중…':'데모 시작'}</button><p className="small">{mode==='example'?'예시 모드 · 이 브라우저에 기록해요':'실제 API 모드 · 서버 세션에 기록해요'}</p></div><details className="onboarding"><summary>시작 질문과 체험 방식</summary><section className="card"><h2>가상 내용으로 체험해 주세요</h2><p>실제 개인정보를 입력하지 마세요.</p><label>체험 방식<select value={mode} onChange={e=>M(e.target.value as Mode)}><option value="example">예시 모드 · 브라우저 저장</option><option value="api">실제 API · 서버 세션</option></select></label><StartQuestions value={startAnswers} onChange={setStartAnswers} disabled={busy}/><p className="small">모든 질문은 선택이에요. 답하지 않아도 시작할 수 있고, 시작한 뒤 내 정보에서 더 알려 주거나 고칠 수 있어요. {mode==='api'?'답과 기록은 데모 세션에 저장돼요.':'답과 예시 기록은 이 브라우저에 저장돼요.'}</p></section></details></>:<>
 {/* 하단 이동 버튼은 메인에서만. 다른 화면은 하나의 일에 집중하고 왼쪽 위 "← 내 밤하늘"로 돌아감 (도감 화면과 같은 구조) */}
 {locked&&<nav className="bottom-nav dock" aria-label="주 메뉴">
   {navigation.map(tab => <Link key={tab.href} href={tab.href} className={tab.kind === 'main' ? 'dock-main' : 'dock-side'}>
     <tab.Icon /><span>{tab.label}</span>
   </Link>)}
 </nav>}
 {screen==='sky'&&<NightSky stars={stars} selected={selected} onSelect={SS} busy={busy} onReload={()=>run(async()=>S((await client(mode).sky()).stars))} footer={footer}/>}
 {screen==='checkin'&&<QuestScreen mode={mode} busy={busy} run={run} onHelp={H} onError={E}/>}
 {screen==='star'&&<StarScreen key={starId} mode={mode} star={star} busy={busy} run={run} onHelp={H} onSaved={reloadSky}/>}
 {screen==='profile'&&<ProfileHome mode={mode}/>}
 {screen==='policies'&&<PoliciesScreen mode={mode} onError={reportError} onClearError={()=>E('')}/>}
 {screen==='centers'&&<CentersScreen mode={mode} centerId={centerId} onError={reportError} onHelp={H} onClearError={()=>E('')}/>}
 </>}{notice&&<p role="status">{notice}</p>}{!locked&&footer}</main></HelpContext.Provider>;
}
