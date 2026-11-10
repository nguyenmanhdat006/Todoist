import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
import type { Task } from '../types';
import { useT } from '../i18n';
import { useBoard } from '../store/board';
import { AvatarStack } from './Avatar';
import { userDirectory, usePeople } from '../sync/people';
import { useSession } from '../sync/session';
import { canTrackProgress, cardColorOf, dueInfo, progressOf, taskStatus, timeRange, tagStyle } from '../utils';

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
  const col = useBoard((s) => s.columns.find((c) => c.taskIds.includes(task.id)));
  const tracked = canTrackProgress(col);
  const pct = progressOf(task, col);
  const status = taskStatus(task, done);
  const tint = cardColorOf(task, col);
  const me = useSession((s) => s.user);
  const people = usePeople();
  const dir = userDirectory(me, people);
  const assigned = (task.assignees ?? []).map((id) => dir.get(id) ?? { id, name: '?', email: '?' });
  return (
    <div
      className={`card${tint ? ` is-tinted status-${status}` : ''}${done ? ' is-done' : ''}${overlay ? ' is-overlay' : ''}`}
      style={{ '--col': color, ...(tint ? { '--st': tint } : {}) } as CSSProperties}
    >
      {assigned.length > 0 && (
        <span className="card-assignees">
          <AvatarStack users={assigned} max={3} size={24} />
        </span>
      )}
      <div className={`card-head${assigned.length > 0 ? ` has-avatars av-${Math.min(assigned.length, 4)}` : ''}`}>
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
      {tracked && (
        <div className={`card-progress${pct === 0 ? ' is-empty' : ''}`} title={t('progress.label')}>
          <span className="card-progress-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="card-progress-value">{pct === 0 ? t('progress.notSet') : `${pct}%`}</span>
        </div>
      )}
      {due && (
        <div className="card-foot">
          {due && (
            <span className={`due due-${due.tone}`}>
              {due.label}
              {task.startTime && ` · ${timeRange(task)}`}
            </span>
          )}
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
