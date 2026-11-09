import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export interface TimeOption {
  value: string;
  /** Chữ phụ bên phải, ví dụ thời lượng "1 giờ" */
  hint?: string;
}

interface Props {
  id: string;
  label: string;
  value: string;
  options: TimeOption[];
  disabled?: boolean;
  onChange: (v: string) => void;
}

const LIST_MAX = 264;

/** Ô chọn giờ 24h: nút hiển thị giờ + danh sách thả xuống tự vẽ (thay cho <select> mặc định của trình duyệt) */
export function TimeSelect({ id, label, value, options, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 8;
    const up = below < 180 && r.top > below;
    setPos({
      left: r.left,
      minWidth: r.width,
      maxHeight: Math.min(LIST_MAX, (up ? r.top : below) - 8),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  };

  const openList = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  // Giữ mục đang chọn ở giữa danh sách khi mở
  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    const list = listRef.current;
    if (el && list) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!listRef.current?.contains(target) && !btnRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const scrollIntoView = (i: number) => {
    const el = listRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const move = (i: number) => {
      const n = Math.max(0, Math.min(options.length - 1, i));
      setActive(n);
      scrollIntoView(n);
    };
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'PageDown') move(active + 6);
    else if (e.key === 'PageUp') move(active - 6);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') options[active] && pick(options[active].value);
    else if (e.key === 'Escape') {
      // Chỉ đóng danh sách, không đóng cả hộp thoại
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`time-select${open ? ' is-open' : ''}`}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8V8l2.2 1.4" />
        </svg>
        <span className="time-select-value">{value}</span>
        {current?.hint && <span className="time-select-hint">{current.hint}</span>}
        <svg className="time-select-caret" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul ref={listRef} id={`${id}-list`} className="time-list" role="listbox" aria-label={label} style={pos}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`time-opt${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}${o.value.endsWith(':00') ? ' is-hour' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
            >
              <span className="time-opt-value">{o.value}</span>
              {o.hint && <span className="time-opt-hint">{o.hint}</span>}
              <svg className="time-opt-check" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
