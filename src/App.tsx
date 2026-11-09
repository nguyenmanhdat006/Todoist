import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard } from './store/board';
import type { PriorityFilter, Task } from './types';
import { PRIORITY } from './types';
import { fold, isOverdue } from './utils';
import { Board } from './components/Board';
import { ListView } from './components/ListView';
import { TaskModal } from './components/TaskModal';
import { SettingsMenu, Toast, type ToastData } from './components/Extras';
import { HelpButton, ProgressRing, ThemeSwitch } from './components/TopbarWidgets';

const FILTERS: { id: PriorityFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'high', label: PRIORITY.high.label },
  { id: 'overdue', label: 'Quá hạn' },
];

export default function App() {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const theme = useBoard((s) => s.theme);
  const view = useBoard((s) => s.view);
  const setView = useBoard((s) => s.setView);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PriorityFilter>('all');
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

  const doneIds = useMemo(() => new Set(columns.filter((c) => c.isDone).flatMap((c) => c.taskIds)), [columns]);

  const matches = useMemo(() => {
    const q = fold(query.trim());
    return (t: Task) => {
      if (filter === 'overdue' && !isOverdue(t.dueDate, doneIds.has(t.id))) return false;
      if (filter !== 'all' && filter !== 'overdue' && t.priority !== filter) return false;
      if (!q) return true;
      return fold(`${t.title} ${t.note} ${t.tags.join(' ')}`).includes(q);
    };
  }, [query, filter, doneIds]);

  const stats = useMemo(() => {
    const all = Object.values(tasks);
    return {
      total: all.length,
      done: all.filter((t) => doneIds.has(t.id)).length,
      open: all.filter((t) => !doneIds.has(t.id)).length,
      overdue: all.filter((t) => isOverdue(t.dueDate, doneIds.has(t.id))).length,
      high: all.filter((t) => t.priority === 'high' && !doneIds.has(t.id)).length,
    };
  }, [tasks, doneIds]);

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    [],
  );

  const openCreate = useCallback(() => {
    const first = useBoard.getState().columns.find((c) => !c.isDone) ?? useBoard.getState().columns[0];
    if (first) setModal({ taskId: null, columnId: first.id });
  }, []);

  // Phím tắt: N = việc mới, / = tìm kiếm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (modal || e.ctrlKey || e.metaKey || e.altKey) return;
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
  }, [modal, openCreate]);

  const deleteTask = (id: string) => {
    const s = useBoard.getState();
    const prev = s.snapshot();
    const title = s.tasks[id]?.title ?? '';
    s.deleteTask(id);
    setModal(null);
    showToast({ message: `Đã xoá “${title}”.`, onUndo: () => useBoard.getState().restore(prev) });
  };

  const deleteColumn = (id: string) => {
    const s = useBoard.getState();
    const prev = s.snapshot();
    const col = s.columns.find((c) => c.id === id);
    s.deleteColumn(id);
    showToast({ message: `Đã xoá cột “${col?.title ?? ''}”.`, onUndo: () => useBoard.getState().restore(prev) });
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
          <nav className="nav" aria-label="Kiểu xem">
            <button type="button" className={view === 'kanban' ? 'on' : ''} aria-current={view === 'kanban' ? 'page' : undefined} onClick={() => setView('kanban')}>
              Bảng
            </button>
            <button type="button" className={view === 'list' ? 'on' : ''} aria-current={view === 'list' ? 'page' : undefined} onClick={() => setView('list')}>
              Danh sách
            </button>
          </nav>
          <div className="topbar-right">
            <ProgressRing done={stats.done} total={stats.total} />
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
            <h1>Công việc</h1>
          </div>
          <div className="toolbar-stats" aria-label="Thống kê">
            <span>
              <b>{stats.open}</b> đang mở
            </span>
            <span>
              <b>{stats.done}</b> đã xong
            </span>
            {stats.overdue > 0 && (
              <button type="button" className="stat-overdue" onClick={() => setFilter('overdue')}>
                <b>{stats.overdue}</b> quá hạn
              </button>
            )}
          </div>
          <button type="button" className="btn primary create" onClick={openCreate}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Tạo việc
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
              placeholder="Tìm việc, ghi chú, nhãn…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            />
            <kbd className="search-kbd">/</kbd>
          </div>
          <div className="seg-filter" role="group" aria-label="Bộ lọc">
            {FILTERS.map((f) => {
              const n = f.id === 'high' ? stats.high : f.id === 'overdue' ? stats.overdue : stats.total;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={filter === f.id ? 'on' : ''}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className={'seg-count' + (f.id === 'overdue' && n > 0 ? ' is-alert' : '')}>{n}</span>
                </button>
              );
            })}
          </div>
          {(query || filter !== 'all') && (
            <button
              type="button"
              className="clear-filter"
              onClick={() => {
                setQuery('');
                setFilter('all');
              }}
            >
              Xoá bộ lọc
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
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
