import { useEffect, useRef, useState } from 'react';
import { useBoard } from '../store/board';
import type { ThemeMode } from '../types';

/** Vòng tiến độ: % việc đã hoàn thành */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <div className="progress-pill" title={`${done}/${total} việc đã xong`} aria-label={`Đã xong ${pct}%`}>
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--blue)" />
            <stop offset="100%" stopColor="var(--orange)" />
          </linearGradient>
        </defs>
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <span>{pct}%</span>
    </div>
  );
}

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: JSX.Element }[] = [
  {
    id: 'light',
    label: 'Sáng',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Tối',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
      </svg>
    ),
  },
  {
    id: 'system',
    label: 'Theo hệ thống',
    icon: (
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <rect x="2" y="2.5" width="12" height="8.5" rx="1.2" />
        <path d="M6 14h4M8 11v3" />
      </svg>
    ),
  },
];

export function ThemeSwitch() {
  const theme = useBoard((s) => s.theme);
  const setTheme = useBoard((s) => s.setTheme);
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Giao diện">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          aria-label={o.label}
          title={o.label}
          className={theme === o.id ? 'on' : ''}
          onClick={() => setTheme(o.id)}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['N', 'Thêm việc mới'],
  ['/', 'Tìm kiếm'],
  ['Esc', 'Đóng hộp thoại, xoá ô tìm'],
  ['Ctrl + Enter', 'Lưu trong hộp thoại'],
  ['Space', 'Nhấc / thả thẻ bằng bàn phím'],
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div className="settings" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Phím tắt và hướng dẫn"
        title="Phím tắt"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className="popover help-menu">
          <div className="menu-label">Phím tắt</div>
          <dl className="shortcuts">
            {SHORTCUTS.map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="menu-sep" />
          <p className="help-note">Dữ liệu chỉ lưu trong trình duyệt này. Hãy xuất file JSON thỉnh thoảng để sao lưu.</p>
        </div>
      )}
    </div>
  );
}
