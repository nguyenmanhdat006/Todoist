import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../store/board';
import { parseImport, type ImportResult, type Issue } from '../data/exchange';
import { downloadExport } from '../data/download';
import { useT } from '../i18n';

export interface ToastData {
  id: number;
  message: string;
  onUndo?: () => void;
  /** Chữ trên nút hành động; mặc định là Hoàn tác */
  actionLabel?: string;
}

export function SettingsMenu({ onToast }: { onToast: (t: Omit<ToastData, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Kết quả kiểm tra file đang chờ xác nhận nhập */
  const [pending, setPending] = useState<{ name: string; result: ImportResult } | null>(null);

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

  useEffect(() => {
    if (!open) {
      setConfirmClear(false);
      setPending(null);
    }
  }, [open]);

  const exportJson = () => {
    const { name, tasks } = downloadExport();
    onToast({ message: t('data.exported', { tasks, name }) });
    setOpen(false);
  };

  // Bước 1: đọc và kiểm tra file, hiện tóm tắt để người dùng xác nhận
  const checkFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setPending({ name: file.name, result: { ok: false, errors: [{ key: 'toast.unreadable' }] } });
      return;
    }
    setPending({ name: file.name, result: parseImport(raw) });
  };

  // Bước 2: thay dữ liệu, cho phép hoàn tác
  const confirmImport = () => {
    if (!pending?.result.ok) return;
    const s = useBoard.getState();
    const prev = s.snapshot();
    s.applyImport(pending.result.data);
    onToast({ message: t('toast.imported', { name: pending.name }), onUndo: () => useBoard.getState().restore(prev) });
    setPending(null);
    setOpen(false);
  };

  const say = (i: Issue) => t(i.key, i.vars);
  const MAX_SHOWN = 5;

  return (
    <div className="settings" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('data.button')}
        title={t('data.button')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <ellipse cx="8" cy="3.5" rx="5.5" ry="2" />
          <path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
        </svg>
      </button>
      {open && (
        <div className="popover settings-menu">
          <div className="menu-label">{t('data.heading')}</div>
          <button type="button" className="menu-item" onClick={exportJson}>
            {t('data.export')}
          </button>
          <button type="button" className="menu-item" onClick={() => fileRef.current?.click()}>
            {t('data.import')}
          </button>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) checkFile(f);
              e.target.value = '';
            }}
          />
          {pending &&
            (pending.result.ok ? (
              <div className="import-check" role="status">
                <div className="import-title">{t('data.checkTitle')}</div>
                <div className="import-file">{pending.name}</div>
                <div className="import-meta">
                  {pending.result.exportedAt
                    ? t('data.exportedAt', {
                        date: new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                          new Date(pending.result.exportedAt),
                        ),
                      })
                    : t('data.oldFormat')}
                </div>
                <div className="import-counts">{t('data.counts', pending.result.counts)}</div>
                {pending.result.warnings.length > 0 && (
                  <div className="import-warn">
                    <span>{t('data.warnings', { n: pending.result.warnings.length })}</span>
                    <ul>
                      {pending.result.warnings.slice(0, MAX_SHOWN).map((w, i) => (
                        <li key={i}>{say(w)}</li>
                      ))}
                    </ul>
                    {pending.result.warnings.length > MAX_SHOWN && (
                      <span>{t('data.more', { n: pending.result.warnings.length - MAX_SHOWN })}</span>
                    )}
                  </div>
                )}
                <p className="import-note">{t('data.replaceNote')}</p>
                <div className="confirm-actions">
                  <button type="button" className="btn ghost sm" onClick={() => setPending(null)}>
                    {t('data.importNo')}
                  </button>
                  <button type="button" className="btn primary sm" onClick={confirmImport}>
                    {t('data.importYes')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="import-check is-error" role="alert">
                <div className="import-title">{t('data.importError', { name: pending.name })}</div>
                <ul>
                  {pending.result.errors.map((e, i) => (
                    <li key={i}>{say(e)}</li>
                  ))}
                </ul>
                <div className="confirm-actions">
                  <button type="button" className="btn ghost sm" onClick={() => setPending(null)}>
                    {t('data.close')}
                  </button>
                </div>
              </div>
            ))}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              const prev = useBoard.getState().snapshot();
              useBoard.getState().loadDemo();
              onToast({ message: t('toast.demo'), onUndo: () => useBoard.getState().restore(prev) });
              setOpen(false);
            }}
          >
            {t('data.demo')}
          </button>
          {confirmClear ? (
            <div className="confirm">
              <span>{t('data.clearConfirm')}</span>
              <div className="confirm-actions">
                <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>
                  {t('data.clearNo')}
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => {
                    const prev = useBoard.getState().snapshot();
                    useBoard.getState().clearAll();
                    onToast({ message: t('toast.cleared'), onUndo: () => useBoard.getState().restore(prev) });
                    setOpen(false);
                  }}
                >
                  {t('data.clearYes')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="menu-item danger" onClick={() => setConfirmClear(true)}>
              {t('data.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
