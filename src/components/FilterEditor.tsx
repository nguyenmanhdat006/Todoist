import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBoard } from '../store/board';
import type { DueRule, Priority, SavedFilter } from '../types';
import { PRIORITIES, tagColor } from '../types';
import { useT } from '../i18n';
import { matchesFilter } from '../utils';

const DUE_RULES: DueRule[] = ['any', 'overdue', 'today', 'week', 'none'];

interface Props {
  /** null = tạo bộ lọc mới */
  filter: SavedFilter | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDelete: (id: string) => void;
}

function toggle<T>(list: T[], v: T) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function filterName(f: SavedFilter, t: ReturnType<typeof useT>) {
  return f.name ?? (f.labelKey ? t(f.labelKey) : '');
}

export function FilterEditor({ filter, onClose, onSaved, onDelete }: Props) {
  const t = useT();
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);

  const [name, setName] = useState(filter ? filterName(filter, t) : '');
  const [priorities, setPriorities] = useState<Priority[]>(filter?.priorities ?? []);
  const [tags, setTags] = useState<string[]>(filter?.tags ?? []);
  const [columnIds, setColumnIds] = useState<string[]>(filter?.columnIds ?? []);
  const [due, setDue] = useState<DueRule>(filter?.due ?? 'any');
  const [hideDone, setHideDone] = useState(filter?.hideDone ?? true);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(tasks).forEach((x) => x.tags.forEach((g) => set.add(g)));
    tags.forEach((g) => set.add(g));
    return [...set].sort((a, b) => a.localeCompare(b, t.locale));
  }, [tasks, tags, t.locale]);

  const draft: SavedFilter = {
    id: filter?.id ?? '',
    name,
    priorities,
    tags,
    columnIds: columnIds.filter((id) => columns.some((c) => c.id === id)),
    due,
    hideDone,
  };

  const matchCount = useMemo(() => {
    let n = 0;
    for (const col of columns)
      for (const id of col.taskIds) {
        const task = tasks[id];
        if (task && matchesFilter(task, draft, col.isDone, col.id)) n++;
      }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, tasks, priorities, tags, columnIds, due, hideDone]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('filter.nameError'));
      return;
    }
    const s = useBoard.getState();
    const data = { ...draft, name: trimmed };
    if (filter) {
      // Giữ tên mặc định theo ngôn ngữ nếu người dùng không đổi tên
      const keepDefault = filter.name === null && trimmed === filterName(filter, t);
      s.updateFilter(filter.id, { ...data, name: keepDefault ? null : trimmed });
      onSaved(filter.id);
    } else {
      const { id: _id, ...rest } = data;
      onSaved(s.addFilter(rest));
    }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-modal-title"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <header className="modal-head">
          <h2 id="filter-modal-title">{filter ? t('filter.edit') : t('filter.new')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('modal.close')}>
            ✕
          </button>
        </header>

        <label className="field">
          <span>{t('filter.name')}</span>
          <input
            id="filter-name"
            autoFocus
            value={name}
            placeholder={t('filter.namePh')}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
          {error && <small className="error">{error}</small>}
        </label>

        <div className="field">
          <span>{t('filter.priority')}</span>
          <div className="opts">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`opt${priorities.includes(p) ? ' on' : ''}`}
                aria-pressed={priorities.includes(p)}
                onClick={() => setPriorities((v) => toggle(v, p))}
              >
                {t(`prio.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('filter.due')}</span>
          <div className="opts" role="radiogroup" aria-label={t('filter.due')}>
            {DUE_RULES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={due === r}
                className={`opt${due === r ? ' on' : ''}`}
                onClick={() => setDue(r)}
              >
                {t(`dueRule.${r}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>{t('filter.tags')}</span>
          {allTags.length === 0 ? (
            <p className="hint">{t('filter.noTags')}</p>
          ) : (
            <div className="opts">
              {allTags.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`opt${tags.includes(g) ? ' on' : ''}`}
                  aria-pressed={tags.includes(g)}
                  onClick={() => setTags((v) => toggle(v, g))}
                >
                  <span className="opt-dot" style={{ '--c': tagColor(g) } as CSSProperties} />
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span>{t('filter.columns')}</span>
          <div className="opts">
            {columns.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`opt${columnIds.includes(c.id) ? ' on' : ''}`}
                aria-pressed={columnIds.includes(c.id)}
                onClick={() => setColumnIds((v) => toggle(v, c.id))}
              >
                <span className="opt-dot" style={{ '--c': c.color } as CSSProperties} />
                {c.title}
              </button>
            ))}
          </div>
          <p className="hint">{t('filter.emptyHint')}</p>
        </div>

        <label className="check">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          <span>{t('filter.hideDone')}</span>
        </label>

        <footer className="modal-foot">
          {filter && (
            <button type="button" className="btn danger-ghost" onClick={() => onDelete(filter.id)}>
              {t('filter.delete')}
            </button>
          )}
          <span className="filter-count">{t('filter.matches', { n: matchCount })}</span>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('filter.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {t('filter.save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
