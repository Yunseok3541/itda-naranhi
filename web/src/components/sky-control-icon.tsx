const paths = {
  shop: <><path d="M4 10v10h16V10M3 9l2-5h14l2 5v1a3 3 0 0 1-4.5 2.6A3 3 0 0 1 12 12a3 3 0 0 1-4.5.6A3 3 0 0 1 3 10V9ZM9 20v-4h6v4" /><path d="M3 9h18" /></>,
  photos: <><rect x="6" y="5" width="15" height="15" rx="2" /><path d="M3 16V6a3 3 0 0 1 3-3h10M6 17l4-4 3 3 3-4 5 5" /><circle cx="11" cy="9" r="1" /></>,
  // 설정(톱니): 글자 기호 ⚙는 기기마다 크기·높이가 달라 옆 "도움" 아이콘과 줄이 어긋나서 그림으로 (모양은 Lucide "settings", ISC 라이선스)
  settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  help: <><path d="M12 20s-8-4.7-8-10.1a4.1 4.1 0 0 1 8-1.1 4.1 4.1 0 0 1 8 1.1C20 15.3 12 20 12 20Z" /><path d="M12 10.4v5m-2.5-2.5h5" /></>,
  phone: <path d="M8 4H5a1 1 0 0 0-1 1c0 8.3 6.7 15 15 15a1 1 0 0 0 1-1v-3l-4.7-1.8-1.6 1.6a10.2 10.2 0 0 1-5.5-5.5l1.6-1.6L8 4Z" />,
  starList: <><path d="M10 6h10m-10 6h10m-10 6h10" /><path d="m5 3.5.7 1.8 1.8.7-1.8.7L5 8.5l-.7-1.8-1.8-.7 1.8-.7Z" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>,
  center: <><path d="M3.5 11 12 4l8.5 7M6 10v9h12v-9M10 19v-5h4v5" /><path d="M17.5 3v4M15.5 5h4" /></>,
  policy: <><path d="M6 3.5h9l3 3V21H6zM14.5 3.5V7H18M9 11h6m-6 4h6" /><path d="M9 18h3" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  book: <path d="M3 5.5C6 4.4 9.6 4.8 12 7c2.4-2.2 6-2.6 9-1.5V19c-3-1.1-6.6-.7-9 1.5C9.6 18.3 6 17.9 3 19zm9 1.5v13.5" />,
  star: <path fill="currentColor" stroke="none" d="M12 2c1.8 6.3 3.7 8.2 10 10-6.3 1.8-8.2 3.7-10 10-1.8-6.3-3.7-8.2-10-10 6.3-1.8 8.2-3.7 10-10Z" />,
  constellation: <><path d="m5 7 5 10 9-9" /><circle cx="5" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="10" cy="17" r="2" fill="currentColor" stroke="none" /><circle cx="19" cy="8" r="2" fill="currentColor" stroke="none" /></>,
  moon: <><path d="M20.5 14.2A8.4 8.4 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" /><path d="M16 4v5m-2.5-2.5h5" /></>,
  talk: <><path d="M19.5 11.2a7.5 6.2 0 0 1-7.5 6.2c-.7 0-1.4-.1-2-.3L5 19l1.5-3.9a5.8 5.8 0 0 1-2-3.9A7.5 6.2 0 0 1 12 5a7.5 6.2 0 0 1 7.5 6.2Z" /><path d="M9 11.2h.1m2.9 0h.1m2.9 0h.1" /></>,
  memory: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 13h6m-6 3h4m-2-6h2m-1-1v2" /></>,
  horizon: <><path d="M3 15h18M6 19h12m-11-4a5 5 0 0 1 10 0m-5-9V4m5 4 1.5-1.5M7 8 5.5 6.5" /></>,
  refresh: <><path d="M19 10a7 7 0 1 0 1 5m-.7-9v5h-5" /></>,
  back: <path d="m14.5 6-6 6 6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
} as const;

export default function SkyControlIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="sky-control-icon" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
