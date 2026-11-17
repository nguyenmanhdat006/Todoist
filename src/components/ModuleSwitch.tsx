/** Nút đổi phân hệ trên thanh trên cùng: Trang chủ, Quản lý công việc, Pomodoro (đang chạy thì hiện thời gian còn lại) */
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { fmtClock, useFocus } from '../focus/store';
import { useBoard } from '../store/board';
import type { ViewMode } from '../types';
import { usePopover } from './Social';

type Mod = 'home' | 'tasks' | 'focus';

const ICON: Record<Mod, React.ReactNode> = {
  home: <path d="M3.5 9.2L10 3.8l6.5 5.4V16h-4.2v-4.4H7.7V16H3.5z" />,
  tasks: <path d="M4 3.5h12v13H4zM7.2 8.2l1.4 1.4 2.6-2.8M7.2 13l1.4 1.4 2.6-2.8M13 8h1M13 13h1" />,
  focus: <path d="M10 17.2a6.7 6.7 0 100-13.4 6.7 6.7 0 000 13.4zM10 6.8V10l2.2 1.6M8 1.8h4" />,
};

const Icon = ({ m, size = 16 }: { m: Mod; size?: number }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON[m]}
  </svg>
);

export function ModuleSwitch() {
  const t = useT();
  const view = useBoard((s) => s.view);
  const setView = useBoard((s) => s.setView);
  const status = useFocus((s) => s.status);
  const endsAt = useFocus((s) => s.endsAt);
  const remaining = useFocus((s) => s.remaining);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = usePopover(open, () => setOpen(false));
  const running = status === 'running';

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const live = running ? fmtClock(Math.max(0, endsAt - now)) : status === 'paused' ? fmtClock(remaining) : null;
  const current: Mod = view === 'home' ? 'home' : view === 'focus' ? 'focus' : 'tasks';
  const target: Record<Mod, ViewMode> = { home: 'home', tasks: 'summary', focus: 'focus' };
  const label: Record<Mod, string> = { home: t('nav.home'), tasks: t('home.tasks.title'), focus: t('nav.focus') };
  const go = (m: Mod) => {
    setOpen(false);
    if (m !== current) setView(target[m]);
  };

  return (
    <div className="scope-dd mod-dd" ref={ref}>
      <button
        type="button"
        className={`focus-nav mod-trigger${running ? ' is-running' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('module.switch')}
        aria-label={t('module.switch')}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z" />
        </svg>
        <span className="focus-nav-label">{current === 'focus' && live ? live : label[current]}</span>
        <svg className="scope-caret" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="scope-panel mod-panel" role="menu" aria-label={t('module.switch')}>
          {(['home', 'tasks', 'focus'] as Mod[]).map((m) => (
            <button key={m} type="button" role="menuitem" className={`scope-opt${m === current ? ' on' : ''}`} onClick={() => go(m)}>
              <span className="scope-ico">
                <Icon m={m} size={18} />
              </span>
              <span className="mod-name">{label[m]}</span>
              {m === 'focus' && live && <span className="mod-live">{live}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
