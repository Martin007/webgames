import {useEffect, useRef, useState, type ReactNode} from 'react';
import {utcDay, untilReset} from './daily';

export function useDailyClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, []);
  return {day: utcDay(now), remaining: untilReset(now)};
}
export function Icon({name, ...props}: {name: 'arrow' | 'back' | 'clock' | 'spark' | 'people' | 'phone' | 'check' | 'close' | 'sound' | 'mute' | 'trophy' | 'copy' | 'help'; className?: string}) {
  const paths: Record<string, ReactNode> = {
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
    back: <><path d="M20 12H5m6-6-6 6 6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" /></>,
    people: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-3a6 6 0 0 1 12 0v3M4 5a3 3 0 0 0 0 6m16-6a3 3 0 0 1 0 6M2 19v-2a4 4 0 0 1 3-4m17 6v-2a4 4 0 0 0-3-4" /></>,
    phone: <path d="M5 3h4l2 5-3 2a16 16 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    sound: <><path d="m11 4-6 5H2v6h3l6 5ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    mute: <><path d="m11 4-6 5H2v6h3l6 5ZM17 9l5 6m0-6-5 6" /></>,
    trophy: <><path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v6m-5 1h10" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.5-1.5 3M12 17h.01" /></>,
  };
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function Wordmark() {
  return <a className="wg-wordmark" href="#/" aria-label="Webgames home"><span className="wg-mark" aria-hidden="true"><i /><i /><i /><i /></span>webgames<span className="wg-wordmark-dot">.</span></a>;
}
export function Modal({title, children, onClose, dark = false}: {title: string; children: ReactNode; onClose: () => void; dark?: boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog className={`wg-modal ${dark ? 'wg-modal--dark' : ''}`} ref={ref} aria-labelledby="wg-modal-title" onCancel={(e) => {e.preventDefault(); onClose();}} onClick={(e) => {if (e.target === e.currentTarget) onClose();}}>
    <header><h2 id="wg-modal-title">{title}</h2><button className="wg-icon-btn" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></header>
    <div className="wg-modal-body">{children}</div>
  </dialog>;
}
export function TriviaireEmblem({small = false}: {small?: boolean}) {
  return <div className={`tr-emblem ${small ? 'tr-emblem--small' : ''}`} aria-hidden="true">
    <div className="tr-emblem-orbit" /><div className="tr-emblem-rays" />
    <div className="tr-emblem-face"><span className="tr-emblem-star">✦</span><span>WHO WANTS TO BE A</span><strong>TRIVIAIRE</strong><span className="tr-emblem-base">THE DAILY HOT SEAT</span><span className="tr-emblem-star">✦</span></div>
  </div>;
}
