const paths = {
  heart: <path d="M12 20s-8-4.7-8-10.1a4.1 4.1 0 0 1 8-1.1 4.1 4.1 0 0 1 8 1.1C20 15.3 12 20 12 20Z" />,
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
