import { toast } from '../toast';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import type { Column, Priority } from '../types';
import { PRIORITIES } from '../types';
import { useT } from '../i18n';
import { TagPicker, addTag } from './TagPicker';
import { TimeSelect } from './TimeSelect';
import { Avatar } from './Avatar';
import { assignableUsers, usePeople } from '../sync/people';
import { useSession } from '../sync/session';
import { canTrackProgress, fromMinutes, toMinutes, todayISO } from '../utils';

/** Giá trị điền sẵn khi tạo việc (ví dụ bấm vào một ô trên lịch) */
export interface TaskDefaults {
  dueDate?: string;
  /** null = cả ngày */
  startTime?: string | null;
}

/** Mốc giờ 24h cách nhau 15 phút: 00:00 ... 23:45 */
const QUARTERS = Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15));
const LAST = '23:59';

/** Thêm giá trị hiện tại vào danh sách nếu nó không nằm đúng mốc 15 phút (dữ liệu cũ) */
function withValue(list: string[], v: string) {
  return !v || list.includes(v) ? list : [...list, v].sort();
}

function nextHour() {
  const d = new Date();
  return fromMinutes(Math.min((d.getHours() + 1) * 60, 23 * 60));
}

interface Props {
  taskId: string | null;
  defaultColumnId: string;
  defaults?: TaskDefaults;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function TaskModal({ taskId, defaultColumnId, defaults, onClose, onDelete }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const task = useBoard((s) => (taskId ? s.tasks[taskId] : undefined));
  const currentColumnId = columns.find((c) => taskId && c.taskIds.includes(taskId))?.id ?? defaultColumnId;

  const [title, setTitle] = useState(task?.title ?? '');
  const [note, setNote] = useState(task?.note ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  // Việc mới: mặc định hôm nay, giờ tròn kế tiếp, kéo dài 1 tiếng
  const initStart = task ? (task.startTime ?? null) : defaults?.startTime !== undefined ? defaults.startTime : nextHour();
  const [dueDate, setDueDate] = useState(task ? (task.dueDate ?? '') : (defaults?.dueDate ?? todayISO()));
  const [allDay, setAllDay] = useState(initStart === null);
  const [startTime, setStartTime] = useState(initStart ?? nextHour());
  const [endTime, setEndTime] = useState(
    task?.endTime ?? fromMinutes(toMinutes(initStart ?? nextHour()) + 60),
  );
  const [timeError, setTimeError] = useState('');
  const changeStart = (v: string) => {
    // Dời giờ kết thúc theo, giữ nguyên thời lượng
    const len = Math.max(toMinutes(endTime) - toMinutes(startTime), 15);
    setEndTime(fromMinutes(Math.max(toMinutes(v) + len, toMinutes(v) + 1)));
    setStartTime(v);
    setTimeError('');
  };

  // Giờ kết thúc chỉ cho chọn sau giờ bắt đầu, kèm thời lượng để dễ nhìn
  const duration = (from: string, to: string) => {
    const m = toMinutes(to) - toMinutes(from) + (to === LAST ? 1 : 0);
    if (m < 60) return t('time.min', { n: m });
    return t('time.hour', { n: new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 }).format(m / 60) });
  };
  const startOptions = useMemo(() => withValue(QUARTERS, startTime), [startTime]);
  const endOptions = useMemo(
    () => withValue([...QUARTERS.filter((x) => x > startTime), LAST], endTime).filter((x) => x > startTime),
    [startTime, endTime],
  );
  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [columnId, setColumnId] = useState(currentColumnId);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(task?.progress ?? 0);
  const [assignees, setAssignees] = useState<string[]>(task?.assignees ?? []);

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
    const timed = !!dueDate && !allDay && !!startTime;
    if (timed && endTime && toMinutes(endTime) <= toMinutes(startTime)) {
      setTimeError(t('modal.timeError'));
      return;
    }
    const s = useBoard.getState();
    const data = {
      title: title.trim(),
      note: note.trim(),
      priority,
      dueDate: dueDate || null,
      startTime: timed ? startTime : null,
      endTime: timed && endTime ? endTime : null,
      ...(canTrackProgress(columns.find((c) => c.id === columnId)) ? { progress } : {}),
      assignees,
      // Lấy luôn nhãn đang gõ dở chưa nhấn Enter
      tags: addTag(tags, tagDraft, tags),
    };
    if (task) {
      s.updateTask(task.id, data);
      toast.success('toast.taskUpdated', { title: data.title });
      if (columnId !== currentColumnId) {
        const target = s.columns.find((c) => c.id === columnId);
        s.moveTask(task.id, columnId, target ? target.taskIds.length : 0);
      }
    } else {
      s.addTask(columnId, data);
      toast.success('toast.taskAdded', { title: data.title });
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
          <div className="time-head">
            <span>{t('modal.time')}</span>
            <label className="check time-allday">
              <input
                type="checkbox"
                id="task-allday"
                checked={allDay}
                disabled={!dueDate}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  setTimeError('');
                }}
              />
              {t('modal.allDay')}
            </label>
          </div>
          <div className="time-row">
            <TimeSelect
              id="task-start"
              label={t('modal.start')}
              value={startTime}
              disabled={!dueDate || allDay}
              options={startOptions.map((x) => ({ value: x }))}
              onChange={changeStart}
            />
            <span className="time-sep" aria-hidden="true">→</span>
            <TimeSelect
              id="task-end"
              label={t('modal.end')}
              value={endTime}
              disabled={!dueDate || allDay}
              options={endOptions.map((x) => ({ value: x, hint: duration(startTime, x) }))}
              onChange={(v) => {
                setEndTime(v);
                setTimeError('');
              }}
            />
          </div>
          {!dueDate && <small className="hint">{t('modal.timeNeedsDate')}</small>}
          {timeError && <small className="error">{timeError}</small>}
        </div>

        <ProgressField
          column={columns.find((c) => c.id === columnId)}
          value={progress}
          onChange={setProgress}
        />

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

        <AssigneePicker value={assignees} onChange={setAssignees} />

        <div className="field">
          <label htmlFor="task-tags">
            <span>{t('modal.tags')}</span>
          </label>
          <TagPicker value={tags} onChange={setTags} draft={tagDraft} onDraftChange={setTagDraft} />
        </div>

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

const STEPS = [0, 25, 50, 75, 100];

/** Tiến độ: chỉnh được khi việc không nằm ở cột Cần làm / Hoàn thành */
function ProgressField({ column, value, onChange }: { column: Column | undefined; value: number; onChange: (v: number) => void }) {
  const t = useT();
  const editable = canTrackProgress(column);
  const shown = column?.isDone ? 100 : editable ? value : 0;
  return (
    <div className="field">
      <div className="time-head">
        <span>{t('progress.label')}</span>
        <span className="progress-num">{shown}%</span>
      </div>
      <div className={`progress-field${editable ? '' : ' is-locked'}`}>
        <input
          id="task-progress"
          type="range"
          min={0}
          max={100}
          step={5}
          value={shown}
          disabled={!editable}
          aria-label={t('progress.label')}
          style={{ '--p': `${shown}%` } as CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className="progress-steps">
          {STEPS.map((v) => (
            <button key={v} type="button" disabled={!editable} className={shown === v ? 'on' : ''} onClick={() => onChange(v)}>
              {v}%
            </button>
          ))}
        </div>
      </div>
      {!editable && <small className="hint">{column?.isDone ? t('progress.doneHint') : t('progress.todoHint')}</small>}
    </div>
  );
}

/** Chọn người liên quan: thành viên dự án ở bảng dự án; bảng cá nhân chỉ có chính mình */
function AssigneePicker({ value, onChange }: { value: string[]; onChange: (v: (prev: string[]) => string[]) => void }) {
  const t = useT();
  const me = useSession((s) => s.user);
  const board = useSession((s) => s.board);
  const people = usePeople();
  const options = assignableUsers(me, board, people);
  // Giữ cả người đã gắn trước đây dù giờ không còn trong danh sách (để có thể bỏ ra)
  const known = new Map(options.map((u) => [u.id, u]));
  const extra = value.filter((id) => !known.has(id));
  // Cập nhật theo giá trị mới nhất để bấm nhanh nhiều người liền vẫn đúng
  const toggle = (id: string) => onChange((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <div className="field">
      <span>{t('modal.assignees')}</span>
      {options.length === 0 && extra.length === 0 ? (
        <small className="hint">{t('modal.assigneesNone')}</small>
      ) : (
        <div className="assignee-list" role="group" aria-label={t('modal.assignees')}>
          {options.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`assignee${value.includes(u.id) ? ' on' : ''}`}
              aria-pressed={value.includes(u.id)}
              onClick={() => toggle(u.id)}
            >
              <Avatar user={u} size={22} />
              <span>{u.id === me?.id ? `${u.name || u.email} (${t('modal.you')})` : u.name || u.email}</span>
            </button>
          ))}
          {extra.map((id) => (
            <button key={id} type="button" className="assignee on is-unknown" aria-pressed onClick={() => toggle(id)}>
              <span>?</span>
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && <small className="hint">{board ? t('modal.assigneesHintProject') : t('modal.assigneesHintPersonal')}</small>}
    </div>
  );
}
