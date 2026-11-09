import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { logout, syncNow, useSession } from '../sync/session';
import { LangSwitch, ThemeSwitch } from './TopbarWidgets';
import '../auth.css';

/** Nút tài khoản trên thanh trên cùng: trạng thái lưu, đồng bộ, đăng xuất */
export function AccountMenu() {
  const t = useT();
  const user = useSession((s) => s.user);
  const sync = useSession((s) => s.sync);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const label = user.name || user.email;
  const initial = (label.trim()[0] ?? '?').toUpperCase();
  const status = t(`sync.${sync}`);

  return (
    <div className="settings account" ref={ref}>
      <button
        type="button"
        className={`icon-btn account-btn sync-${sync}`}
        aria-label={`${t('sync.account')}: ${label}. ${status}`}
        title={`${label} · ${status}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-initial">{initial}</span>
        <span className="sync-dot" aria-hidden="true" />
      </button>
      {open && (
        <div className="popover account-menu">
          <div className="account-head">
            <span className="account-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="account-id">
              {user.name && <strong>{user.name}</strong>}
              <span>{user.email}</span>
            </span>
          </div>
          <div className={`account-status sync-${sync}`} role="status">
            <span className="sync-dot" aria-hidden="true" />
            {status}
          </div>
          {/* Màn hình hẹp: ngôn ngữ và giao diện nằm trong menu này thay vì trên thanh trên cùng */}
          <div className="account-prefs">
            <LangSwitch />
            <ThemeSwitch />
          </div>
          <div className="menu-sep" />
          <button type="button" className="menu-item" disabled={sync === 'saving'} onClick={() => void syncNow()}>
            {t('sync.now')}
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={async () => {
              const ok = await logout(() => window.confirm(t('sync.logoutConfirm')));
              if (ok) setOpen(false);
            }}
          >
            {t('sync.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
