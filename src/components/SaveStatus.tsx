/** Trạng thái lưu kiểu Google Drive: Đang lưu… → Đã lưu và sao lưu (bấm để mở tab Sao lưu) */
import { useT, type TKey } from '../i18n';
import { useBoard } from '../store/board';
import { useSession } from '../sync/session';

const SPIN = (
  <svg className="save-spin" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <path d="M8 2a6 6 0 105.7 4.1" />
  </svg>
);
const CLOUD_OK = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.6 12.4h6.8a2.8 2.8 0 00.4-5.6 3.9 3.9 0 00-7.5.9 2.4 2.4 0 00.3 4.7zM6.2 8.7l1.5 1.5 2.6-2.8" />
  </svg>
);
const WARN = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2.2L14.4 13.4H1.6zM8 6.6v3M8 11.6v.1" />
  </svg>
);

export function SaveStatus() {
  const t = useT();
  const sync = useSession((s) => s.sync);
  const backup = useSession((s) => s.backup);
  const switching = useSession((s) => s.switching);
  const setView = useBoard((s) => s.setView);

  let tone = 'ok';
  let icon = CLOUD_OK;
  let key: TKey = 'save.done';
  if (sync === 'offline') {
    tone = 'warn';
    icon = WARN;
    key = 'sync.offline';
  } else if (sync === 'error') {
    tone = 'bad';
    icon = WARN;
    key = 'sync.error';
  } else if (sync === 'saving' || sync === 'pending' || switching) {
    tone = 'busy';
    icon = SPIN;
    key = 'sync.saving';
  } else if (backup === 'pending') {
    tone = 'busy';
    icon = SPIN;
    key = 'save.backing';
  } else if (backup === 'flagged') {
    tone = 'warn';
    icon = WARN;
    key = 'save.flagged';
  }

  return (
    <button type="button" className={`save-status is-${tone}`} onClick={() => setView('backup')} title={t('save.open')} aria-live="polite">
      {icon}
      <span>{t(key)}</span>
    </button>
  );
}
