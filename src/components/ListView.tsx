/**
 * Trang Danh sách dạng bảng tính: mỗi việc một hàng, sửa nhanh giai đoạn (cột), mức ưu tiên và tiến độ ngay trên bảng.
 * Bấm tiêu đề cột để sắp xếp.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import { AvatarStack } from './Avatar';
import { userDirectory, usePeople } from '../sync/people';
import { useSession } from '../sync/session';
import type { Column, Priority, Task } from '../types';
import { PRIORITIES } from '../types';
import { useT, type T } from '../i18n';
import { canTrackProgress, dueInfo, parseISO, progressOf, tagStyle, timeRange } from '../utils';

interface Props {
  matches: (t: Task) => boolean;
  /** Giữ để tương thích; bảng luôn chỉ hiện việc khớp bộ lọc */
  filtering?: boolean;
  onOpenTask: (id: string) => void;
}

type SortKey = 'order' | 'title' | 'stage' | 'priority' | 'created' | 'due' | 'finished' | 'progress';

interface Row {
  task: Task;
  col: Column;
  colIndex: number;
  position: number;
  pct: number;
}

const PRIO_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

function fmtDate(iso: string | null | undefined, t: T) {
  if (!iso) return '';
  const d = iso.length === 10 ? parseISO(iso) : new Date(iso);
  return new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function ListView({ matches, onOpenTask }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const { toggleDone, moveTask, updateTask } = useBoard.getState();
  const me = useSession((s) => s.user);
  const people = usePeople();
  const dir = userDirectory(me, people);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 });

  const rows = useMemo(() => {
    const out: Row[] = [];
    columns.forEach((col, colIndex) =>
      col.taskIds.forEach((id, position) => {
        const task = tasks[id];
        if (task && matches(task)) out.push({ task, col, colIndex, position, pct: progressOf(task, col) });
      }),
    );
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      order: (a, b) => a.colIndex - b.colIndex || a.position - b.position,
      title: (a, b) => a.task.title.localeCompare(b.task.title, t.locale),
      stage: (a, b) => a.colIndex - b.colIndex,
      priority: (a, b) => PRIO_RANK[a.task.priority] - PRIO_RANK[b.task.priority],
      created: (a, b) => a.task.createdAt.localeCompare(b.task.createdAt),
      // Việc không có hạn / chưa xong luôn nằm cuối
      due: (a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999') || (a.task.startTime ?? '').localeCompare(b.task.startTime ?? ''),
      finished: (a, b) => (a.task.completedAt ?? '9999').localeCompare(b.task.completedAt ?? '9999'),
      progress: (a, b) => a.pct - b.pct,
    };
    const base = cmp.order;
    return out.sort((a, b) => sort.dir * cmp[sort.key](a, b) || base(a, b));
  }, [columns, tasks, matches, sort, t.locale]);

  const head = (key: SortKey, label: string, className = '') => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className={`lt-sort${sort.key === key ? ' on' : ''}`}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}
      >
        {label}
        <span className="lt-arrow" aria-hidden="true">
          {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="list-wrap">
      <div className="lt-scroll">
        <table className="lt">
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 190 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 170 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 200 }} />
          </colgroup>
          <thead>
            <tr>
              <th aria-label={t('list.done')} />
              {head('title', t('list.task'), 'is-left')}
              {head('stage', t('list.stage'))}
              {head('priority', t('list.priority'))}
              <th>{t('list.tags')}</th>
              <th>{t('list.assignees')}</th>
              {head('created', t('list.created'))}
              {head('due', t('list.due'))}
              {head('finished', t('list.finished'))}
              {head('progress', t('list.progress'))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="lt-empty">
                  {t('list.empty')}
                </td>
              </tr>
            ) : (
              rows.map(({ task, col, pct }) => {
                const done = col.isDone;
                const due = dueInfo(task.dueDate, done, t);
                const tracked = canTrackProgress(col);
                return (
                  <tr key={task.id} className={done ? 'is-done' : ''}>
                    <td className="lt-check">
                      <input
                        type="checkbox"
                        className="card-check"
                        checked={done}
                        aria-label={done ? t('card.uncheck') : t('card.check')}
                        onChange={() => toggleDone(task.id)}
                      />
                    </td>
                    <td className="is-left">
                      <button type="button" className="lt-title" onClick={() => onOpenTask(task.id)} title={task.note || task.title}>
                        {task.title}
                      </button>
                    </td>
                    <td>
                      <label className="lt-select" style={{ '--col': col.color } as CSSProperties}>
                        <select
                          aria-label={t('list.stage')}
                          value={col.id}
                          onChange={(e) => {
                            const target = columns.find((c) => c.id === e.target.value);
                            if (target) moveTask(task.id, target.id, target.taskIds.length);
                          }}
                        >
                          {columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className={`lt-prio prio-${task.priority}`}>
                      <select
                        aria-label={t('list.priority')}
                        value={task.priority}
                        onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {t(`prio.${p}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="lt-tags">
                      {task.tags.map((g) => (
                        <span key={g} className="tag" style={tagStyle(g)}>
                          {g}
                        </span>
                      ))}
                    </td>
                    <td>
                      <AvatarStack users={(task.assignees ?? []).map((id) => dir.get(id) ?? { id, name: '?', email: '?' })} max={3} size={22} />
                    </td>
                    <td className="lt-date">{fmtDate(task.createdAt, t)}</td>
                    <td className={`lt-date${due ? ` due-${due.tone}` : ''}`}>
                      {task.dueDate && (
                        <>
                          {fmtDate(task.dueDate, t)}
                          {task.startTime && <span className="lt-time">{timeRange(task)}</span>}
                        </>
                      )}
                    </td>
                    <td className="lt-date">{done && task.completedAt && <span className="lt-finished">{fmtDate(task.completedAt, t)}</span>}</td>
                    <td className="lt-progress">
                      <span className="lt-pct">{tracked || done ? `${pct}%` : '—'}</span>
                      {tracked ? (
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={pct}
                          aria-label={`${t('progress.label')}: ${task.title}`}
                          style={{ '--p': `${pct}%` } as CSSProperties}
                          onChange={(e) => updateTask(task.id, { progress: Number(e.target.value) })}
                        />
                      ) : (
                        <span className="lt-bar" aria-hidden="true">
                          <i style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
