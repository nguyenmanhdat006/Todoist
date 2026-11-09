import { useEffect, useState } from 'react';
import { useBoard } from '../store/board';
import type { Priority } from '../types';
import { PRIORITIES } from '../types';
import { useT } from '../i18n';

interface Props {
  taskId: string | null;
  defaultColumnId: string;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function TaskModal({ taskId, defaultColumnId, onClose, onDelete }: Props) {
  const t = useT();
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
      setError(t('modal.titleError'));
      return;
    }
    const s = useBoard.getState();
    const data = {
      title: title.trim(),
      note: note.trim(),
      priority,
      dueDate: dueDate || null,
      tags: [...new Set(tags.split(',').map((x) => x.trim()).filter(Boolean))],
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
          <h2 id="task-modal-title">{task ? t('modal.edit') : t('modal.new')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('modal.close')}>
            ✕
          </button>
        </header>

        <label className="field">
          <span>{t('modal.title')}</span>
          <input
            id="task-title"
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
            placeholder={t('modal.titlePh')}
          />
          {error && <small className="error">{error}</small>}
        </label>

        <label className="field">
          <span>{t('modal.note')}</span>
          <textarea id="task-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>{t('modal.column')}</span>
            <select id="task-column" value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('modal.due')}</span>
            <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span>{t('modal.priority')}</span>
          <div className="seg" role="radiogroup" aria-label={t('modal.priority')}>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                className={`seg-btn prio-${p}${priority === p ? ' on' : ''}`}
                onClick={() => setPriority(p)}
              >
                {t(`prio.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>{t('modal.tags')}</span>
          <input id="task-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t('modal.tagsPh')} />
        </label>

        <footer className="modal-foot">
          {task && (
            <button type="button" className="btn danger-ghost" onClick={() => onDelete(task.id)}>
              {t('modal.delete')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {task ? t('modal.save') : t('modal.add')}
          </button>
        </footer>
      </form>
    </div>
  );
}
