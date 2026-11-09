import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../store/board';
import { todayISO } from '../utils';

export interface ToastData {
  id: number;
  message: string;
  onUndo?: () => void;
}

export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
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
          Hoàn tác
        </button>
      )}
    </div>
  );
}

export function SettingsMenu({ onToast }: { onToast: (t: Omit<ToastData, 'id'>) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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
          ? { message: `Đã nhập dữ liệu từ ${file.name}.`, onUndo: () => useBoard.getState().restore(prev) }
          : { message: 'File không đúng định dạng của app.' },
      );
    } catch {
      onToast({ message: 'Không đọc được file. Hãy chọn file .json đã xuất từ app.' });
    }
    setOpen(false);
  };

  return (
    <div className="settings" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Dữ liệu và sao lưu"
        title="Dữ liệu và sao lưu"
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
          <div className="menu-label">Dữ liệu (lưu trong trình duyệt này)</div>
          <button type="button" className="menu-item" onClick={exportJson}>
            Xuất file JSON để sao lưu
          </button>
          <button type="button" className="menu-item" onClick={() => fileRef.current?.click()}>
            Nhập từ file JSON
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
              onToast({ message: 'Đã nạp dữ liệu mẫu.', onUndo: () => useBoard.getState().restore(prev) });
              setOpen(false);
            }}
          >
            Nạp dữ liệu mẫu
          </button>
          {confirmClear ? (
            <div className="confirm">
              <span>Xoá hết mọi việc? Các cột vẫn được giữ.</span>
              <div className="confirm-actions">
                <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>
                  Không
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => {
                    const prev = useBoard.getState().snapshot();
                    useBoard.getState().clearAll();
                    onToast({ message: 'Đã xoá toàn bộ công việc.', onUndo: () => useBoard.getState().restore(prev) });
                    setOpen(false);
                  }}
                >
                  Xoá hết
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="menu-item danger" onClick={() => setConfirmClear(true)}>
              Xoá toàn bộ công việc…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
