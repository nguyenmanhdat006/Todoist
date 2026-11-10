import { createPortal } from 'react-dom';
import { dismissToast, useToasts, type ToastKind } from '../toast';
import { useT } from '../i18n';

const ICONS: Record<ToastKind, JSX.Element> = {
  success: <path d="M4 10.5l4 4 8-9" />,
  error: <path d="M10 5v6M10 14.2v.3" />,
  info: <path d="M10 9v5M10 5.8v.3" />,
};

export function ToastHost() {
  const t = useT();
  const items = useToasts((s) => s.items);
  return createPortal(
    <div className="toasts" role="region" aria-label={t('toast.region')} aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`toast toast-${x.kind}${x.leaving ? ' is-leaving' : ''}`} role={x.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[x.kind]}
            </svg>
          </span>
          <span className="toast-msg">{x.message}</span>
          {x.onAction && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                x.onAction?.();
                dismissToast(x.id);
              }}
            >
              {x.actionLabel ?? t('toast.undo')}
            </button>
          )}
          <button type="button" className="toast-x" aria-label={t('toast.close')} onClick={() => dismissToast(x.id)}>
            ×
          </button>
          <span className="toast-bar" style={{ animationDuration: `${x.duration}ms` }} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
