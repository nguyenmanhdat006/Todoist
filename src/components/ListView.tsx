import { useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import type { Task } from '../types';
import { tagColor } from '../types';
import { useT } from '../i18n';
import { dueInfo, timeRange } from '../utils';

interface Props {
  matches: (t: Task) => boolean;
  /** Đang lọc hoặc tìm kiếm: ẩn các nhóm không có kết quả */
  filtering: boolean;
  onOpenTask: (id: string) => void;
}

export function ListView({ matches, filtering, onOpenTask }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const toggleDone = useBoard((s) => s.toggleDone);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = columns
    .map((col) => ({
      col,
      rows: col.taskIds.map((id) => tasks[id]).filter((x): x is Task => !!x && matches(x)),
    }))
    .filter((g) => !filtering || g.rows.length > 0);

  if (groups.length === 0) {
    return <div className="list-empty">{t('list.empty')}</div>;
  }

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="list-wrap">
      <div className="lv">
        {groups.map(({ col, rows }) => {
          const open = !collapsed.has(col.id);
          return (
            <section key={col.id} className="lv-group" style={{ '--col': col.color } as CSSProperties}>
              <button
                type="button"
                className="lv-head"
                aria-expanded={open}
                onClick={() => toggleGroup(col.id)}
              >
                <svg className="lv-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="col-dot" aria-hidden="true" />
                <span className="lv-title">{col.title}</span>
                <span className="col-count">{rows.length}</span>
              </button>

              {open &&
                (rows.length === 0 ? (
                  <p className="lv-empty">{t('list.emptyGroup')}</p>
                ) : (
                  <ul className="lv-rows">
                    {rows.map((task) => {
                      const due = dueInfo(task.dueDate, col.isDone, t);
                      return (
                        <li key={task.id} className={`lv-row${col.isDone ? ' is-done' : ''}`}>
                          <input
                            type="checkbox"
                            className="card-check"
                            id={`done-${task.id}`}
                            checked={col.isDone}
                            aria-label={col.isDone ? t('card.uncheck') : t('card.check')}
                            onChange={() => toggleDone(task.id)}
                          />
                          <button type="button" className="lv-main" onClick={() => onOpenTask(task.id)}>
                            <span className="lv-task">{task.title}</span>
                            {task.note && <span className="lv-note">{task.note}</span>}
                          </button>
                          <div className="lv-meta">
                            {task.tags.map((g) => (
                              <span key={g} className="tag" style={{ '--tag': tagColor(g) } as CSSProperties}>
                                {g}
                              </span>
                            ))}
                            {task.priority !== 'normal' && (
                              <span className={`lv-pill prio-${task.priority}`}>{t(`prio.${task.priority}`)}</span>
                            )}
                            {due && (
                              <span className={`lv-pill lv-due due-${due.tone}`}>
                                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
                                  <path d="M2.5 7h11M5.5 2v3M10.5 2v3" strokeLinecap="round" />
                                </svg>
                                {due.label}
                                {task.startTime && ` · ${timeRange(task)}`}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
