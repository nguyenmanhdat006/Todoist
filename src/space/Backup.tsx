/**
 * Tab Sao lưu: mỗi bảng của dự án có đúng MỘT file sao lưu, tự ghi đè khi dữ liệu đổi
 * (sau khi sửa vài phút, khi đóng tab, và theo lịch hằng ngày). Tải về hoặc khôi phục ngay tại đây.
 */
import { useCallback, useEffect, useState } from 'react';
import { askConfirm } from '../confirm';
import { parseImport } from '../data/exchange';
import { useT, type TKey } from '../i18n';
import { useBoard } from '../store/board';
import { api, ApiError, type BackupRow } from '../sync/api';
import { projectOfBoard, usePeople } from '../sync/people';
import { markBackedUp, push, useSession } from '../sync/session';
import { showToast, toast } from '../toast';

const REASON: Record<string, TKey> = {
  auto: 'backup.reason.auto',
  close: 'backup.reason.close',
  manual: 'backup.reason.manual',
};

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupView() {
  const t = useT();
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  const projects = usePeople((s) => s.projects);
  const active = board ?? me?.id ?? '';
  const project = projectOfBoard(active || null, projects);
  const pid = project?.id ?? null;
  const [rows, setRows] = useState<BackupRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!pid) return;
    try {
      const { backups } = await api.projectBackups(pid);
      setRows(backups);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [pid]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const fmt = (iso: string) => new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  const backupNow = async (boardId: string, force = false) => {
    setBusy(boardId);
    try {
      // Bảng đang mở có thay đổi chưa lưu thì chờ lưu xong để file sao lưu là bản mới nhất
      if (boardId === active) await push();
      const r = await api.backupNow(boardId === me?.id ? null : boardId, 'manual', force);
      if (r.status === 'flagged') showToast(t('backup.flaggedToast'), { kind: 'error' });
      else if (r.status === 'unchanged') {
        toast.info('backup.unchanged');
        markBackedUp(boardId === me?.id ? null : boardId);
      }
      else {
        toast.success('backup.saved');
        markBackedUp(boardId === me?.id ? null : boardId);
      }
      await load();
    } catch (e) {
      showToast(t(e instanceof ApiError && e.offline ? 'err.network' : 'err.server_error'), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const overwrite = async (r: BackupRow) => {
    const ok = await askConfirm({ message: t('backup.overwriteConfirm', { name: r.fileName }), danger: true });
    if (ok) await backupNow(r.boardId, true);
  };

  const restore = async (r: BackupRow) => {
    const ok = await askConfirm({ message: t('backup.restoreConfirm', { name: r.fileName }), danger: true, confirmLabel: t('backup.restore') });
    if (!ok) return;
    setBusy(r.boardId);
    try {
      const file = await api.backupFile(r.boardId === me?.id ? null : r.boardId);
      const parsed = parseImport(file);
      if (!parsed.ok) throw new Error('bad');
      const st = useBoard.getState();
      const prev = st.snapshot();
      st.applyImport(parsed.data, true);
      showToast(t('backup.restored'), { onAction: () => useBoard.getState().restore(prev) });
    } catch {
      showToast(t('backup.restoreFailed'), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="lk bk">
      <div className="lk-head">
        <div>
          <h2>{t('space.tab.backup')}</h2>
          <p>{t('backup.desc')}</p>
        </div>
      </div>

      {failed && <p className="lk-note is-error">{t('backup.loadFailed')}</p>}

      {rows === null && !failed ? (
        <p className="sp-empty">{t('space.loading')}</p>
      ) : (
        <ul className="bk-list">
          {(rows ?? []).map((r) => {
            const mine = r.boardId === active;
            const base = busy === r.boardId;
            return (
              <li key={r.boardId} className={`bk-card${r.flagged ? ' is-flagged' : ''}${mine ? ' is-active' : ''}`}>
                <div className="bk-main">
                  <span className="bk-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h4" />
                    </svg>
                  </span>
                  <div className="bk-text">
                    <b>{r.fileName}</b>
                    <small>
                      {t('backup.board', { name: r.name })}
                      {mine && <span className="bk-tag">{t('backup.current')}</span>}
                    </small>
                    {r.hasBackup && r.updatedAt ? (
                      <small>
                        {t('backup.updated', { time: fmt(r.updatedAt) })} · {t('backup.tasks', { n: r.taskCount ?? 0 })} · {size(r.sizeBytes ?? 0)} · {t(REASON[r.reason ?? 'auto'] ?? 'backup.reason.auto')}
                      </small>
                    ) : (
                      <small>{t('backup.none')}</small>
                    )}
                  </div>
                  <div className="bk-actions">
                    {r.hasBackup && (
                      <a className="btn ghost sm" href={api.backupDownloadUrl(r.boardId === me?.id ? null : r.boardId)} download>
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 2.5v8M4.8 7.6L8 10.8l3.2-3.2M3 13h10" />
                        </svg>
                        {t('backup.download')}
                      </a>
                    )}
                    <button type="button" className="btn primary sm" disabled={base} onClick={() => void backupNow(r.boardId)}>
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 12.5h6.8a2.8 2.8 0 00.4-5.6 3.9 3.9 0 00-7.5.9 2.4 2.4 0 00.3 4.7zM8 6.5v4M6.3 9l1.7 1.7L9.7 9" />
                      </svg>
                      {t('backup.now')}
                    </button>
                    {r.hasBackup && (
                      <button type="button" className="btn ghost sm" disabled={base || !mine} title={mine ? undefined : t('backup.openToRestore')} onClick={() => void restore(r)}>
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 8a5 5 0 105-5H5.5M5.5 1.2L3.2 3.5 5.5 5.8" />
                        </svg>
                        {t('backup.restore')}
                      </button>
                    )}
                  </div>
                </div>
                {r.flagged && (
                  <div className="bk-warn" role="alert">
                    <span>{t('backup.flagged', { n: r.flaggedTasks ?? 0, m: r.taskCount ?? 0 })}</span>
                    <button type="button" className="btn sm danger-ghost" disabled={base} onClick={() => void overwrite(r)}>
                      {t('backup.overwrite')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
