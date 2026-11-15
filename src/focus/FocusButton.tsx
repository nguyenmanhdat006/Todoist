import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useBoard } from '../store/board';
import { fmtClock, useFocus } from './store';

/** Nút "Chuyển sang Pomodoro" trên thanh điều hướng; đang chạy thì hiện số phút còn lại */
export function FocusButton() {
  const t = useT();
  const setView = useBoard((s) => s.setView);
  const status = useFocus((s) => s.status);
  const endsAt = useFocus((s) => s.endsAt);
  const remaining = useFocus((s) => s.remaining);
  const [now, setNow] = useState(() => Date.now());
  const running = status === 'running';

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const live = running ? fmtClock(Math.max(0, endsAt - now)) : status === 'paused' ? fmtClock(remaining) : null;

  return (
    <button type="button" className={`focus-nav${running ? ' is-running' : ''}`} onClick={() => setView('focus')} title={t('focus.switch')} aria-label={t('focus.switch')}>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 17.2a6.7 6.7 0 100-13.4 6.7 6.7 0 000 13.4zM10 6.8V10l2.2 1.6M8 1.8h4" />
      </svg>
      <span className="focus-nav-label">{live ?? t('nav.focus')}</span>
    </button>
  );
}
