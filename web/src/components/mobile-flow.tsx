"use client";
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
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
import { getCompletedConstellationIds, getStarConstellationId } from '@/lib/constellations';
import { consumeConstellationCelebration, queueConstellationCelebration } from '@/lib/constellation-celebration';
import SkyControlIcon from './sky-control-icon';
import './night-sky.css';
// 하단 버튼 3개(메인에서만): 프로필 · 오늘의 별 · 도감
// 정책추천·청년센터는 메인 오른쪽 위, 도움받을 곳은 메인 왼쪽 위, 홈(내 밤하늘)은 다른 화면 머리글의 "나란히"
const navigation = [
  { href: '/profile', label: '프로필', icon: 'person', kind: 'side' },
  { href: '/checkin', label: '오늘의 별', icon: 'star', kind: 'main' },
  { href: '/catalog', label: '도감', icon: 'book', kind: 'side' },
] as const;
const skyGuideKey = (mode: Mode) => `naranhi-sky-guide-${mode}`;
function shouldShowSkyGuide(mode: Mode, stars: Star[]) {
  return stars.length > 0 && stars.every(star => star.status === 'untried' && !star.memories.length)
    && localStorage.getItem(skyGuideKey(mode)) !== 'seen';
}
const HELP = {
  title: '도움받을 곳',
  lines: [
    '이 앱은 상담을 대신하지 않아요. 힘들 때는 혼자 감당하지 않아도 돼요.',
    '자살예방상담전화 109 (24시간)',
    '정신건강위기상담전화 1577-0199',
    '가까운 청년센터·정신건강복지센터에서도 도움을 받을 수 있어요.',
  ],
};

export default function MobileFlow({screen='sky',starId,centerId,completionAttemptId,memoryStarId}:{
  screen?:string;starId?:number;centerId?:number;completionAttemptId?:number;memoryStarId?:number;
}){
 const resources = useRef<HTMLDialogElement>(null);
 const questDialog = useRef<HTMLDialogElement>(null);
 const questTrigger = useRef<HTMLButtonElement>(null);
 const questTitle = useId();
 const [mode,M]=useState<Mode>('example'),[ready,R]=useState(false),[loaded,L]=useState(false),[busy,B]=useState(false),[error,E]=useState('');const lock=useRef(false);
 const [stars,S]=useState<Star[]>([]),[selected,SS]=useState<Star|null>(null),[help,H]=useState<Help>(null);
 const [totalPoints,setTotalPoints]=useState<number>();
 const [completedId,setCompletedId]=useState<number>();
 const [showSkyGuide,setShowSkyGuide]=useState(false);
 const [questOpen,setQuestOpen]=useState(false);
 const [needsSession,setNeedsSession]=useState(false);
 const [startAnswers,setStartAnswers]=useState<StartAnswers>(EMPTY_START);
 const [startStep,setStartStep]=useState<number | null>(null);
 const startSaved=useRef(false);
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
         if (active) {
           S(sky.stars);
           setTotalPoints(sky.totalPoints);
           if (screen === 'sky') {
             SS(sky.stars.find(star => star.starId === memoryStarId && star.memories.length > 0) ?? null);
             setShowSkyGuide(shouldShowSkyGuide(mode, sky.stars));
           }
           if (screen === 'sky' && completionAttemptId !== undefined) {
             const id = consumeConstellationCelebration(mode, completionAttemptId);
             if (id !== undefined && getCompletedConstellationIds(sky.stars).has(id)) setCompletedId(id);
           }
         }
       }
     } catch (error) {
       if (active) reportError(error);
     } finally {
       if (active) L(true);
     }
   }
   void Promise.resolve().then(() => { if (active) return load(); });
   return () => { active = false; };
 }, [screen, completionAttemptId, memoryStarId]);
 function dismissSkyGuide() {
   setShowSkyGuide(false);
   try { localStorage.setItem(skyGuideKey(mode), 'seen'); } catch { /* Keep the guide closed for this visit. */ }
 }
 function openQuest() {
   if (!questDialog.current || questDialog.current.open) return;
   dismissSkyGuide();
   questDialog.current.showModal();
   setQuestOpen(true);
 }
 function closeQuest() {
   questDialog.current?.close();
   setQuestOpen(false);
 }
 useEffect(() => {
   const dialog = questDialog.current;
   const viewport = window.visualViewport;
   if (!questOpen || !dialog || !viewport) return;
   function fitViewport() {
     if (!dialog || !viewport) return;
     dialog.style.setProperty('--quest-viewport-height', `${viewport.height}px`);
     dialog.style.setProperty('--quest-keyboard-inset', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
   }
   fitViewport();
   viewport.addEventListener('resize', fitViewport);
   viewport.addEventListener('scroll', fitViewport);
   return () => {
     viewport.removeEventListener('resize', fitViewport);
     viewport.removeEventListener('scroll', fitViewport);
   };
 }, [questOpen]);
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
   const sky = await client('api').sky();
   S(sky.stars);
   setTotalPoints(sky.totalPoints);
   R(true);
   U('데모를 다시 시작했어요. 작성한 내용으로 다시 시도해 주세요.');
 }
 async function finishOnboarding() {
   const api = client(mode);
   if (!startSaved.current) {
     await api.start();
     const current = (await api.profile()).startAnswers;
     const { range, burden, with: approach } = startAnswers;
     const extra = current && (current.support !== null || current.living !== null || current.needs !== null)
       ? { support: current.support, living: current.living, needs: current.needs } : {};
     await api.saveProfile({ startAnswers: { ...extra, range, burden, with: approach } });
     startSaved.current = true;
   }
   const sky = await api.sky();
   S(sky.stars);
   setTotalPoints(sky.totalPoints);
   if (screen === 'sky') setShowSkyGuide(shouldShowSkyGuide(mode, sky.stars));
   R(true);
 }
 const star=stars.find(s=>s.starId===starId);
 async function reloadSky(result?: { attemptId: number; status: string }) {
   try {
     const { stars: refreshed, totalPoints } = await client(mode).sky();
     S(refreshed);
     setTotalPoints(totalPoints);
     if (result?.status === 'bright' && star && star.status !== 'bright') {
       const constellationId = getStarConstellationId(star);
       const savedStar = refreshed.find(item => item.starId === star.starId);
       const savedHere = savedStar?.memories.some(memory => memory.attemptId === result.attemptId);
       if (savedHere && getCompletedConstellationIds(refreshed).has(constellationId)) {
         return queueConstellationCelebration({ mode, constellationId, attemptId: result.attemptId });
       }
     }
   }
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
 const footer = <footer>시연용 서비스 · 실제 개인정보를 입력하지 마세요.{ready&&<button className="text-button" disabled={busy} onClick={()=>{localStorage.removeItem('naranhi-mode');R(false);H(null);SS(null);E('');setNeedsSession(false);setStartStep(null);setStartAnswers(EMPTY_START);startSaved.current=false;}}>체험 방식 다시 선택</button>}</footer>;
 const feedback = <>
   {help && <aside className="help" role="alert"><h2>{help.title}</h2>{help.lines.map(line => <p key={line}>{line}</p>)}<button type="button" className="text-button" onClick={() => H(null)}>닫기</button></aside>}
   {error && <p className="error" role="alert">{error}</p>}
   {needsSession && <section className="card"><p>데모 세션을 다시 시작해 주세요. 작성한 글은 이 화면에 그대로 있어요.</p><button disabled={busy} onClick={() => run(restartSession)}>데모 다시 시작</button></section>}
 </>;
 if(!loaded)return <main className="shell sky-mode"><p className="night-loading">밤하늘을 준비하고 있어요…</p></main>;
 return <HelpContext.Provider value={helpToggle}>{night&&<SkyPanorama background dome={locked}/>}<main className={night?`shell sky-mode panorama-content${locked?' sky-locked':''}`:'shell night-ui'} lang="ko">{locked
   // 메인: 왼쪽 위 도움받을 곳, 오른쪽 위 정책추천·청년센터 (머리글 대신 모서리 버튼)
   ? <header className="sky-top">
       <button type="button" className="sky-pill sky-utility sky-help-button" aria-expanded={help?.title===HELP.title} onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}>
         <span className="sky-utility-symbol"><SkyControlIcon name="heart" /></span><span>도움받을 곳</span>
       </button>
       <button type="button" className="sky-pill sky-utility sky-resource-button" aria-haspopup="dialog" onClick={() => resources.current?.showModal()}>
         <span className="sky-utility-symbol"><SkyControlIcon name="center" /></span><span>청년센터·정책</span>
       </button>
       <dialog className="sky-map-dialog sky-resource-dialog" ref={resources} aria-label="청년센터·정책">
         <h2>청년센터·정책</h2>
         <Link className="ghost sky-resource-link" href="/centers" onClick={() => resources.current?.close()}>
           <span className="sky-utility-symbol"><SkyControlIcon name="center" /></span> 청년센터
         </Link>
         <Link className="ghost sky-resource-link" href="/policies" onClick={() => resources.current?.close()}>
           <span className="sky-utility-symbol"><SkyControlIcon name="policy" /></span> 나에게 맞는 정책
         </Link>
         <form method="dialog"><button className="ghost sky-icon-action"><SkyControlIcon name="close" /> 닫기</button></form>
       </dialog>
     </header>
   : ready
   // 다른 화면: 머리글 없음. 각 화면이 공통 틀의 제목 줄(screen-kit.tsx ScreenBar: ‹ 뒤로 · 제목 · ♡ 도움받을 곳)을 그림
   ? null
   : <header><Link className="brand" href="/">✧ 나란히</Link>{ready&&mode==='example'&&<span className="small">예시 기록</span>}{!ready&&<Link className="text-button" href="/catalog">별자리 도감</Link>}{ready&&<Link className="text-button" href="/sky">내 밤하늘</Link>}<button className="text-button" onClick={()=>H(h=>h?.title===HELP.title?null:HELP)}>도움받을 곳</button></header>}
 {!questOpen && feedback}
 {!ready ? startStep === null ? <>
   <div className="intro"><span className="welcome-icon" aria-hidden="true">✦<sup>✧</sup></span><h1>오늘의 작은 시도가<br/>별이 되는 곳</h1><p>다 해내지 않아도 괜찮아요.<br/>손을 뻗은 순간도 하늘에 남아요.</p>
     <button type="button" onClick={() => setStartStep(0)}>데모 시작</button>
     <p className="small">{mode === 'example' ? '예시 모드 · 이 브라우저에 기록해요' : '실제 API 모드 · 서버 세션에 기록해요'}</p>
   </div>
   <details className="onboarding"><summary>체험 방식</summary><section className="card">
     <p>가상 내용으로 체험해 주세요. 실제 개인정보는 입력하지 마세요.</p>
     <label>체험 방식<select value={mode} onChange={e => M(e.target.value as Mode)}><option value="example">예시 모드 · 브라우저 저장</option><option value="api">실제 API · 서버 세션</option></select></label>
   </section></details>
 </> : <section className="card onboarding-step" aria-label={`시작 질문 ${startStep + 1}/3`}>
   <h2>시작 질문 <span>{startStep + 1}/3</span></h2>
   <p className="small">모든 질문은 건너뛸 수 있어요.</p>
   <StartQuestions value={startAnswers} onChange={setStartAnswers} step={startStep} disabled={busy} />
   <div className="choices">
     <button type="button" className="ghost" disabled={busy} onClick={() => { E(''); setStartStep(startStep === 0 ? null : startStep - 1); }}>이전</button>
     <button type="button" disabled={busy} onClick={() => startStep < 2 ? setStartStep(startStep + 1) : run(finishOnboarding)}>{busy ? '준비 중…' : startStep < 2 ? '다음' : '밤하늘 열기'}</button>
   </div>
 </section> : <>
 {/* 하단 이동 버튼은 메인에서만. 다른 화면은 하나의 일에 집중하고 왼쪽 위 "← 내 밤하늘"로 돌아감 (도감 화면과 같은 구조) */}
 {locked&&<nav className="sky-actions" aria-label="주 메뉴">
   {navigation.map(tab => tab.kind === 'main'
     ? <button key={tab.href} type="button" className="dock-main" ref={questTrigger} aria-haspopup="dialog" onClick={openQuest}>
         <span className="dock-icon"><SkyControlIcon name={tab.icon} /></span><span>{tab.label}</span>
       </button>
     : <Link key={tab.href} href={tab.href} className="dock-side">
         <span className="dock-icon"><SkyControlIcon name={tab.icon} /></span><span>{tab.label}</span>
       </Link>)}
 </nav>}
 {screen==='sky'&&<NightSky stars={stars} selected={selected} onSelect={SS} busy={busy} onReload={()=>run(async()=>{const sky=await client(mode).sky();S(sky.stars);setTotalPoints(sky.totalPoints);})} footer={footer} nextLink={<PendingNextLink mode={mode} />} completedId={completedId} mode={mode} totalPoints={totalPoints}
   showGuide={showSkyGuide && !help && !needsSession} onDismissGuide={dismissSkyGuide} onOpenQuest={openQuest}/>}
 {locked && <dialog className="quest-dialog night-ui" ref={questDialog} aria-labelledby={questTitle}
   onClick={event => { if (event.target === event.currentTarget) closeQuest(); }}
   onClose={event => {
     if (event.currentTarget.open) return;
     setQuestOpen(false);
     if (document.activeElement === document.body) questTrigger.current?.focus({ preventScroll: true });
   }}>
   <header className="quest-dialog-header">
     <div className="quest-dialog-grip" aria-hidden="true" />
     <h2 id={questTitle}><SkyControlIcon name="star" /> 오늘의 별</h2>
     <button type="button" className="text-button quest-dialog-close" aria-label="오늘의 별 닫기" onClick={closeQuest}><SkyControlIcon name="close" /></button>
   </header>
   <div className="quest-dialog-body">
     {questOpen && feedback}
     <QuestScreen mode={mode} busy={busy} run={run} onHelp={H} onError={E} onClose={closeQuest} onTotalPoints={setTotalPoints} />
   </div>
 </dialog>}
 {screen==='checkin'&&<QuestScreen mode={mode} busy={busy} run={run} onHelp={H} onError={E}/>}
 {screen==='star'&&<StarScreen key={starId} mode={mode} star={star} busy={busy} run={run} onHelp={H} onSaved={reloadSky}/>}
 {screen==='profile'&&<ProfileHome mode={mode}/>}
 {screen==='policies'&&<PoliciesScreen mode={mode} onError={reportError} onClearError={()=>E('')}/>}
 {screen==='centers'&&<CentersScreen mode={mode} centerId={centerId} onError={reportError} onHelp={H} onClearError={()=>E('')}/>}
 </>}{notice&&<p role="status">{notice}</p>}{!locked&&footer}</main></HelpContext.Provider>;
}
