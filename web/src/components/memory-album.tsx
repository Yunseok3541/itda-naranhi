'use client';
import Image from 'next/image';
import {useEffect,useId,useRef,useState} from 'react';
import {client,type MemoryPhoto,type Mode} from '@/lib/mobile-data';
import SkyControlIcon from './sky-control-icon';
import './memory-album.css';

export async function preparePhoto(file:File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>12*1024*1024) throw Error('12MB 이하의 JPG, PNG, WebP 사진을 골라 주세요.');
  const bmp=await createImageBitmap(file);
  try {
    const ratio=Math.min(1,1024/Math.max(bmp.width,bmp.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bmp.width*ratio)); canvas.height=Math.max(1,Math.round(bmp.height*ratio));
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
    const photo=canvas.toDataURL('image/jpeg',0.73);
    if(photo.length>700000) throw Error('조금 더 작은 사진을 선택해 주세요.');
    return photo;
  } finally { bmp.close(); }
}

export function Album({photos,mode,group,onClose,onRemove}:{photos:MemoryPhoto[];mode:Mode;group:number;onClose:()=>void;onRemove:(id:number)=>void}) {
  const items=photos.filter(p=>p.group===group);
  const [index,setIndex]=useState(0);
  const [detail,setDetail]=useState<'photo'|'record'|null>(null);
  const [playing,setPlaying]=useState(()=>!matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const modal=useRef<HTMLDialogElement>(null);
  const touch=useRef<number|null>(null);
  const current=Math.min(index,items.length-1);
  const item=items[current];
  function step(by:number){setPlaying(false);setIndex(Math.max(0,Math.min(items.length-1,current+by)));}
  useEffect(()=>{
    const dialog=modal.current!;dialog.showModal();
    const pref=matchMedia('(prefers-reduced-motion: reduce)');

    const stop=()=>setPlaying(false);pref.addEventListener('change',stop);
    return ()=>{pref.removeEventListener('change',stop);dialog.close();};
  },[]);
  useEffect(()=>{
    if(!playing || current>=items.length-1)return;
    const timer=setTimeout(()=>setIndex(current+1),4200);return ()=>clearTimeout(timer);
  },[playing,current,items.length]);
  if(!item)return null;
  return <dialog ref={modal} className="photo-album" aria-label={item.name+' 기억 앨범'} onCancel={e=>{e.preventDefault();if(detail)setDetail(null);else onClose();}}
    onKeyDown={e=>{if(!detail && ['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}}}>
    <header><h2>{detail==='record'?'원래 기록':item.name+'의 기억'}</h2><button onClick={()=>detail?setDetail(null):onClose()}>닫기</button></header>
    <div className="photo-window" onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{
      if(touch.current!==null && !detail){const delta=e.changedTouches[0].clientX-touch.current;if(Math.abs(delta)>35)step(delta<0?1:-1);}touch.current=null;}}>
      <div className="photo-strip" style={{transform:'translateX(-'+current*100+'%)'}}>
        {items.map(p=><button key={p.id} tabIndex={p.id===item.id?0:-1} aria-label="사진 크게 보기" onClick={()=>{setPlaying(false);setDetail('photo');}}><img src={p.src} alt={p.title} style={{height:detail==='photo'?'58dvh':undefined}}/></button>)}
      </div></div>
    <small>{new Date(item.date).toLocaleDateString('ko-KR')} · {current+1} / {items.length}</small><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}
    {!detail && items.length>1 && <nav><button disabled={!current} onClick={()=>step(-1)}>이전</button><button disabled={current===items.length-1} onClick={()=>setPlaying(!playing)}>{playing && current<items.length-1?'일시정지':'재생'}</button><button disabled={current===items.length-1} onClick={()=>step(1)}>다음</button></nav>}
    {!detail && <button onClick={()=>{setPlaying(false);setDetail('record');}}>원래 기록 보기</button>}
    {detail==='record' && <p>별 기록 · {item.status==='bright'?'하늘의 별 따기':'손 뻗어 보기'}</p>}
    {detail && <button disabled={busy} onClick={async()=>{if(!confirm('사진을 지울까요? 별 기록과 한 줄은 보관돼요.'))return;
      setBusy(true);try{await client(mode).removePhoto(item.id);onRemove(item.id);setDetail(null);if(items.length===1)onClose();}
      catch{setError('사진을 지우지 못했어요. 다시 시도해 주세요.');}finally{setBusy(false);}}}>사진 삭제</button>}
    {error && <p role="alert">{error}</p>}
  </dialog>;
}

export function MemoryLibrary({mode}:{mode:Mode}) {
  const [photos, setPhotos] = useState<MemoryPhoto[]>([]);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<number | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [completed, setCompleted] = useState<Set<number> | null>(null);
  const [retry, setRetry] = useState(0);
  const listId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const albumTrigger = useRef<HTMLButtonElement>(null);

  function closeAlbum() {
    setGroup(null);
    requestAnimationFrame(() => {
      const trigger = albumTrigger.current;
      (trigger?.isConnected ? trigger : toggle.current)?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    let active = true;
    const api = client(mode);
    api.memoryPhotos().then(list => {
      if (active) { setPhotos(list); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    api.avatar().then(avatar => {
      if (active && avatar.constellations) {
        setCompleted(new Set(avatar.constellations.filter(item => item.acquired).map(item => item.constellationId)));
      }
    }).catch(() => { /* The album remains available if collection status cannot be loaded. */ });
    return () => { active = false; };
  }, [mode, retry]);

  const albums = new Map<number, { cover: MemoryPhoto; count: number }>();
  for (const photo of [...photos].reverse()) {
    const album = albums.get(photo.group);
    if (album) album.count++;
    else albums.set(photo.group, { cover: photo, count: 1 });
  }

  return <section className="photo-library" aria-label="나의 기억들">
    <button ref={toggle} type="button" className="secondary photo-library-toggle" aria-expanded={open} aria-controls={listId}
      onClick={() => setOpen(value => !value)}>
      <span className="photo-library-icon"><SkyControlIcon name="photos" /></span>
      <span className="photo-library-copy">
        <strong>나의 기억들</strong>
        <small>{albums.size ? `앨범 ${albums.size}개 · 사진 ${photos.length}장` : '별에 남긴 사진 모아보기'}</small>
      </span>
      <span className="photo-library-chevron" aria-hidden="true"><SkyControlIcon name="back" /></span>
    </button>
    <div id={listId} className="photo-library-list" hidden={!open}>
      {status === 'loading' && <p role="status">사진을 불러오고 있어요.</p>}
      {status === 'error' && <div className="photo-library-empty">
        <p role="alert">사진을 불러오지 못했어요.</p>
        <button type="button" className="secondary" onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>다시 불러오기</button>
      </div>}
      {status === 'ready' && (albums.size === 0
        ? <p className="photo-library-empty">별을 기록할 때 사진을 남기면 여기에 모여요.</p>
        : [...albums.values()].map(({ cover, count }) => <button type="button" className="secondary photo-cover" key={cover.group}
          onClick={event => { albumTrigger.current = event.currentTarget; setGroup(cover.group); }}>
          <Image src={cover.src} alt="" width={80} height={66} unoptimized />
          <span className="photo-cover-copy">
            <strong>{cover.name}</strong>
            <span className="photo-cover-meta">
              {completed && <span className="photo-cover-state" data-complete={completed.has(cover.group) || undefined}>
                {completed.has(cover.group) ? '완성' : '모으는 중'}
              </span>}
              <span>사진 {count}장</span>
            </span>
            <time dateTime={cover.date}>{new Date(cover.date).toLocaleDateString('ko-KR')}</time>
          </span>
          <span className="photo-cover-arrow" aria-hidden="true">›</span>
        </button>))}
    </div>
    {group !== null && <Album group={group} mode={mode} photos={photos} onClose={closeAlbum}
      onRemove={id => setPhotos(current => current.filter(photo => photo.id !== id))} />}
  </section>;
}
