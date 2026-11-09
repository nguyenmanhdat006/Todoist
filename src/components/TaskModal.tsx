import { useEffect, useState } from 'react';
import { useBoard } from '../store/board';
import type { Priority } from '../types';
import { PRIORITY } from '../types';

interface Props {
  taskId: string | null;
  defaultColumnId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function TaskModal({ taskId, defaultColumnId, onClose, onDelete }: Props) {
  const columns = useBoard((s) => s.columns);
  const task = useBoard((s) => (taskId ? s.tasks[taskId] : undefined));
  const currentColumnId = columns.find((c) => taskId && c.taskIds.includes(taskId))?.id ?? defaultColumnId;

  const [title, setTitle] = useState(task?.title ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
  const [columnId, setColumnId] = useState(currentColumnId);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    if (!title.trim()) {
      setError('Hãy nhập tên công việc.');
      return;
    }
    const s = useBoard.getState();
    const data = {
      title: title.trim(),
      note: note.trim(),
      priority,
      dueDate: dueDate || null,
      tags: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))],
    };
    if (task) {
      s.updateTask(task.id, data);
      if (columnId !== currentColumnId) {
        const target = s.columns.find((c) => c.id === columnId);
        s.moveTask(task.id, columnId, target ? target.taskIds.length : 0);
      }
    } else {
      s.addTask(columnId, data);
    }
    onClose();
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      >
        <header className="modal-head">
          <h2 id="task-modal-title">{task ? 'Sửa công việc' : 'Công việc mới'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>

        <label className="field">
          <span>Tên công việc</span>
          <input
            id="task-title"
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            placeholder="Ví dụ: Nộp báo cáo tuần"
          />
          {error && <small className="error">{error}</small>}
        </label>

        <label className="field">
          <span>Ghi chú</span>
          <textarea id="task-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Cột</span>
            <select id="task-column" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Hạn chót</span>
            <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span>Mức ưu tiên</span>
          <div className="seg" role="radiogroup" aria-label="Mức ưu tiên">
            {(Object.keys(PRIORITY) as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                className={`seg-btn prio-${p}${priority === p ? ' on' : ''}`}
                onClick={() => setPriority(p)}
              >
                {PRIORITY[p].label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Nhãn (cách nhau bằng dấu phẩy)</span>
          <input id="task-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Công việc, Cá nhân" />
        </label>

        <footer className="modal-foot">
          {task && (
            <button type="button" className="btn danger-ghost" onClick={() => onDelete(task.id)}>
              Xoá việc
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Huỷ
          </button>
          <button type="submit" className="btn primary">
            {task ? 'Lưu' : 'Thêm việc'}
          </button>
        </footer>
      </form>
    </div>
  );
}
