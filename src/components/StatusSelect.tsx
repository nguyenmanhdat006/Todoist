import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Column } from '../types';

interface Props {
  id: string;
  label: string;
  columns: Column[];
  value: string;
  onChange: (id: string) => void;
}

const color = (c: Column | undefined) => ({ '--c': c?.color ?? 'var(--blue)' }) as CSSProperties;

/** Chọn giai đoạn (cột): nút hiện giai đoạn hiện tại, danh sách thả xuống là các nhãn màu theo cột (thay cho <select> mặc định) */
export function StatusSelect({ id, label, columns, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = columns.find((c) => c.id === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const up = below < 200 && r.top > below;
    setPos({
      left: r.left,
      width: r.width,
      maxHeight: Math.max(140, Math.min(340, (up ? r.top : below) - 8)),
      ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  };

  const openList = () => {
    place();
    setActive(Math.max(0, columns.findIndex((c) => c.id === value)));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
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

  const pick = (cid: string) => {
    onChange(cid);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const move = (i: number) => {
      const n = Math.max(0, Math.min(columns.length - 1, i));
      setActive(n);
      (listRef.current?.children[n] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') move(active + 1);
    else if (e.key === 'ArrowUp') move(active - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(columns.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') columns[active] && pick(columns[active].id);
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
        className={`tm-status${open ? ' is-open' : ''}`}
        style={color(current)}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className="tm-status-name">{current?.title ?? '—'}</span>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="tm-status-caret">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        // Vẽ ra body: hộp thoại có backdrop-filter nên làm lệch và cắt phần tử position: fixed nằm bên trong
        createPortal(
          <ul ref={listRef} id={`${id}-list`} className="status-list" role="listbox" aria-label={label} style={pos}>
            {columns.map((c, i) => (
              <li
                key={c.id}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={c.id === value}
                className={`status-opt${i === active ? ' is-active' : ''}${c.id === value ? ' is-selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c.id)}
              >
                <span className="status-lozenge" style={color(c)}>
                  {c.title}
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
