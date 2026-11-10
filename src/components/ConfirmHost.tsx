import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { answerConfirm, useConfirm } from '../confirm';
import { useT } from '../i18n';

/** Hộp thoại xác nhận dùng chung; đặt một lần ở gốc app */
export function ConfirmHost() {
  const t = useT();
  const c = useConfirm((s) => s.current);

  useEffect(() => {
    if (!c) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        answerConfirm(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [c]);

  if (!c) return null;
  return createPortal(
    <div className="backdrop confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && answerConfirm(false)}>
      <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <div className="confirm-body">
          <span className={`confirm-icon${c.danger ? ' is-danger' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.2l7.2 12.6H2.8z" />
              <path d="M10 8.4v3.4M10 14.2v.1" />
            </svg>
          </span>
          <div className="confirm-text">
            <h2 id="confirm-title">{c.title ?? t('confirm.title')}</h2>
            <p id="confirm-msg">{c.message}</p>
          </div>
        </div>
        <footer className="confirm-foot">
          <button type="button" className="btn ghost" autoFocus={c.danger} onClick={() => answerConfirm(false)}>
            {t('modal.cancel')}
          </button>
          <button type="button" className={`btn ${c.danger ? 'danger-solid' : 'primary'}`} autoFocus={!c.danger} onClick={() => answerConfirm(true)}>
            {c.confirmLabel ?? t('confirm.ok')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
