import { useEffect, useRef, useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CSSProperties } from 'react';
import type { Column, Task } from '../types';
import { COLUMN_COLORS } from '../types';
import { useBoard } from '../store/board';
import { SortableTaskCard } from './TaskCard';
import { useT } from '../i18n';

interface Props {
  column: Column;
  tasks: Task[];
  onOpenTask: (id: string) => void;
  onDeleteColumn: (id: string) => void;
}

export function ColumnHeader({
  column,
  count,
  handleProps,
  onAdd,
  onMenu,
}: {
  column: Column;
  count: number;
  handleProps?: Record<string, unknown>;
  onAdd?: () => void;
  onMenu?: () => void;
}) {
  const t = useT();
  return (
    <div className="col-head" style={{ '--col': column.color } as CSSProperties}>
      <div className="col-head-handle" {...handleProps}>
        <span className="col-dot" aria-hidden="true" />
        <span className="col-title">{column.title}</span>
        <span className="col-count">{count}</span>
      </div>
      {onMenu && (
        <button type="button" className="col-icon" onClick={onMenu} aria-label={t('col.menu', { title: column.title })}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="3" cy="8" r="1.5" fill="currentColor" />
            <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            <circle cx="13" cy="8" r="1.5" fill="currentColor" />
          </svg>
        </button>
      )}
      {onAdd && (
        <button type="button" className="col-add" onClick={onAdd} aria-label={t('col.addTask', { title: column.title })}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

function ColumnMenu({ column, onClose, onDelete }: { column: Column; onClose: () => void; onDelete: () => void }) {
  const t = useT();
  const updateColumn = useBoard((s) => s.updateColumn);
  const canDelete = useBoard((s) => s.columns.length > 1);
  const [title, setTitle] = useState(column.title);
  const cardMode = column.cardColor ?? 'status';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== column.title) updateColumn(column.id, { title: t });
  };

  return (
    <div className="popover col-menu" ref={ref} role="dialog" aria-label={t('col.menuDialog')}>
      <label className="field">
        <span>{t('col.name')}</span>
        <input
          id={`col-title-${column.id}`}
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              saveTitle();
              onClose();
            }
          }}
        />
      </label>
      <div className="field">
        <span>{t('col.color')}</span>
        <div className="swatches">
          {COLUMN_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={`swatch${c.hex === column.color ? ' on' : ''}`}
              style={{ background: c.hex }}
              title={t(`color.${c.key}`)}
              aria-label={t(`color.${c.key}`)}
              onClick={() => updateColumn(column.id, { color: c.hex })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <span>{t('col.cardColor')}</span>
        <div className="swatches">
          <button
            type="button"
            className={`swatch is-status${cardMode === 'status' ? ' on' : ''}`}
            title={t('col.cardStatus')}
            aria-label={t('col.cardStatus')}
            onClick={() => updateColumn(column.id, { cardColor: 'status' })}
          />
          <button
            type="button"
            className={`swatch is-none${cardMode === 'none' ? ' on' : ''}`}
            title={t('col.cardNone')}
            aria-label={t('col.cardNone')}
            onClick={() => updateColumn(column.id, { cardColor: 'none' })}
          />
          {COLUMN_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={`swatch${c.hex === cardMode ? ' on' : ''}`}
              style={{ background: c.hex }}
              title={t(`color.${c.key}`)}
              aria-label={`${t('col.cardColor')}: ${t(`color.${c.key}`)}`}
              onClick={() => updateColumn(column.id, { cardColor: c.hex })}
            />
          ))}
        </div>
        <small className="hint">
          {cardMode === 'status' ? t('col.cardStatusHint') : cardMode === 'none' ? t('col.cardNone') : t('col.cardFixedHint')}
        </small>
      </div>
      {!column.builtin && (
        <label className="check">
          <input
            type="checkbox"
            checked={column.isDone}
            onChange={(e) => updateColumn(column.id, { isDone: e.target.checked })}
          />
          <span>{t('col.isDone')}</span>
        </label>
      )}
      {canDelete && !column.builtin && (
        <button type="button" className="btn danger-ghost" onClick={onDelete}>
          {column.taskIds.length > 0 ? t('col.deleteWith', { n: column.taskIds.length }) : t('col.delete')}
        </button>
      )}
    </div>
  );
}

function QuickAdd({ columnId, onDone }: { columnId: string; onDone: () => void }) {
  const t = useT();
  const addTask = useBoard((s) => s.addTask);
  const [value, setValue] = useState('');
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        addTask(columnId, { title: value });
        setValue('');
      }}
    >
      <input
        id={`quick-add-${columnId}`}
        autoFocus
        placeholder={t('col.quickAdd')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        onBlur={() => !value.trim() && onDone()}
      />
    </form>
  );
}

export function ColumnView({ column, tasks, onOpenTask, onDeleteColumn }: Props) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  });

  return (
    <section
      ref={setNodeRef}
      className={`column${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={column.title}
    >
      <div className="col-head-wrap">
        <ColumnHeader
          column={column}
          count={tasks.length}
          handleProps={{
            ref: setActivatorNodeRef,
            ...attributes,
            ...listeners,
            'aria-label': t('col.drag', { title: column.title }),
          }}
          onMenu={() => setMenuOpen((v) => !v)}
          onAdd={() => setAdding(true)}
        />
        {menuOpen && (
          <ColumnMenu
            column={column}
            onClose={() => setMenuOpen(false)}
            onDelete={() => {
              setMenuOpen(false);
              onDeleteColumn(column.id);
            }}
          />
        )}
      </div>

      <div className="col-body">
        {adding && <QuickAdd columnId={column.id} onDone={() => setAdding(false)} />}
        <SortableContext items={tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          <div className="cards">
            {tasks.map((x) => (
              <SortableTaskCard
                key={x.id}
                task={x}
                columnId={column.id}
                done={column.isDone}
                color={column.color}
                onOpen={onOpenTask}
              />
            ))}
            {tasks.length === 0 && !adding && (
              <button type="button" className="col-empty" onClick={() => setAdding(true)}>
                {t('col.empty')}
              </button>
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}
