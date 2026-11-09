import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../store/board';
import { todayISO } from '../utils';
import { useT } from '../i18n';

export interface ToastData {
  id: number;
  message: string;
  onUndo?: () => void;
}

export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            toast.onUndo?.();
            onClose();
          }}
        >
          {t('toast.undo')}
        </button>
      )}
    </div>
  );
}

export function SettingsMenu({ onToast }: { onToast: (t: Omit<ToastData, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!open) setConfirmClear(false);
  }, [open]);

  const exportJson = () => {
    const { columns, tasks } = useBoard.getState();
    const blob = new Blob([JSON.stringify({ app: 'kanban-todo', version: 1, columns, tasks }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanban-todo-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const importJson = async (file: File) => {
    const s = useBoard.getState();
    const prev = s.snapshot();
    try {
      const ok = s.importData(JSON.parse(await file.text()));
      onToast(
        ok
          ? { message: t('toast.imported', { name: file.name }), onUndo: () => useBoard.getState().restore(prev) }
          : { message: t('toast.badFormat') },
      );
    } catch {
      onToast({ message: t('toast.unreadable') });
    }
    setOpen(false);
  };

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
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
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
