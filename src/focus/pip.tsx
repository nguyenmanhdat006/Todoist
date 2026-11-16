/** Hình trong hình: đồng hồ Pomodoro trong cửa sổ nổi luôn ở trên cùng (Document Picture-in-Picture, Chrome / Edge) */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useT, type TKey } from '../i18n';
import { toast } from '../toast';
import { tickFocus } from './runner';
import { unlockAudio } from './sound';
import { BREAK_COLORS, fmtClock, useFocus, type Mode } from './store';

interface DocumentPiP {
  requestWindow: (o?: { width?: number; height?: number }) => Promise<Window>;
}

const api = () => (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture;

export const pipSupported = () => typeof window !== 'undefined' && !!api();

export const usePip = create<{ win: Window | null }>(() => ({ win: null }));

/** Mở cửa sổ nổi; đang mở thì đóng lại */
export async function togglePip() {
  const cur = usePip.getState().win;
  if (cur) {
    cur.close();
    return;
  }
  const a = api();
  if (!a) {
    toast.error('focus.pip.unsupported');
    return;
  }
  try {
    const win = await a.requestWindow({ width: 340, height: 420 });
    // Cửa sổ mới trống: nạp địa chỉ gốc và toàn bộ CSS của trang để dùng lại các lớp sẵn có
    const base = win.document.createElement('base');
    base.href = `${location.origin}/`;
    win.document.head.appendChild(base);
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => win.document.head.appendChild(n.cloneNode(true)));
    win.document.documentElement.lang = document.documentElement.lang;
    win.document.body.style.cssText = 'margin:0;overflow:hidden;background:#0b0c10';
    win.addEventListener('pagehide', () => usePip.setState({ win: null }));
    usePip.setState({ win });
  } catch {
    toast.error('focus.pip.failed');
  }
}

/** Đặt trong Root: vẽ đồng hồ vào cửa sổ nổi khi đang mở */
export function PipHost() {
  const win = usePip((s) => s.win);
  // Đóng cửa sổ nổi khi tải lại hoặc rời trang
  useEffect(() => {
    const close = () => usePip.getState().win?.close();
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, []);
  if (!win) return null;
  return createPortal(<PipTimer win={win} />, win.document.body);
}

const MODES: Mode[] = ['focus', 'short', 'long'];

function PipTimer({ win }: { win: Window }) {
  const t = useT();
  const s = useFocus();
  const [now, setNow] = useState(() => Date.now());
  const running = s.status === 'running';

  // Cửa sổ nổi luôn hiện nên bộ hẹn giờ của nó không bị trình duyệt làm chậm khi tab chính bị ẩn
  useEffect(() => {
    const id = win.setInterval(() => {
      setNow(Date.now());
      tickFocus();
    }, 250);
    return () => win.clearInterval(id);
  }, [win]);

  const left = running ? Math.max(0, s.endsAt - now) : s.remaining;
  const total = s.durationOf(s.mode);
  const progress = total ? 1 - left / total : 0;
  const mm = fmtClock(left);
  const color = s.mode === 'focus' ? s.settings.accent : BREAK_COLORS[s.mode];
  const startLabel = running ? t('focus.pause') : s.status === 'paused' ? t('focus.resume') : t('focus.start');

  return (
    <div className={`fp fp-pip scene-${s.settings.scene}`} style={{ ['--fa' as string]: color }}>
      <div className="fp-scene" aria-hidden="true" />
      <div className="fp-pip-body">
        <div className="fp-tabs" role="tablist">
          {MODES.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={s.mode === m} className={s.mode === m ? 'on' : ''} disabled={running && s.mode !== m} onClick={() => s.setMode(m)}>
              {t(`focus.mode.${m}` as TKey)}
            </button>
          ))}
        </div>
        <div className={`fp-timer style-ring${running ? ' is-running' : ''}`}>
          <svg className="fp-ring" viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <linearGradient id="fp-ring-grad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" className="g0" />
                <stop offset="1" className="g1" />
              </linearGradient>
            </defs>
            <circle className="track" cx="100" cy="100" r="92" />
            <circle className="bar" cx="100" cy="100" r="92" pathLength={100} strokeDasharray={100} strokeDashoffset={progress * 100} />
          </svg>
          <div className="fp-time" role="timer" aria-label={mm}>
            <span>{mm.slice(0, 2)}</span>
            <i>:</i>
            <span>{mm.slice(3)}</span>
          </div>
        </div>
        <p className="fp-pip-task" title={s.task?.title}>
          {s.task ? s.task.title : t(`focus.session.${s.mode}` as TKey)}
        </p>
        <div className="fp-pip-controls">
          <button type="button" className="fp-dock-btn icon" onClick={s.reset} disabled={s.status === 'idle'} title={t('focus.reset')} aria-label={t('focus.reset')}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="5" width="10" height="10" rx="1.5" />
            </svg>
          </button>
          <button
            type="button"
            className="fp-start"
            onClick={() => {
              unlockAudio();
              if (running) s.pause();
              else s.start();
            }}
          >
            {startLabel}
          </button>
          <button type="button" className="fp-dock-btn icon" onClick={() => s.skip()} title={t('focus.skip')} aria-label={t('focus.skip')}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 4.5l7 5.5-7 5.5zM15 4.5v11" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
