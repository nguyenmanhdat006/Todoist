import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from './store/board';
import type { SavedFilter, Task } from './types';
import { useT } from './i18n';
import { fold, isOverdue, matchesFilter } from './utils';
import { Board } from './components/Board';
import { ListView } from './components/ListView';
import { TaskModal } from './components/TaskModal';
import { SettingsMenu, Toast, type ToastData } from './components/Extras';
import { HelpButton, LangSwitch, ProgressRing, ThemeSwitch } from './components/TopbarWidgets';
import { FilterEditor, filterName } from './components/FilterEditor';

export default function App() {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const theme = useBoard((s) => s.theme);
  const view = useBoard((s) => s.view);
  const setView = useBoard((s) => s.setView);
  const filters = useBoard((s) => s.filters);
  const t = useT();

  const [query, setQuery] = useState('');
  /** 'all' hoặc id của bộ lọc đã lưu */
  const [filter, setFilter] = useState<string>('all');
  /** undefined = đóng, null = tạo mới, SavedFilter = đang sửa */
  const [editing, setEditing] = useState<SavedFilter | null | undefined>(undefined);
  const [modal, setModal] = useState<{ taskId: string | null; columnId: string } | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((t: Omit<ToastData, 'id'>) => setToast({ ...t, id: Date.now() }), []);
  const closeToast = useCallback(() => setToast(null), []);
  const closeModal = useCallback(() => setModal(null), []);

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = t.lang;
  }, [t.lang]);

  const doneIds = useMemo(() => new Set(columns.filter((c) => c.isDone).flatMap((c) => c.taskIds)), [columns]);

  const columnOfTask = useMemo(() => {
    const m = new Map<string, string>();
    columns.forEach((c) => c.taskIds.forEach((id) => m.set(id, c.id)));
    return m;
  }, [columns]);

  const activeFilter = filters.find((f) => f.id === filter);
  // Bộ lọc đang chọn bị xoá thì quay về "Tất cả"
  useEffect(() => {
    if (filter !== 'all' && !activeFilter) setFilter('all');
  }, [filter, activeFilter]);

  const inFilter = useCallback(
    (task: Task, f: SavedFilter | undefined) =>
      !f || matchesFilter(task, f, doneIds.has(task.id), columnOfTask.get(task.id)),
    [doneIds, columnOfTask],
  );

  const matches = useMemo(() => {
    const q = fold(query.trim());
    return (task: Task) => {
      if (!inFilter(task, activeFilter)) return false;
      if (!q) return true;
      return fold(`${task.title} ${task.note} ${task.tags.join(' ')}`).includes(q);
    };
  }, [query, activeFilter, inFilter]);

  const filterCounts = useMemo(() => {
    const all = Object.values(tasks);
    return new Map(filters.map((f) => [f.id, all.filter((x) => inFilter(x, f)).length]));
  }, [tasks, filters, inFilter]);

  const stats = useMemo(() => {
    const all = Object.values(tasks);
    return {
      total: all.length,
      done: all.filter((t) => doneIds.has(t.id)).length,
      open: all.filter((t) => !doneIds.has(t.id)).length,
      overdue: all.filter((t) => isOverdue(t.dueDate, doneIds.has(t.id))).length,
    };
  }, [tasks, doneIds]);

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    [t],
  );

  const openCreate = useCallback(() => {
    const first = useBoard.getState().columns.find((c) => !c.isDone) ?? useBoard.getState().columns[0];
    if (first) setModal({ taskId: null, columnId: first.id });
  }, []);

  // Phím tắt: N = việc mới, / = tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (modal || editing !== undefined || e.ctrlKey || e.metaKey || e.altKey) return;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openCreate();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, editing, openCreate]);

  const deleteTask = (id: string) => {
    const s = useBoard.getState();
    const prev = s.snapshot();
    const title = s.tasks[id]?.title ?? '';
    s.deleteTask(id);
    setModal(null);
    showToast({ message: t('toast.taskDeleted', { title }), onUndo: () => useBoard.getState().restore(prev) });
  };

  const deleteFilter = (id: string) => {
    const s = useBoard.getState();
    const prev = s.filters;
    const f = prev.find((x) => x.id === id);
    s.deleteFilter(id);
    setEditing(undefined);
    showToast({
      message: t('toast.filterDeleted', { name: f ? filterName(f, t) : '' }),
      onUndo: () => useBoard.getState().setFilters(prev),
    });
  };

  const deleteColumn = (id: string) => {
    const s = useBoard.getState();
    const prev = s.snapshot();
    const col = s.columns.find((c) => c.id === id);
    s.deleteColumn(id);
    showToast({ message: t('toast.columnDeleted', { title: col?.title ?? '' }), onUndo: () => useBoard.getState().restore(prev) });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <rect x="2.5" y="3" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="8" y="3" width="4" height="9" rx="1.2" fill="currentColor" opacity=".8" />
                <rect x="13.5" y="3" width="4" height="11.5" rx="1.2" fill="currentColor" opacity=".6" />
              </svg>
            </span>
            <span className="brand-name">
              Kanban<span className="brand-sub">/todo</span>
            </span>
          </div>
          <nav className="nav" aria-label={t('nav.label')}>
            <button type="button" className={view === 'kanban' ? 'on' : ''} aria-current={view === 'kanban' ? 'page' : undefined} onClick={() => setView('kanban')}>
              {t('nav.board')}
            </button>
            <button type="button" className={view === 'list' ? 'on' : ''} aria-current={view === 'list' ? 'page' : undefined} onClick={() => setView('list')}>
              {t('nav.list')}
            </button>
          </nav>
          <div className="topbar-right">
            <ProgressRing done={stats.done} total={stats.total} />
            <LangSwitch />
            <ThemeSwitch />
            <SettingsMenu onToast={showToast} />
            <HelpButton />
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-top">
          <div className="toolbar-title">
            <span className="eyebrow">{todayLabel}</span>
            <h1>{t('page.title')}</h1>
          </div>
          <div className="toolbar-stats" aria-label={t('stats.label')}>
            <span>
              <b>{stats.open}</b> {t('stats.open')}
            </span>
            <span>
              <b>{stats.done}</b> {t('stats.done')}
            </span>
            {stats.overdue > 0 && (
              <button
                type="button"
                className="stat-overdue"
                onClick={() => {
                  const f = filters.find((x) => x.due === 'overdue');
                  if (f) setFilter(f.id);
                }}
              >
                <b>{stats.overdue}</b> {t('stats.overdue')}
              </button>
            )}
          </div>
          <button type="button" className="btn primary create" onClick={openCreate}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t('create')}
            <kbd className="btn-kbd">N</kbd>
          </button>
        </div>

        <div className="filterbar">
          <div className="search">
            <svg className="search-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
            <input
              ref={searchRef}
              id="search"
              type="search"
              placeholder={t('search.placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            />
            <kbd className="search-kbd">/</kbd>
          </div>
          <div className="seg-filter" role="group" aria-label={t('filter.label')}>
            <button
              type="button"
              className={filter === 'all' ? 'on' : ''}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              {t('filter.all')}
              <span className="seg-count">{stats.total}</span>
            </button>
            {filters.map((f) => {
              const n = filterCounts.get(f.id) ?? 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={filter === f.id ? 'on' : ''}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  onDoubleClick={() => setEditing(f)}
                  title={t('filter.edit')}
                >
                  {filterName(f, t)}
                  <span className={'seg-count' + (f.due === 'overdue' && n > 0 ? ' is-alert' : '')}>{n}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="seg-add"
              aria-label={t('filter.add')}
              title={t('filter.add')}
              onClick={() => setEditing(null)}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {activeFilter && (
            <button type="button" className="filter-edit" onClick={() => setEditing(activeFilter)}>
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                <path d="M10.5 2.5l3 3L6 13H3v-3z" />
              </svg>
              {t('filter.edit')}
            </button>
          )}
          {(query || filter !== 'all') && (
            <button
              type="button"
              className="clear-filter"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      </div>

      <main className="main">
        {view === 'kanban' ? (
          <Board
            matches={matches}
            onOpenTask={(id) => setModal({ taskId: id, columnId: '' })}
            onDeleteColumn={deleteColumn}
          />
        ) : (
          <ListView matches={matches} onOpenTask={(id) => setModal({ taskId: id, columnId: '' })} />
        )}
      </main>

      {modal && (
        <TaskModal
          key={modal.taskId ?? 'new'}
          taskId={modal.taskId}
          defaultColumnId={modal.columnId}
          onClose={closeModal}
          onDelete={deleteTask}
        />
      )}
      {editing !== undefined && (
        <FilterEditor
          key={editing?.id ?? 'new'}
          filter={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(id) => {
            setEditing(undefined);
            setFilter(id);
          }}
          onDelete={deleteFilter}
        />
      )}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
