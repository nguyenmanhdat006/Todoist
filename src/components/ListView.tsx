import type { CSSProperties } from 'react';
import { useBoard } from '../store/board';
import type { Task } from '../types';
import { tagColor } from '../types';
import { useT } from '../i18n';
import { dueInfo } from '../utils';

interface Props {
  matches: (t: Task) => boolean;
  onOpenTask: (id: string) => void;
}

export function ListView({ matches, onOpenTask }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const moveTask = useBoard((s) => s.moveTask);

  const doneCol = columns.find((c) => c.isDone);
  const firstOpen = columns.find((c) => !c.isDone);

  const rows = columns.flatMap((col) =>
    col.taskIds
      .map((id) => tasks[id])
      .filter((x): x is Task => !!x && matches(x))
      .map((x) => ({ task: x, col })),
  );

  const toggle = (taskId: string, done: boolean) => {
    const target = done ? firstOpen : doneCol;
    if (!target) return;
    moveTask(taskId, target.id, done ? 0 : target.taskIds.length);
  };

  if (rows.length === 0) {
    return <div className="list-empty">{t('list.empty')}</div>;
  }

  return (
    <div className="list-wrap">
      <table className="list">
        <thead>
          <tr>
            <th className="c-check" aria-label={t('list.done')} />
            <th>{t('list.task')}</th>
            <th>{t('list.column')}</th>
            <th>{t('list.priority')}</th>
            <th>{t('list.due')}</th>
            <th>{t('list.tags')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, col }) => {
            const due = dueInfo(task.dueDate, col.isDone, t);
            return (
              <tr key={task.id} className={col.isDone ? 'is-done' : ''}>
                <td className="c-check">
                  <input
                    type="checkbox"
                    id={`done-${task.id}`}
                    checked={col.isDone}
                    disabled={!doneCol}
                    title={doneCol ? t('card.check') : t('list.noDoneCol')}
                    onChange={() => toggle(task.id, col.isDone)}
                  />
                </td>
                <td>
                  <button type="button" className="link-btn" onClick={() => onOpenTask(task.id)}>
                    {task.title}
                  </button>
                  {task.note && <div className="list-note">{task.note}</div>}
                </td>
                <td>
                  <span className="status" style={{ '--col': col.color } as CSSProperties}>
                    {col.title}
                  </span>
                </td>
                <td>
                  <span className={`prio prio-${task.priority}`}>{t(`prio.${task.priority}`)}</span>
                </td>
                <td>{due ? <span className={`due due-${due.tone}`}>{due.label}</span> : <span className="muted">—</span>}</td>
                <td>
                  {task.tags.map((g) => (
                    <span key={g} className="tag" style={{ '--tag': tagColor(g) } as CSSProperties}>
                      {g}
                    </span>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
