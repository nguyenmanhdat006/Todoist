/**
 * Tab Dòng thời gian: mỗi việc một thanh từ ngày tạo đến hạn chót (hoặc ngày hoàn thành),
 * có vạch "hôm nay", thu phóng theo Tuần / Tháng / Quý và ô nhập nhanh việc mới.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { firstOpenColumn, useBoard } from '../store/board';
import { useScopedEntries, type Entry } from '../sync/overview';
import { useSession } from '../sync/session';
import { useT } from '../i18n';
import { ticketLabel, toISODate, parseISO, todayISO } from '../utils';
import type { Task } from '../types';

const DAY = 86_400_000;
const NAME_W = 300;
const ZOOMS = { weeks: 30, months: 9, quarters: 3.2 } as const;
type Zoom = keyof typeof ZOOMS;

const dayIndex = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

interface Bar {
  e: Entry;
  start: number;
  end: number;
  open: boolean;
}

function span(task: Task, done: boolean): { start: number; end: number; open: boolean } {
  const created = dayIndex(new Date(task.createdAt));
  const due = task.dueDate ? dayIndex(parseISO(task.dueDate)) : null;
  const fin = done && task.completedAt ? dayIndex(new Date(task.completedAt)) : null;
  const end = due ?? fin ?? created;
  const start = Math.min(created, end);
  return { start, end: Math.max(end, start), open: due === null };
}

export function Timeline({
  matches,
  onOpenTask,
}: {
  matches: (t: Task, done?: boolean, colId?: string) => boolean;
  onOpenTask: (id: string, boardId?: string) => void;
}) {
  const t = useT();
  const entries = useScopedEntries();
  const [zoom, setZoom] = useState<Zoom>('months');
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const px = ZOOMS[zoom];
  const today = dayIndex(new Date());

  const bars = useMemo(() => {
    const out: Bar[] = [];
    for (const e of entries) if (matches(e.task, e.col.isDone, e.col.id)) out.push({ e, ...span(e.task, e.col.isDone) });
    return out.sort((a, b) => a.start - b.start || a.end - b.end || a.e.task.title.localeCompare(b.e.task.title, t.locale));
  }, [entries, matches, t.locale]);

  // Phạm vi thời gian: ôm trọn mọi thanh, tối thiểu từ 1 tháng trước đến 5 tháng sau hôm nay
  const range = useMemo(() => {
    let lo = today - 35;
    let hi = today + 150;
    for (const b of bars) {
      lo = Math.min(lo, b.start - 7);
      hi = Math.max(hi, b.end + 14);
    }
    const first = new Date(lo * DAY);
    const from = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / DAY;
    const last = new Date(hi * DAY);
    const to = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1) / DAY;
    return { from, to };
  }, [bars, today]);

  const days = range.to - range.from;
  const width = Math.round(days * px);
  const x = (day: number) => (day - range.from) * px;

  // Dải tháng và dải phụ (ngày hoặc tháng / quý)
  const head = useMemo(() => {
    const fmt = (opts: Intl.DateTimeFormatOptions, day: number) => new Intl.DateTimeFormat(t.locale, { ...opts, timeZone: 'UTC' }).format(new Date(day * DAY));
    const months: { at: number; days: number; label: string }[] = [];
    for (let d = range.from; d < range.to; ) {
      const dt = new Date(d * DAY);
      const next = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / DAY;
      months.push({ at: d, days: next - d, label: fmt({ month: 'long', year: dt.getUTCMonth() === 0 || d === range.from ? 'numeric' : undefined }, d) });
      d = next;
    }
    let top = months;
    let sub: { at: number; days: number; label: string }[] = [];
    if (zoom === 'quarters') {
      top = [];
      for (const m of months) {
        const dt = new Date(m.at * DAY);
        const q = Math.floor(dt.getUTCMonth() / 3) + 1;
        const label = `Q${q} ${dt.getUTCFullYear()}`;
        const last = top[top.length - 1];
        if (last && last.label === label) last.days += m.days;
        else top.push({ at: m.at, days: m.days, label });
      }
      sub = months.map((m) => ({ ...m, label: fmt({ month: 'short' }, m.at) }));
    } else if (zoom === 'weeks') {
      for (let d = range.from; d < range.to; d++) sub.push({ at: d, days: 1, label: String(new Date(d * DAY).getUTCDate()) });
    }
    return { top, sub, months };
  }, [range, zoom, t.locale]);

  // Cuộn tới "hôm nay" khi mở và khi đổi mức thu phóng
  const goToday = (smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    const view = el.clientWidth - NAME_W;
    el.scrollTo({ left: Math.max(0, x(today) - view / 3), behavior: smooth ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => goToday(), [zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = requestAnimationFrame(() => goToday());
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const me = useSession((s) => s.user);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const st = useBoard.getState();
    const col = firstOpenColumn(st.columns) ?? st.columns[0];
    if (!col) return;
    st.addTask(col.id, { title, assigneeId: me?.id ?? null });
    setDraft('');
  };

  const rowsH = 38;
  const label = (b: Bar) => b.e.task.title;

  return (
    <div className="tl">
      <div className="tl-bar">
        <div className="tl-seg" role="group" aria-label={t('space.tl.zoom')}>
          <button type="button" onClick={() => goToday(true)}>
            {t('space.tl.today')}
          </button>
          {(['weeks', 'months', 'quarters'] as Zoom[]).map((z) => (
            <button key={z} type="button" className={zoom === z ? 'on' : ''} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {t(`space.tl.${z}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-scroll" ref={scroller}>
        <div className="tl-grid" style={{ width: NAME_W + width, '--name-w': `${NAME_W}px` } as CSSProperties}>
          <div className="tl-head">
            <div className="tl-corner">{t('space.tl.work')}</div>
            <div className="tl-scale" style={{ width }}>
              <div className="tl-scale-row">
                {head.top.map((m) => (
                  <div key={m.at} className="tl-cell" style={{ left: x(m.at), width: m.days * px }}>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
              {head.sub.length > 0 && (
                <div className="tl-scale-row is-sub">
                  {head.sub.map((m) => (
                    <div key={m.at} className={`tl-cell${zoom === 'weeks' && m.at === today ? ' is-today' : ''}`} style={{ left: x(m.at), width: m.days * px }}>
                      <span>{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="tl-body">
            <div className="tl-lines" style={{ left: NAME_W, width }} aria-hidden="true">
              {head.months.map((m) => (
                <i key={m.at} className="tl-vline" style={{ left: x(m.at) }} />
              ))}
              <i className="tl-today" style={{ left: x(today) + px / 2 }} />
            </div>

            <form className="tl-row tl-add" onSubmit={submit}>
              <div className="tl-name">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('space.tl.add')} aria-label={t('space.tl.add')} maxLength={200} />
              </div>
              <div className="tl-track" style={{ width }} />
            </form>

            {bars.map((b) => {
              const tk = ticketLabel(b.e.task, b.e.projectKey);
              const w = Math.max((b.end - b.start + 1) * px, 12);
              return (
                <div key={b.e.key} className={`tl-row${b.e.col.isDone ? ' is-done' : ''}`} style={{ height: rowsH }}>
                  <div className="tl-name">
                    {tk && <span className="ticket-key">{tk}</span>}
                    <button type="button" className="tl-title" onClick={() => onOpenTask(b.e.task.id, b.e.boardId)} title={b.e.task.title}>
                      {b.e.task.title}
                    </button>
                  </div>
                  <div className="tl-track" style={{ width }}>
                    <button
                      type="button"
                      className={`tl-item${b.open ? ' is-open' : ''}`}
                      style={{ left: x(b.start), width: w, '--c': b.e.col.color } as CSSProperties}
                      onClick={() => onOpenTask(b.e.task.id, b.e.boardId)}
                      title={`${label(b)} · ${toISODate(new Date(b.start * DAY + 12 * 3600_000))} → ${toISODate(new Date(b.end * DAY + 12 * 3600_000))}`}
                    >
                      {w > 70 && <span>{label(b)}</span>}
                    </button>
                  </div>
                </div>
              );
            })}

            {bars.length === 0 && <p className="tl-empty">{t('list.empty')}</p>}
          </div>
        </div>
      </div>
      {/* ngày hôm nay, dùng cho trình đọc màn hình */}
      <span className="sr-only">{todayISO()}</span>
    </div>
  );
}
