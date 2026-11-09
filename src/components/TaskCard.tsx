import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
import type { Task } from '../types';
import { useT } from '../i18n';
import { useBoard } from '../store/board';
import { dueInfo, timeRange, tagStyle } from '../utils';

interface BodyProps {
  task: Task;
  done: boolean;
  color: string;
  overlay?: boolean;
}

export function TaskCardBody({ task, done, color, overlay }: BodyProps) {
  const t = useT();
  const toggleDone = useBoard((s) => s.toggleDone);
  const due = dueInfo(task.dueDate, done, t);
  return (
    <div
      className={`card${done ? ' is-done' : ''}${overlay ? ' is-overlay' : ''}`}
      style={{ '--col': color } as CSSProperties}
    >
      <div className="card-head">
        <input
          type="checkbox"
          className="card-check"
          id={`check-${task.id}`}
          checked={done}
          aria-label={done ? t('card.uncheck') : t('card.check')}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleDone(task.id)}
        />
        <div className="card-title">{task.title}</div>
      </div>
      {task.note && <div className="card-note">{task.note}</div>}
      {(task.tags.length > 0 || task.priority !== 'normal') && (
        <div className="card-tags">
          {task.priority !== 'normal' && <span className={`prio-chip prio-${task.priority}`}>{t(`prio.${task.priority}`)}</span>}
          {task.tags.map((tag) => (
            <span key={tag} className="tag" style={tagStyle(tag)}>
              {tag}
            </span>
          ))}
        </div>
      )}
      {due && (
        <div className="card-foot">
          <span className={`due due-${due.tone}`}>
            {due.label}
            {task.startTime && ` · ${timeRange(task)}`}
          </span>
        </div>
      )}
    </div>
  );
}

interface Props {
  task: Task;
  columnId: string;
  done: boolean;
  color: string;
  onOpen: (id: string) => void;
}

export function SortableTaskCard({ task, columnId, done, color, onOpen }: Props) {
  const t = useT();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', columnId },
  });
  return (
    <div
      ref={setNodeRef}
      className={`card-wrap${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription={t('card.role')}
      aria-label={task.title}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter' && !e.defaultPrevented) onOpen(task.id);
      }}
    >
      <TaskCardBody task={task} done={done} color={color} />
    </div>
  );
}
