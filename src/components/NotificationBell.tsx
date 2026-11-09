import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import '../notifications.css';
import type { Reminder } from '../types';
import { tagColor } from '../types';
import { useT, type T } from '../i18n';
import type { ToastData } from './Extras';
import { parseISO, timeRange, todayISO } from '../utils';

interface Props {
  onOpenTask: (id: string) => void;
  onToast: (t: Omit<ToastData, 'id'>) => void;
}

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

function startMs(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

/** "Bắt đầu sau 25 phút" / "Đã bắt đầu lúc 14:00" */
function relLabel(date: string, time: string, now: number, t: T) {
  const diff = Math.ceil((startMs(date, time) - now) / 60_000);
  if (diff > 0) {
    const n = diff < 60 ? t('time.min', { n: diff }) : t('time.hour', { n: new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(diff / 60) });
    return { text: t('notif.in', { n }), soon: true };
  }
  const day = date === todayISO() ? '' : new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short' }).format(parseISO(date)) + ' · ';
  return { text: day + t('notif.started', { time }), soon: false };
}

export function NotificationBell({ onOpenTask, onToast }: Props) {
  const t = useT();
  const reminders = useBoard((s) => s.reminders);
  const tasks = useBoard((s) => s.tasks);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => (canNotify() ? Notification.permission : 'unsupported'));
  const ref = useRef<HTMLDivElement>(null);
  const unread = reminders.filter((r) => !r.read && tasks[r.taskId]).length;

  // Báo ra ngoài: thông báo trên máy (nếu được phép) và thông báo nhỏ trong app
  const announce = useCallback(
    (list: Reminder[]) => {
      const tasks = useBoard.getState().tasks;
      for (const r of list) {
        const task = tasks[r.taskId];
        if (!task) continue;
        const time = timeRange(task);
        if (canNotify() && Notification.permission === 'granted') {
          try {
            const n = new Notification(task.title, { body: t('notif.push', { time }), tag: r.id, icon: '/icon.svg' });
            n.onclick = () => {
              window.focus();
              onOpenTask(task.id);
              n.close();
            };
          } catch {
            /* một số trình duyệt di động không cho tạo Notification trực tiếp */
          }
        }
      }
      const first = list.map((r) => tasks[r.taskId]).find(Boolean);
      if (first)
        onToast({
          message: t('notif.toast', { title: first.title, time: timeRange(first) }),
          actionLabel: t('notif.view'),
          onUndo: () => onOpenTask(first.id),
        });
    },
    [t, onOpenTask, onToast],
  );

  const announceRef = useRef(announce);
  announceRef.current = announce;

  // Kiểm tra mỗi 30 giây và mỗi khi dữ liệu việc thay đổi
  useEffect(() => {
    const check = () => {
      setNow(Date.now());
      const list = useBoard.getState().checkReminders();
      if (list.length) announceRef.current(list);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [tasks]);

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

  const toggle = () => {
    if (!open) setNow(Date.now());
    setOpen((v) => !v);
  };

  const askPermission = async () => {
    if (!canNotify()) return;
    try {
      setPerm(await Notification.requestPermission());
    } catch {
      setPerm(Notification.permission);
    }
  };

  const items = useMemo(
    () =>
      reminders.map((r) => {
        const task = tasks[r.taskId];
        return { r, task };
      }),
    [reminders, tasks],
  );

  return (
    <div className="settings notif" ref={ref}>
      <button
        type="button"
        className={`icon-btn notif-btn${unread ? ' has-unread' : ''}`}
        aria-label={unread ? `${t('notif.button')} (${unread})` : t('notif.button')}
        title={t('notif.title')}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 8.2a5 5 0 0 1 10 0c0 4.3 1.8 5.6 1.8 5.6H3.2S5 12.5 5 8.2z" />
          <path d="M8.3 16.6a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="popover notif-menu" role="dialog" aria-label={t('notif.title')}>
          <div className="notif-head">
            <span className="menu-label">
              {t('notif.title')}
              {unread > 0 && <span className="notif-count">{t('notif.unread', { n: unread })}</span>}
            </span>
            <span className="notif-actions">
              {items.length > 0 && (
                <button
                  type="button"
                  className="notif-link is-primary"
                  disabled={unread === 0}
                  onClick={() => useBoard.getState().markRemindersRead()}
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 8.5l3 3 6-7M7.5 11.5l1 0.2 6-7.2" />
                  </svg>
                  {t('notif.markAll')}
                </button>
              )}
              {items.length > 0 && (
                <button type="button" className="notif-link" onClick={() => useBoard.getState().clearReminders()}>
                  {t('notif.clear')}
                </button>
              )}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="notif-empty">{t('notif.empty')}</p>
          ) : (
            <ul className="notif-list">
              {items.map(({ r, task }) => {
                const [date, time] = r.at.split('T');
                const rel = task?.dueDate && task.startTime ? relLabel(task.dueDate, task.startTime, now, t) : relLabel(date, time, now, t);
                const color = task?.tags[0] ? tagColor(task.tags[0]) : 'var(--blue)';
                return (
                  <li key={r.id} className="notif-row">
                    <button
                      type="button"
                      className={`notif-item${r.read ? '' : ' is-new'}${rel.soon ? ' is-soon' : ''}`}
                      style={{ '--tag': color } as CSSProperties}
                      disabled={!task}
                      onClick={() => {
                        if (!task) return;
                        useBoard.getState().setReminderRead(r.id, true);
                        setOpen(false);
                        onOpenTask(task.id);
                      }}
                    >
                      <span className="notif-icon" aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                          <circle cx="8" cy="8" r="6" />
                          <path d="M8 4.8V8l2.2 1.4" />
                        </svg>
                      </span>
                      <span className="notif-body">
                        <span className="notif-task">{task ? task.title : t('notif.missing')}</span>
                        <span className="notif-meta">
                          <span className="notif-rel">{rel.text}</span>
                          {task && <span className="notif-time">{timeRange(task)}</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`notif-mark${r.read ? ' is-read' : ''}`}
                      title={r.read ? t('notif.markUnread') : t('notif.markRead')}
                      aria-label={`${r.read ? t('notif.markUnread') : t('notif.markRead')}: ${task?.title ?? ''}`}
                      onClick={() => useBoard.getState().setReminderRead(r.id, !r.read)}
                    >
                      <span className="notif-dot" aria-hidden="true" />
                      {r.read ? (
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                          <rect x="2" y="3.5" width="12" height="9" rx="1.8" />
                          <path d="M2.5 4.5 8 9l5.5-4.5" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="menu-sep" />
          <div className="notif-foot">
            {perm === 'granted' ? (
              <span className="notif-perm is-on">{t('notif.desktopOn')}</span>
            ) : perm === 'denied' ? (
              <span className="notif-perm">{t('notif.desktopBlocked')}</span>
            ) : perm === 'default' ? (
              <button type="button" className="btn ghost sm" onClick={askPermission}>
                {t('notif.desktop')}
              </button>
            ) : null}
            <span className="notif-hint">{t('notif.desktopHint')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
