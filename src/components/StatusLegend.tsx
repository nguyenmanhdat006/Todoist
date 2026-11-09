import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import { STATUS_COLORS, STATUS_ORDER } from '../utils';

/** Chú thích màu trạng thái của việc */
export function StatusLegend() {
  const t = useT();
  return (
    <div className="status-legend" aria-label={t('status.legend')}>
      {STATUS_ORDER.map((s) => (
        <span key={s} style={{ '--st': STATUS_COLORS[s] } as CSSProperties}>
          <i aria-hidden="true" />
          {t(`status.${s}`)}
        </span>
      ))}
    </div>
  );
}
