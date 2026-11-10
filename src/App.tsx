import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstOpenColumn, useBoard } from './store/board';
import type { SavedFilter, Task } from './types';
import { useT } from './i18n';
import { fold, isOverdue, matchesFilter } from './utils';
import { Board } from './components/Board';
import { ListView } from './components/ListView';
import { TaskModal, type TaskDefaults } from './components/TaskModal';
import { CalendarView } from './components/CalendarView';
import { SettingsMenu, type ToastData } from './components/Extras';
import { showToast as showToastMsg } from './toast';
import { findSampleTaskIds } from './data/legacySample';
import { HelpButton, LangSwitch, ProgressRing, ThemeSwitch } from './components/TopbarWidgets';
import { NotificationBell } from './components/NotificationBell';
import { AccountMenu } from './components/AccountMenu';
import { FriendsButton, SidebarToggle } from './components/Social';
import { boardInfo, projectOfBoard, refreshPeople, usePeople } from './sync/people';
import { TitleClock } from './components/Clock';
import { HeroAside } from './components/HeroAside';
import { switchBoard, useSession } from './sync/session';
import { loadOverview, useOverview, useScopedEntries } from './sync/overview';
import { ScopeSelect } from './components/Social';
import { FilterEditor, filterName } from './components/FilterEditor';

const purgedBoards = new Set<string>();

export default function App() {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const theme = useBoard((s) => s.theme);
  const view = useBoard((s) => s.view);
  const filters = useBoard((s) => s.filters);
  const t = useT();

  const [query, setQuery] = useState('');
  /** 'all' hoặc id của bộ lọc đã lưu */
  const [filter, setFilter] = useState<string>('all');
  /** undefined = đóng, null = tạo mới, SavedFilter = đang sửa */
  const [editing, setEditing] = useState<SavedFilter | null | undefined>(undefined);
  const [modal, setModal] = useState<{ taskId: string | null; columnId: string; defaults?: TaskDefaults } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback(
    (x: Omit<ToastData, 'id'>) => showToastMsg(x.message, x.onUndo ? { onAction: x.onUndo, ...(x.actionLabel ? { actionLabel: x.actionLabel } : {}) } : {}),
    [],
  );
  const closeModal = useCallback(() => setModal(null), []);

  // Thông báo từ phần đồng bộ (xung đột, hết phiên...) hiện bằng toast
  const notice = useSession((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    showToastMsg(t(notice.key), {
      kind: notice.key === 'sync.sessionExpired' ? 'error' : 'info',
      ...(notice.onAction && notice.actionKey ? { actionLabel: t(notice.actionKey), onAction: notice.onAction } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  // Bạn bè, dự án, thành viên: tải khi mở app, khi đổi bảng và mỗi phút
  const board = useSession((s) => s.board);
  useEffect(() => {
    void refreshPeople();
    const id = setInterval(() => void refreshPeople(), 60_000);
    return () => clearInterval(id);
  }, [board]);

  // Dọn việc mẫu mà bản cũ từng nạp sẵn (mỗi bảng chỉ dọn một lần, có thể hoàn tác)
  const switching = useSession((s) => s.switching);
  const allTasks = useBoard((s) => s.tasks);
  useEffect(() => {
    if (switching) return;
    const key = board ?? 'personal';
    if (purgedBoards.has(key)) return;
    const ids = findSampleTaskIds(allTasks);
    purgedBoards.add(key);
    if (ids.length === 0) return;
    const st = useBoard.getState();
    const prev = st.snapshot();
    ids.forEach((id) => st.deleteTask(id));
    showToastMsg(t('toast.sampleRemoved', { n: ids.length }), {
      kind: 'info',
      onAction: () => useBoard.getState().restore(prev),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, switching, allTasks]);
  // Danh sách và Lịch hiển thị việc của mọi bảng; Bảng chỉ hiện bảng đang mở
  const scope = useOverview((s) => s.scope);
  const aggregate = view !== 'kanban';
  // Tiêu đề trang: "Dự án · Bảng" khi đang ở bảng dự án
  const projects = usePeople((s) => s.projects);
  // Chưa chọn bảng = bảng cá nhân mặc định (id = id người dùng), nằm trong dự án cá nhân
  const me = useSession((s) => s.user);
  const activeBoard = board ?? me?.id ?? null;
  const curProject = projectOfBoard(activeBoard, projects);
  const curBoard = boardInfo(activeBoard, projects);
  const boardTitle = curProject ? (curProject.boards.length > 1 && curBoard ? `${curProject.name} · ${curBoard.name}` : curProject.name) : undefined;
  const scopeProject = scope.startsWith('p:') ? projects.find((p) => p.id === scope.slice(2)) : undefined;
  const scopeBoard = scope.startsWith('b:') ? projects.flatMap((p) => p.boards.map((b) => ({ p, b }))).find((x) => x.b.id === scope.slice(2)) : undefined;
  const projectName = aggregate
    ? scopeBoard
      ? `${scopeBoard.p.name} · ${scopeBoard.b.name}`
      : scopeProject
        ? scopeProject.name
        : t('scope.allTitle')
    : boardTitle;

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = t.lang;
    document.title = t('app.name');
  }, [t.lang]);

  // Tự chuyển việc quá hạn vào cột Quá hạn: khi mở app, khi dữ liệu đổi, và mỗi phút (để bắt sang ngày mới)
  useEffect(() => {
    useBoard.getState().syncOverdue();
  }, [tasks]);
  useEffect(() => {
    const id = setInterval(() => useBoard.getState().syncOverdue(), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // done / colId: dùng cho việc ở bảng khác (không có trong dữ liệu bảng đang mở)
  const inFilter = useCallback(
    (task: Task, f: SavedFilter | undefined, done?: boolean, colId?: string) =>
      !f || matchesFilter(task, f, done ?? doneIds.has(task.id), colId ?? columnOfTask.get(task.id)),
    [doneIds, columnOfTask],
  );

  const matches = useMemo(() => {
    const q = fold(query.trim());
    return (task: Task, done?: boolean, colId?: string) => {
      if (!inFilter(task, activeFilter, done, colId)) return false;
      if (!q) return true;
      return fold(`${task.title} ${task.note} ${task.tags.join(' ')}`).includes(q);
    };
  }, [query, activeFilter, inFilter]);

  // Danh sách và Lịch hiển thị việc của mọi bảng (theo phạm vi chọn); Bảng chỉ hiện bảng đang mở
  const scoped = useScopedEntries();
  const pool = useMemo(
    () =>
      aggregate
        ? scoped.map((e) => ({ task: e.task, done: e.col.isDone, colId: e.col.id }))
        : Object.values(tasks).map((t) => ({ task: t, done: doneIds.has(t.id), colId: columnOfTask.get(t.id) })),
    [aggregate, scoped, tasks, doneIds, columnOfTask],
  );

  const filterCounts = useMemo(
    () => new Map(filters.map((f) => [f.id, pool.filter((x) => inFilter(x.task, f, x.done, x.colId)).length])),
    [pool, filters, inFilter],
  );

  const stats = useMemo(
    () => ({
      total: pool.length,
      done: pool.filter((x) => x.done).length,
      open: pool.filter((x) => !x.done).length,
      overdue: pool.filter((x) => isOverdue(x.task.dueDate, x.done)).length,
    }),
    [pool],
  );

  // Nạp việc của các bảng khác khi xem Danh sách / Lịch; làm mới mỗi phút và khi đổi bảng
  useEffect(() => {
    if (!aggregate) return;
    void loadOverview();
    const id = setInterval(() => void loadOverview(), 60_000);
    return () => clearInterval(id);
  }, [aggregate, board]);


  // Bấm việc ở trang Danh sách / Lịch: việc ở bảng khác thì mở bảng đó trước (để sửa được), rồi mở việc
  const openTaskIn = useCallback(
    async (id: string, boardId?: string) => {
      const st = useSession.getState();
      const current = st.board ?? st.user?.id ?? null;
      if (boardId && boardId !== current) {
        const ok = await switchBoard(boardId, () => window.confirm(t('sync.logoutConfirm')));
        if (!ok) return;
        void refreshPeople();
      }
      setModal({ taskId: id, columnId: '' });
    },
    [t],
  );

  const openCreate = useCallback((defaults?: TaskDefaults) => {
    const cols = useBoard.getState().columns;
    const first = firstOpenColumn(cols) ?? cols[0];
    if (first) setModal({ taskId: null, columnId: first.id, defaults });
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
    <div className={`app view-${view}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <SidebarToggle />
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <rect x="2.5" y="3" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="8" y="3" width="4" height="9" rx="1.2" fill="currentColor" opacity=".8" />
                <rect x="13.5" y="3" width="4" height="11.5" rx="1.2" fill="currentColor" opacity=".6" />
              </svg>
            </span>
            <span className="brand-name">
              {t('app.name')}
            </span>
          </div>
          <div className="topbar-right">
            <ProgressRing done={stats.done} total={stats.total} />
            <LangSwitch />
            <ThemeSwitch />
            <FriendsButton />
            <NotificationBell onOpenTask={(id) => setModal({ taskId: id, columnId: '' })} onToast={showToast} />
            <SettingsMenu onToast={showToast} />
            <HelpButton />
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="toolbar">
        <div className="toolbar-top hero">
          <TitleClock locale={t.locale} title={projectName ?? t('page.title')} clockLabel={t('clock.label')} />
          <div className="stat-tiles" aria-label={t('stats.label')}>
            <div className="stat-tile tone-open">
              <span className="stat-label">{t('stats.open')}</span>
              <span className="stat-value">{stats.open}</span>
            </div>
            <div className="stat-tile tone-done">
              <span className="stat-label">{t('stats.done')}</span>
              <span className="stat-value">
                {stats.done}
                <span className="stat-of">/{stats.total}</span>
              </span>
              <span className="stat-bar" aria-hidden="true">
                <i style={{ width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }} />
              </span>
            </div>
            <button
              type="button"
              className={'stat-tile tone-overdue' + (stats.overdue > 0 ? ' is-alert' : ' is-zero')}
              disabled={stats.overdue === 0}
              onClick={() => {
                const f = filters.find((x) => x.due === 'overdue');
                if (f) setFilter(f.id);
              }}
            >
              <span className="stat-label">{t('stats.overdue')}</span>
              <span className="stat-value">{stats.overdue}</span>
            </button>
          </div>
          <HeroAside onOpenTask={(id) => setModal({ taskId: id, columnId: '' })} />
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
          {aggregate && <ScopeSelect />}
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
          <button type="button" className="btn primary create" onClick={() => openCreate()}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t('create')}
            <kbd className="btn-kbd">N</kbd>
          </button>
        </div>
      </div>

      <main className="main">
        {view === 'kanban' ? (
          <Board
            matches={matches}
            onOpenTask={(id) => setModal({ taskId: id, columnId: '' })}
            onDeleteColumn={deleteColumn}
          />
        ) : view === 'calendar' ? (
          <CalendarView
            matches={matches}
            onOpenTask={(id, boardId) => void openTaskIn(id, boardId)}
            onCreateAt={(date, time) => openCreate({ dueDate: date, startTime: time })}
          />
        ) : (
          <ListView matches={matches} filtering={!!query.trim() || filter !== 'all'} onOpenTask={(id, boardId) => void openTaskIn(id, boardId)} />
        )}
      </main>

      {modal && (
        <TaskModal
          key={modal.taskId ?? 'new'}
          taskId={modal.taskId}
          defaultColumnId={modal.columnId}
          defaults={modal.defaults}
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
    </div>
  );
}
