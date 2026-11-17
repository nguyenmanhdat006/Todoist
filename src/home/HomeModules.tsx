/** Trang chủ: chọn phân hệ Quản lý công việc hoặc Pomodoro */
import { useBoard } from '../store/board';
import { useT } from '../i18n';
import { useFocus } from '../focus/store';
import { fmtMinutes } from '../focus/store';
import { toISODate } from '../utils';
import { HomeStats } from './HomeStats';

export function HomeModules({ open, overdue }: { open: number; overdue: number }) {
  const t = useT();
  const setView = useBoard((s) => s.setView);
  const today = useFocus((s) => s.days[toISODate(new Date())]);
  return (
    <div className="home">
      <h2 className="home-title">{t('home.pick')}</h2>
      <div className="home-grid">
        <button type="button" className="home-card is-tasks" onClick={() => setView('summary')}>
          <span className="home-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3.5" width="16" height="17" rx="3" />
              <path d="M8 9.5l1.6 1.6L12.5 8M8 15.5l1.6 1.6 2.9-3.1M15 10h2.5M15 16h2.5" />
            </svg>
          </span>
          <span className="home-name">{t('home.tasks.title')}</span>
          <span className="home-desc">{t('home.tasks.desc')}</span>
          <span className="home-meta">{t('home.tasks.meta', { open, overdue })}</span>
          <span className="home-go">
            {t('home.open')}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </button>
        <button type="button" className="home-card is-focus" onClick={() => setView('focus')}>
          <span className="home-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="13.5" r="7.5" />
              <path d="M12 9.5v4l2.6 1.6M9.5 3h5M18.8 6.2l1.2-1.2" />
            </svg>
          </span>
          <span className="home-name">{t('home.focus.title')}</span>
          <span className="home-desc">{t('home.focus.desc')}</span>
          <span className="home-meta">{t('home.focus.meta', { time: fmtMinutes(today ? today.ms : 0), n: today?.sessions ?? 0 })}</span>
          <span className="home-go">
            {t('home.open')}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </button>
      </div>
      <HomeStats />
    </div>
  );
}
