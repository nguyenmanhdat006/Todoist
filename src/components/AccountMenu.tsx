import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { askConfirm } from '../confirm';
import { logout, useSession } from '../sync/session';
import { LangSwitch, ThemeSwitch } from './TopbarWidgets';
import { AdminDialog, ProfileDialog, RoleBadge } from './Profile';
import '../auth.css';

/** Nút tài khoản trên thanh trên cùng: trạng thái lưu, đồng bộ, đăng xuất */
export function AccountMenu() {
  const t = useT();
  const user = useSession((s) => s.user);
  const sync = useSession((s) => s.sync);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'profile' | 'admin' | null>(null);
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
              <strong>{user.name || user.email.split('@')[0]}</strong>
              <span className="account-mail" title={user.email}>
                {user.email}
              </span>
              <RoleBadge role={user.role} />
            </span>
          </div>
          {/* Màn hình hẹp: ngôn ngữ và giao diện nằm trong menu này thay vì trên thanh trên cùng */}
          <div className="account-prefs">
            <LangSwitch />
            <ThemeSwitch />
          </div>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item with-icon"
            onClick={() => {
              setDialog('profile');
              setOpen(false);
            }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="7" r="3.2" />
              <path d="M3.8 16.5c.7-3 3-4.6 6.2-4.6s5.5 1.6 6.2 4.6" />
            </svg>
            {t('profile.menu')}
          </button>
          {user.role === 'admin' && (
            <button
              type="button"
              className="menu-item with-icon"
              onClick={() => {
                setDialog('admin');
                setOpen(false);
              }}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2.5l6 2.3v4.4c0 3.6-2.5 6.3-6 8-3.5-1.7-6-4.4-6-8V4.8z" />
                <path d="M7.4 10l1.9 1.9 3.4-3.7" />
              </svg>
              {t('admin.menu')}
            </button>
          )}
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item with-icon is-signout"
            onClick={async () => {
              const ok = await logout(() => askConfirm({ message: t('sync.logoutConfirm'), confirmLabel: t('sync.logout'), danger: true }));
              if (ok) setOpen(false);
            }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3.5H4.5v13H8M12.5 6.5L16 10l-3.5 3.5M16 10H8" />
            </svg>
            {t('sync.logout')}
          </button>
        </div>
      )}
      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog === 'admin' && <AdminDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
