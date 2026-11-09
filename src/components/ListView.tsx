import type { CSSProperties } from 'react';
import { useBoard } from '../store/board';
import type { Task } from '../types';
import { PRIORITY, tagColor } from '../types';
import { dueInfo } from '../utils';

interface Props {
  matches: (t: Task) => boolean;
  onOpenTask: (id: string) => void;
}

export function ListView({ matches, onOpenTask }: Props) {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const moveTask = useBoard((s) => s.moveTask);

  const doneCol = columns.find((c) => c.isDone);
  const firstOpen = columns.find((c) => !c.isDone);

  const rows = columns.flatMap((col) =>
    col.taskIds
      .map((id) => tasks[id])
      .filter((t): t is Task => !!t && matches(t))
      .map((t) => ({ task: t, col })),
  );

  const toggle = (taskId: string, done: boolean) => {
    const target = done ? firstOpen : doneCol;
    if (!target) return;
    moveTask(taskId, target.id, done ? 0 : target.taskIds.length);
  };

  if (rows.length === 0) {
    return <div className="list-empty">Không có công việc nào khớp bộ lọc.</div>;
  }

  return (
    <div className="list-wrap">
      <table className="list">
        <thead>
          <tr>
            <th className="c-check" aria-label="Hoàn thành" />
            <th>Công việc</th>
            <th>Cột</th>
            <th>Ưu tiên</th>
            <th>Hạn chót</th>
            <th>Nhãn</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, col }) => {
            const due = dueInfo(task.dueDate, col.isDone);
            return (
              <tr key={task.id} className={col.isDone ? 'is-done' : ''}>
                <td className="c-check">
                  <input
                    type="checkbox"
                    id={`done-${task.id}`}
                    checked={col.isDone}
                    disabled={!doneCol}
                    title={doneCol ? 'Đánh dấu hoàn thành' : 'Chưa có cột nào được đặt là cột Hoàn thành'}
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
                  <span className={`prio prio-${task.priority}`}>{PRIORITY[task.priority].label}</span>
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
