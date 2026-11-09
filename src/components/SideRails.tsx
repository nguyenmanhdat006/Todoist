/**
 * Hai thanh bên cho màn hình rộng (≥ 1600px):
 *  - trái: lịch tháng nhỏ + việc hôm nay
 *  - phải: sắp đến hạn 7 ngày tới + việc đang mở theo nhãn
 * Dùng toàn bộ dữ liệu (không theo ô tìm kiếm/bộ lọc) để luôn là bức tranh tổng.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import { useUi } from '../store/ui';
import type { Task } from '../types';
import { tagColor } from '../types';
import { useT, type T } from '../i18n';
import { knownTags, parseISO, timeRange, toISODate, todayISO } from '../utils';
import '../rails.css';

interface Props {
  onOpenTask: (id: string) => void;
}

const NO_TAG = '#94a3b8';
const VI_DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function addDays(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function dow(iso: string, t: T) {
  const d = parseISO(iso);
  return t.lang === 'vi' ? VI_DOW[d.getDay()] : new Intl.DateTimeFormat(t.locale, { weekday: 'short' }).format(d);
}

const byTime = (a: Task, b: Task) => (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title);

function useBoardData() {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  return useMemo(() => {
    const done = new Set(columns.filter((c) => c.isDone).flatMap((c) => c.taskIds));
    const list = columns.flatMap((c) => c.taskIds).map((id) => tasks[id]).filter((x): x is Task => !!x);
    return { list, done, tasks };
  }, [columns, tasks]);
}

const color = (task: Task) => (task.tags[0] ? tagColor(task.tags[0]) : NO_TAG);

function TaskLine({ task, done, meta, onOpen }: { task: Task; done: boolean; meta: string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className={`rail-task${done ? ' is-done' : ''}`} style={{ '--tag': color(task) } as CSSProperties} onClick={onOpen}>
        <span className="rail-task-meta">{meta}</span>
        <span className="rail-task-title">{task.title}</span>
      </button>
    </li>
  );
}

/* ---------- trái ---------- */

function MiniCalendar({ dots }: { dots: Set<string> }) {
  const t = useT();
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7) + '-01');
  const setCalAnchor = useUi((s) => s.setCalAnchor);
  const first = parseISO(month);
  const start = addDays(month, -((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const label = new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(first);
  const shift = (n: number) => setMonth(toISODate(new Date(first.getFullYear(), first.getMonth() + n, 1)));

  const open = (iso: string) => {
    const s = useBoard.getState();
    setCalAnchor(iso);
    s.setCalMode('day');
    s.setView('calendar');
  };

  return (
    <section className="rail-card">
      <div className="mini-head">
        <span className="mini-title">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
        <button type="button" className="mini-nav" aria-label={t('cal.prev')} onClick={() => shift(-1)}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="mini-nav" aria-label={t('cal.next')} onClick={() => shift(1)}>
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="mini-grid" role="grid">
        {cells.slice(0, 7).map((iso) => (
          <span key={'h' + iso} className="mini-dow">
            {dow(iso, t)}
          </span>
        ))}
        {cells.map((iso) => {
          const d = parseISO(iso);
          const out = d.getMonth() !== first.getMonth();
          return (
            <button
              key={iso}
              type="button"
              className={`mini-day${out ? ' is-out' : ''}${iso === today ? ' is-today' : ''}`}
              aria-label={new Intl.DateTimeFormat(t.locale, { dateStyle: 'full' }).format(d)}
              onClick={() => open(iso)}
            >
              {d.getDate()}
              {dots.has(iso) && <i className="mini-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TodayCard({ onOpenTask }: Props) {
  const t = useT();
  const { list, done } = useBoardData();
  const today = todayISO();
  const items = list.filter((x) => x.dueDate === today).sort(byTime);
  return (
    <section className="rail-card">
      <h2 className="rail-title">
        {t('rail.today')}
        <span className="rail-count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rail-empty">{t('rail.todayEmpty')}</p>
      ) : (
        <ul className="rail-list">
          {items.map((x) => (
            <TaskLine
              key={x.id}
              task={x}
              done={done.has(x.id)}
              meta={x.startTime ? timeRange(x) : t('rail.allDay')}
              onOpen={() => onOpenTask(x.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function LeftRail({ onOpenTask }: Props) {
  const t = useT();
  const { list, done } = useBoardData();
  const dots = useMemo(() => new Set(list.filter((x) => x.dueDate && !done.has(x.id)).map((x) => x.dueDate!)), [list, done]);
  return (
    <aside className="rail rail-left" aria-label={t('rail.today')}>
      <MiniCalendar dots={dots} />
      <TodayCard onOpenTask={onOpenTask} />
    </aside>
  );
}

/* ---------- phải ---------- */

const UPCOMING_MAX = 8;

function UpcomingCard({ onOpenTask }: Props) {
  const t = useT();
  const { list, done } = useBoardData();
  const today = todayISO();
  const end = addDays(today, 7);
  const items = list
    .filter((x) => x.dueDate && x.dueDate > today && x.dueDate <= end && !done.has(x.id))
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byTime(a, b));
  const shown = items.slice(0, UPCOMING_MAX);
  const tomorrow = addDays(today, 1);
  const dayLabel = (iso: string) =>
    iso === tomorrow
      ? t('due.tomorrow')
      : `${dow(iso, t)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  return (
    <section className="rail-card">
      <h2 className="rail-title">
        {t('rail.upcoming')}
        <span className="rail-count">{items.length}</span>
      </h2>
      {shown.length === 0 ? (
        <p className="rail-empty">{t('rail.upcomingEmpty')}</p>
      ) : (
        <ul className="rail-list">
          {shown.map((x) => (
            <TaskLine
              key={x.id}
              task={x}
              done={false}
              meta={`${dayLabel(x.dueDate!)}${x.startTime ? ' · ' + x.startTime : ''}`}
              onOpen={() => onOpenTask(x.id)}
            />
          ))}
        </ul>
      )}
      {items.length > UPCOMING_MAX && <p className="rail-more">{t('rail.more', { n: items.length - UPCOMING_MAX })}</p>}
    </section>
  );
}

function TagsCard() {
  const t = useT();
  const { list, done, tasks } = useBoardData();
  const rows = useMemo(() => {
    const count = new Map<string, number>();
    for (const x of list) {
      if (done.has(x.id)) continue;
      for (const g of x.tags) count.set(g, (count.get(g) ?? 0) + 1);
    }
    return knownTags(tasks, t.lang, t.locale)
      .map((g) => ({ g, n: count.get(g) ?? 0 }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [list, done, tasks, t.lang, t.locale]);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="rail-card">
      <h2 className="rail-title">{t('rail.tags')}</h2>
      {rows.length === 0 ? (
        <p className="rail-empty">{t('rail.tagsEmpty')}</p>
      ) : (
        <ul className="rail-bars">
          {rows.map(({ g, n }) => (
            <li key={g} style={{ '--tag': tagColor(g) } as CSSProperties}>
              <span className="rail-bar-label">{g}</span>
              <span className="rail-bar-value">{n}</span>
              <span className="rail-bar" aria-hidden="true">
                <i style={{ width: `${(n / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RightRail({ onOpenTask }: Props) {
  const t = useT();
  return (
    <aside className="rail rail-right" aria-label={t('rail.upcoming')}>
      <UpcomingCard onOpenTask={onOpenTask} />
      <TagsCard />
    </aside>
  );
}
