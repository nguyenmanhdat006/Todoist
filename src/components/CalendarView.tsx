import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
import { useBoard } from '../store/board';
import '../calendar.css';
import type { CalMode, Column, Task } from '../types';
import { tagColor } from '../types';
import { useT, type T } from '../i18n';
import { fromMinutes, knownTags, parseISO, timeRange, toISODate, toMinutes, todayISO } from '../utils';

interface Props {
  matches: (t: Task) => boolean;
  onOpenTask: (id: string) => void;
  /** Tạo việc tại ngày/giờ đã bấm; time = null là việc cả ngày */
  onCreateAt: (date: string, time: string | null) => void;
}

/** Chiều cao một giờ trên lưới (px) */
const HOUR = 48;
const SLOT = 30;

interface Entry {
  task: Task;
  col: Column;
  done: boolean;
  /** Màu theo nhãn đầu tiên đang hiện */
  color: string;
}

/** Màu cho việc không có nhãn */
const NO_TAG_COLOR = '#94a3b8';

function addDays(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Thứ Hai đầu tuần */
function startOfWeek(iso: string) {
  const d = parseISO(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

function addMonths(iso: string, n: number) {
  const d = parseISO(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

const VI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function dowLabel(iso: string, t: T) {
  const d = parseISO(iso);
  return t.lang === 'vi' ? VI_DOW[d.getDay()] : new Intl.DateTimeFormat(t.locale, { weekday: 'short' }).format(d);
}

function rangeLabel(mode: CalMode, anchor: string, t: T) {
  const d = parseISO(anchor);
  if (mode === 'month') {
    const s = new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (mode === 'day') {
    const s = new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const a = parseISO(startOfWeek(anchor));
  const b = parseISO(addDays(startOfWeek(anchor), 6));
  if (t.lang === 'vi') {
    const f = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${f(a)} – ${f(b)}/${b.getFullYear()}`;
  }
  const f = new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric' });
  return `${f.format(a)} – ${f.format(b)}, ${b.getFullYear()}`;
}

/** Xếp các việc trùng giờ thành cột song song */
function layoutDay(items: { id: string; start: number; end: number }[]) {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: string[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const id of cluster) out.set(id, { ...out.get(id)!, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const ev of sorted) {
    if (ev.start >= clusterEnd) flush();
    let col = colEnds.findIndex((e) => e <= ev.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(ev.end);
    } else colEnds[col] = ev.end;
    out.set(ev.id, { col, cols: 1 });
    cluster.push(ev.id);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();
  return out;
}

function span(task: Task) {
  const start = toMinutes(task.startTime!);
  let end = task.endTime ? toMinutes(task.endTime) : start + 60;
  if (end <= start) end = start + 30;
  return { start, end: Math.min(end, 24 * 60) };
}

export function CalendarView({ matches, onOpenTask, onCreateAt }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const mode = useBoard((s) => s.calMode);
  const setMode = useBoard((s) => s.setCalMode);
  const hiddenList = useBoard((s) => s.calHiddenTags);
  const setHidden = useBoard((s) => s.setCalHiddenTags);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);

  // Tất cả nhãn đang dùng + số việc có ngày mang nhãn đó
  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    let none = 0;
    for (const task of Object.values(tasks)) {
      if (!task.dueDate) continue;
      if (task.tags.length === 0) none++;
      for (const g of task.tags) m.set(g, (m.get(g) ?? 0) + 1);
    }
    const list = knownTags(tasks, t.lang, t.locale).map((g) => [g, m.get(g) ?? 0] as [string, number]);
    return { list, none };
  }, [tasks, t.lang, t.locale]);
  const tagKeys = useMemo(() => [...tagStats.list.map(([g]) => g), ...(tagStats.none ? [''] : [])], [tagStats]);
  const shownCount = tagKeys.filter((g) => !hidden.has(g)).length;

  const toggleTag = (g: string) => setHidden(hidden.has(g) ? hiddenList.filter((x) => x !== g) : [...hiddenList, g]);
  const onlyTag = (g: string) => setHidden(tagKeys.filter((x) => x !== g));
  const toggleAll = () => setHidden(shownCount === tagKeys.length ? tagKeys : []);
  const [anchor, setAnchor] = useState(todayISO);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const today = toISODate(now);

  // Ngày -> các việc trong ngày (đã qua bộ lọc)
  const { byDate, noDate } = useMemo(() => {
    const map = new Map<string, Entry[]>();
    let noDate = 0;
    for (const col of columns) {
      for (const id of col.taskIds) {
        const task = tasks[id];
        if (!task || !matches(task)) continue;
        const shownTags = task.tags.filter((g) => !hidden.has(g));
        if (task.tags.length ? shownTags.length === 0 : hidden.has('')) continue;
        if (!task.dueDate) {
          noDate++;
          continue;
        }
        const list = map.get(task.dueDate) ?? [];
        list.push({ task, col, done: col.isDone, color: shownTags.length ? tagColor(shownTags[0]) : NO_TAG_COLOR });
        map.set(task.dueDate, list);
      }
    }
    for (const list of map.values())
      list.sort((a, b) => (a.task.startTime ?? '').localeCompare(b.task.startTime ?? ''));
    return { byDate: map, noDate };
  }, [columns, tasks, matches, hidden]);

  const days = useMemo(() => {
    if (mode === 'day') return [anchor];
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }, [mode, anchor]);

  // Cuộn lưới giờ tới khoảng 6h sáng (hoặc gần giờ hiện tại nếu đang xem hôm nay)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const h = days.includes(today) ? Math.max(0, Math.min(now.getHours() - 2, 6)) : 6;
    el.scrollTop = Math.max(0, h * HOUR - 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchor]);

  const step = (dir: 1 | -1) =>
    setAnchor((a) => (mode === 'month' ? addMonths(a, dir) : addDays(a, dir * (mode === 'week' ? 7 : 1))));

  const openDay = (iso: string) => {
    setAnchor(iso);
    setMode('day');
  };

  const chip = ({ task, done, color }: Entry, compact = false) => (
    <button
      key={task.id}
      type="button"
      className={`cal-chip${done ? ' is-done' : ''}${task.startTime ? '' : ' is-allday'}`}
      style={{ '--col': color } as CSSProperties}
      title={`${timeRange(task) ? timeRange(task) + ' · ' : ''}${task.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpenTask(task.id);
      }}
    >
      {task.startTime && <span className="cal-chip-time">{task.startTime}</span>}
      <span className="cal-chip-title">{task.title}</span>
      {!compact && task.note && <span className="cal-chip-note">{task.note}</span>}
    </button>
  );

  const createAtPointer = (e: MouseEvent<HTMLDivElement>, iso: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const min = Math.floor((((e.clientY - rect.top) / HOUR) * 60) / SLOT) * SLOT;
    onCreateAt(iso, fromMinutes(Math.min(min, 23 * 60 + 30)));
  };

  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="cal-wrap">
      <div className="cal-bar">
        <div className="cal-nav">
          <button type="button" className="cal-btn" onClick={() => setAnchor(today)}>
            {t('cal.today')}
          </button>
          <button type="button" className="cal-btn icon" aria-label={t('cal.prev')} title={t('cal.prev')} onClick={() => step(-1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="cal-btn icon" aria-label={t('cal.next')} title={t('cal.next')} onClick={() => step(1)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <h2 className="cal-range" aria-live="polite">
          {rangeLabel(mode, anchor, t)}
        </h2>
        {noDate > 0 && <span className="cal-nodate">{t('cal.noDate', { n: noDate })}</span>}
        <div className="cal-modes" role="group" aria-label={t('cal.mode')}>
          {(['month', 'week', 'day'] as CalMode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(`cal.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-layout">
      <aside className="cal-side" aria-label={t('cal.tags')}>
        <div className="cal-side-title">{t('cal.tags')}</div>
        <label className="cal-tag is-all">
          <input
            type="checkbox"
            checked={tagKeys.length > 0 && shownCount === tagKeys.length}
            ref={(el) => {
              if (el) el.indeterminate = shownCount > 0 && shownCount < tagKeys.length;
            }}
            onChange={toggleAll}
          />
          <span className="cal-tag-name">{t('cal.allTags')}</span>
        </label>
        {[...tagStats.list, ...(tagStats.none ? ([['', tagStats.none]] as [string, number][]) : [])].map(([g, n]) => (
          <div key={g || '__none'} className={`cal-tag${hidden.has(g) ? ' is-off' : ''}${n === 0 ? ' is-empty' : ''}`} style={{ '--tag': g ? tagColor(g) : NO_TAG_COLOR } as CSSProperties}>
            <label>
              <input type="checkbox" checked={!hidden.has(g)} onChange={() => toggleTag(g)} />
              <span className="cal-tag-name">{g || t('cal.noTag')}</span>
              <span className="cal-tag-count">{n}</span>
            </label>
            {tagKeys.length > 1 && (
              <button type="button" className="cal-tag-only" title={t('cal.only')} aria-label={`${t('cal.only')}: ${g || t('cal.noTag')}`} onClick={() => onlyTag(g)}>
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="8" cy="8" r="2.2" />
                  <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </aside>
      <div className="cal-card">
        {mode === 'month' ? (
          <MonthGrid anchor={anchor} today={today} byDate={byDate} t={t} chip={chip} openDay={openDay} onCreateAt={onCreateAt} />
        ) : (
          <div className="cal-scroll" ref={scrollRef}>
            <div className={`cal-tg cal-${mode}`} style={{ '--days': days.length } as CSSProperties}>
              <div className="cal-sticky">
                <div className="cal-row cal-head">
                  <div className="cal-gutter" />
                  {days.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      className={`cal-dayhead${iso === today ? ' is-today' : ''}`}
                      onClick={() => openDay(iso)}
                      disabled={mode === 'day'}
                    >
                      <span className="cal-dow">{dowLabel(iso, t)}</span>
                      <span className="cal-dnum">{parseISO(iso).getDate()}</span>
                    </button>
                  ))}
                </div>
                <div className="cal-row cal-allday">
                  <div className="cal-gutter cal-allday-label">{t('cal.allDay')}</div>
                  {days.map((iso) => (
                    <div
                      key={iso}
                      className={`cal-allday-cell${iso === today ? ' is-today' : ''}`}
                      onClick={() => onCreateAt(iso, null)}
                    >
                      {(byDate.get(iso) ?? []).filter((x) => !x.task.startTime).map((x) => chip(x, true))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="cal-row cal-body">
                <div className="cal-gutter cal-hours" aria-hidden="true">
                  {Array.from({ length: 24 }, (_, h) => (
                    <span key={h} style={{ top: h * HOUR }}>
                      {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                    </span>
                  ))}
                </div>
                {days.map((iso) => {
                  const timed = (byDate.get(iso) ?? []).filter((x) => x.task.startTime);
                  const lay = layoutDay(timed.map((x) => ({ id: x.task.id, ...span(x.task) })));
                  return (
                    <div
                      key={iso}
                      className={`cal-daycol${iso === today ? ' is-today' : ''}`}
                      style={{ height: 24 * HOUR }}
                      onClick={(e) => createAtPointer(e, iso)}
                    >
                      {timed.map(({ task, done, color }) => {
                        const { start, end } = span(task);
                        const pos = lay.get(task.id) ?? { col: 0, cols: 1 };
                        const height = Math.max(((end - start) / 60) * HOUR - 2, 20);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            className={`cal-event${done ? ' is-done' : ''}${height < 40 ? ' is-short' : ''}`}
                            style={
                              {
                                '--col': color,
                                top: (start / 60) * HOUR + 1,
                                height,
                                left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
                                width: `calc(${100 / pos.cols}% - 4px)`,
                              } as CSSProperties
                            }
                            title={`${timeRange(task)} · ${task.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTask(task.id);
                            }}
                          >
                            <span className="cal-event-title">{task.title}</span>
                            <span className="cal-event-time">{timeRange(task)}</span>
                          </button>
                        );
                      })}
                      {iso === today && <div className="cal-now" style={{ top: (nowMin / 60) * HOUR }} aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

interface MonthProps {
  anchor: string;
  today: string;
  byDate: Map<string, Entry[]>;
  t: T;
  chip: (e: Entry, compact?: boolean) => ReactElement;
  openDay: (iso: string) => void;
  onCreateAt: (date: string, time: string | null) => void;
}

const MAX_CHIPS = 3;

function MonthGrid({ anchor, today, byDate, t, chip, openDay, onCreateAt }: MonthProps) {
  const a = parseISO(anchor);
  const first = toISODate(new Date(a.getFullYear(), a.getMonth(), 1));
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = a.getMonth();

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {cells.slice(0, 7).map((iso) => (
          <span key={iso}>{dowLabel(iso, t)}</span>
        ))}
      </div>
      <div className="cal-month-grid">
        {cells.map((iso) => {
          const list = byDate.get(iso) ?? [];
          const out = parseISO(iso).getMonth() !== month;
          return (
            <div
              key={iso}
              className={`cal-mcell${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}`}
              onClick={() => onCreateAt(iso, null)}
            >
              <button
                type="button"
                className="cal-mnum"
                onClick={(e) => {
                  e.stopPropagation();
                  openDay(iso);
                }}
              >
                {parseISO(iso).getDate()}
              </button>
              <div className="cal-mlist">
                {list.slice(0, MAX_CHIPS).map((x) => chip(x, true))}
                {list.length > MAX_CHIPS && (
                  <button
                    type="button"
                    className="cal-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDay(iso);
                    }}
                  >
                    {t('cal.more', { n: list.length - MAX_CHIPS })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
