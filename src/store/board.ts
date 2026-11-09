import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BoardData, BuiltinColumn, CalMode, Reminder, Column, Lang, Priority, SavedFilter, Task, ThemeMode, ViewMode } from '../types';
import { BUILTIN_COLUMNS, PRESET_TAGS } from '../types';
import { addDaysISO, todayISO, uid } from '../utils';
import type { ImportData } from '../data/exchange';

export interface TaskInput {
  title: string;
  note?: string;
  priority?: Priority;
  dueDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tags?: string[];
}

/** Bản chụp để hoàn tác */
export interface Snapshot extends BoardData {
  filters?: SavedFilter[];
  reminders?: Reminder[];
}

interface BoardState extends BoardData {
  theme: ThemeMode;
  view: ViewMode;
  calMode: CalMode;
  /** Nhãn đang bị ẩn trên lịch; '' = việc không có nhãn */
  calHiddenTags: string[];
  reminders: Reminder[];
  lang: Lang;
  filters: SavedFilter[];

  addTask: (columnId: string, input: TaskInput, index?: number) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void;
  /** Di chuyển thẻ sang cột `toColumnId` tại vị trí `toIndex` (tính sau khi đã gỡ thẻ ra) */
  moveTask: (taskId: string, toColumnId: string, toIndex: number) => void;

  addColumn: (title: string, color: string) => void;
  updateColumn: (id: string, patch: Partial<Omit<Column, 'id' | 'taskIds'>>) => void;
  deleteColumn: (id: string) => void;
  moveColumn: (from: number, to: number) => void;

  snapshot: () => Snapshot;
  restore: (data: Snapshot) => void;
  /** Thay toàn bộ cột/việc (và bộ lọc, lời nhắc nếu file có) bằng dữ liệu đã kiểm tra */
  applyImport: (data: ImportData) => void;
  /** Tick hoàn thành: chuyển sang cột Hoàn thành, bỏ tick: về đầu cột mở đầu tiên */
  toggleDone: (taskId: string) => void;
  /** Chuyển việc quá hạn vào cột Quá hạn; việc đã hết quá hạn thì trả về cột cũ */
  syncOverdue: () => void;
  clearAll: () => void;
  loadDemo: () => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: ViewMode) => void;
  setCalMode: (m: CalMode) => void;
  setCalHiddenTags: (tags: string[]) => void;
  /** Tạo lời nhắc cho các việc sắp bắt đầu trong 1 tiếng tới; trả về các lời nhắc mới */
  checkReminders: () => Reminder[];
  markRemindersRead: () => void;
  setReminderRead: (id: string, read: boolean) => void;
  clearReminders: () => void;
  setLang: (l: Lang) => void;

  addFilter: (f: Omit<SavedFilter, 'id'>) => string;
  updateFilter: (id: string, patch: Partial<Omit<SavedFilter, 'id'>>) => void;
  deleteFilter: (id: string) => void;
  setFilters: (filters: SavedFilter[]) => void;
}

/** Nhắc trước khi việc bắt đầu 1 tiếng */
export const REMIND_BEFORE_MS = 60 * 60_000;

function makeTask(input: TaskInput): Task {
  const now = new Date().toISOString();
  return {
    id: uid('t'),
    title: input.title.trim(),
    note: input.note?.trim() ?? '',
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate ?? null,
    startTime: input.dueDate ? (input.startTime ?? null) : null,
    endTime: input.dueDate && input.startTime ? (input.endTime ?? null) : null,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    progress: 0,
  };
}

/** Ngôn ngữ mặc định khi chưa chọn: tiếng Việt */
export function detectLang(): Lang {
  return 'vi';
}

const DEMO = {
  vi: {
    tasks: [
      ['Kéo thẻ này sang cột khác thử xem', 'Đây là dữ liệu mẫu. Bấm vào thẻ để sửa, tick ô vuông để đánh dấu xong.'],
      ['Nộp báo cáo tuần', ''],
      ['Đặt lịch khám răng', ''],
      ['Học 15 từ tiếng Nhật', 'Bài 12 – Minna no Nihongo'],
      ['Làm slide thuyết trình', ''],
      ['Sửa CV gửi HR', ''],
      ['Thanh toán tiền điện', ''],
    ],
    tags: { work: 'Công việc', personal: 'Cá nhân', study: 'Học tập' },
    columns: ['Quá hạn', 'Cần làm', 'Đang làm', 'Chờ xem lại', 'Hoàn thành'],
  },
  en: {
    tasks: [
      ['Try dragging this card to another column', 'This is sample data. Click a card to edit it, tick the box to mark it done.'],
      ['Send the weekly report', ''],
      ['Book a dentist appointment', ''],
      ['Learn 15 Japanese words', 'Lesson 12 – Minna no Nihongo'],
      ['Finish the presentation slides', ''],
      ['Update CV for HR', ''],
      ['Pay the electricity bill', ''],
    ],
    tags: { work: 'Work', personal: 'Personal', study: 'Study' },
    columns: ['Overdue', 'To do', 'In progress', 'In review', 'Done'],
  },
} as const;

/** Bảng dịch chữ mặc định (cột, nhãn, việc mẫu) của mọi ngôn ngữ khác sang `to` */
function defaultTextTranslator(to: Lang) {
  const map = new Map<string, string>();
  const B = DEMO[to];
  for (const from of Object.keys(DEMO) as Lang[]) {
    if (from === to) continue;
    const A = DEMO[from];
    A.tasks.forEach(([title, note], i) => {
      map.set(title, B.tasks[i][0]);
      if (note) map.set(note, B.tasks[i][1]);
    });
    (Object.keys(A.tags) as (keyof typeof A.tags)[]).forEach((k) => map.set(A.tags[k], B.tags[k]));
    PRESET_TAGS.forEach((p) => map.set(p[from], p[to]));
    A.columns.forEach((c, i) => map.set(c, B.columns[i]));
  }
  return (text: string) => map.get(text) ?? text;
}

/**
 * Đưa tên cột, nhãn, việc mẫu còn giữ chữ mặc định về ngôn ngữ `lang`.
 * Chữ người dùng tự đặt không nằm trong bảng dịch nên giữ nguyên.
 */
function localizeDefaults(
  s: Pick<BoardState, 'tasks' | 'columns' | 'filters'>,
  lang: Lang,
): Pick<BoardState, 'tasks' | 'columns' | 'filters'> {
  const tr = defaultTextTranslator(lang);
  const tasks: Record<string, Task> = {};
  for (const [id, x] of Object.entries(s.tasks)) {
    tasks[id] = { ...x, title: tr(x.title), note: tr(x.note), tags: [...new Set(x.tags.map(tr))] };
  }
  return {
    tasks,
    columns: s.columns.map((c) => ({ ...c, title: tr(c.title) })),
    filters: s.filters.map((f) => ({ ...f, name: f.name === null ? null : tr(f.name), tags: [...new Set(f.tags.map(tr))] })),
  };
}

const BUILTIN_COLORS: Record<BuiltinColumn, string> = {
  overdue: '#f87171',
  todo: '#4f8ff7',
  doing: '#fb923c',
  review: '#a78bfa',
  done: '#4ade80',
};

function builtinColumn(key: BuiltinColumn, lang: Lang): Column {
  const i = BUILTIN_COLUMNS.indexOf(key);
  return { id: uid('c'), title: DEMO[lang].columns[i], color: BUILTIN_COLORS[key], isDone: key === 'done', taskIds: [], builtin: key };
}

/** Nhận diện cột mặc định trong dữ liệu cũ qua tên (ở bất kỳ ngôn ngữ nào) */
function builtinFromTitle(title: string): BuiltinColumn | undefined {
  for (const l of Object.keys(DEMO) as Lang[]) {
    const i = (DEMO[l].columns as readonly string[]).indexOf(title);
    if (i !== -1) return BUILTIN_COLUMNS[i];
  }
  return undefined;
}

/** Bảo đảm 4 cột mặc định luôn có mặt; thiếu cột nào thì thêm lại (rỗng) đúng thứ tự */
export function ensureBuiltins(columns: Column[], lang: Lang): Column[] {
  const taken = new Set(columns.map((c) => c.builtin).filter(Boolean));
  let cols = columns.map((c) => {
    if (c.builtin) return c;
    const k = builtinFromTitle(c.title);
    if (!k || taken.has(k)) return c;
    taken.add(k);
    return { ...c, builtin: k };
  });
  BUILTIN_COLUMNS.forEach((key, order) => {
    if (cols.some((c) => c.builtin === key)) return;
    // chèn ngay sau cột mặc định đứng trước nó (nếu có), ngược lại đặt lên đầu
    let at = 0;
    for (let j = order - 1; j >= 0; j--) {
      const idx = cols.findIndex((c) => c.builtin === BUILTIN_COLUMNS[j]);
      if (idx !== -1) {
        at = idx + 1;
        break;
      }
    }
    if (key === 'done' && at === 0) at = cols.length;
    cols = [...cols.slice(0, at), builtinColumn(key, lang), ...cols.slice(at)];
  });
  // Cột "Hoàn thành" mặc định luôn là cột hoàn thành
  return cols.map((c) => (c.builtin === 'done' && !c.isDone ? { ...c, isDone: true } : c));
}

/** Cột mở đầu tiên để đưa việc về (ưu tiên "Cần làm", bỏ qua "Quá hạn") */
export function firstOpenColumn(columns: Column[]) {
  return (
    columns.find((c) => c.builtin === 'todo') ??
    columns.find((c) => !c.isDone && c.builtin !== 'overdue') ??
    columns.find((c) => !c.isDone)
  );
}

/** Đặt thẻ vào cột `toId` tại vị trí `index` (hàm thuần, không đụng store) */
function placeTask(columns: Column[], taskId: string, toId: string, index: number): Column[] {
  return columns.map((c) => {
    const without = c.taskIds.filter((x) => x !== taskId);
    if (c.id !== toId) return without.length === c.taskIds.length ? c : { ...c, taskIds: without };
    const i = Math.max(0, Math.min(index, without.length));
    return { ...c, taskIds: [...without.slice(0, i), taskId, ...without.slice(i)] };
  });
}

export function demoData(lang: Lang = detectLang()): BoardData {
  const L = DEMO[lang];
  const t = (i: number, extra: Omit<TaskInput, 'title' | 'note'> = {}, done = false): Task => ({
    ...makeTask({ title: L.tasks[i][0], note: L.tasks[i][1], ...extra }),
    completedAt: done ? new Date(Date.now() - 86_400_000).toISOString() : null,
  });
  const { work, personal, study } = L.tags;
  const tasks = [
    t(0, { priority: 'low' }),
    t(1, { priority: 'high', dueDate: addDaysISO(0), startTime: '09:00', endTime: '10:30', tags: [work] }),
    t(2, { dueDate: addDaysISO(3), tags: [personal] }),
    t(3, { tags: [study] }),
    t(4, { priority: 'high', dueDate: addDaysISO(1), startTime: '14:00', endTime: '15:30', tags: [work] }),
    t(5, { dueDate: addDaysISO(-1), tags: [personal] }),
    t(6, { priority: 'low', tags: [personal] }, true),
  ];
  const ids = tasks.map((x) => x.id);
  return {
    tasks: Object.fromEntries(tasks.map((x) => [x.id, x])),
    columns: [
      builtinColumn('overdue', lang),
      { ...builtinColumn('todo', lang), taskIds: ids.slice(0, 3) },
      { ...builtinColumn('doing', lang), taskIds: ids.slice(3, 5) },
      { ...builtinColumn('review', lang), taskIds: ids.slice(5, 6) },
      { ...builtinColumn('done', lang), taskIds: ids.slice(6) },
    ],
  };
}

export const useBoard = create<BoardState>()(
  persist(
    (set, get) => ({
      ...demoData(),
      theme: 'dark',
      view: 'kanban',
      calMode: 'week',
      calHiddenTags: [],
      reminders: [],
      lang: detectLang(),
      filters: defaultFilters(),

      addTask: (columnId, input, index = 0) => {
        const task = makeTask(input);
        set((s) => {
          const columns = s.columns.map((c) => {
            if (c.id !== columnId) return c;
            const taskIds = [...c.taskIds];
            taskIds.splice(Math.min(index, taskIds.length), 0, task.id);
            if (c.isDone) task.completedAt = new Date().toISOString();
            return { ...c, taskIds };
          });
          return { columns, tasks: { ...s.tasks, [task.id]: task } };
        });
        return task.id;
      },

      updateTask: (id, patch) =>
        set((s) =>
          s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch, updatedAt: new Date().toISOString() } } } : s,
        ),

      deleteTask: (id) =>
        set((s) => {
          const tasks = { ...s.tasks };
          delete tasks[id];
          return {
            tasks,
            columns: s.columns.map((c) =>
              c.taskIds.includes(id) ? { ...c, taskIds: c.taskIds.filter((x) => x !== id) } : c,
            ),
          };
        }),

      moveTask: (taskId, toColumnId, toIndex) =>
        set((s) => {
          const task = s.tasks[taskId];
          const target = s.columns.find((c) => c.id === toColumnId);
          if (!task || !target) return s;
          const columns = s.columns.map((c) => {
            const without = c.taskIds.filter((x) => x !== taskId);
            if (c.id !== toColumnId) return without.length === c.taskIds.length ? c : { ...c, taskIds: without };
            const idx = Math.max(0, Math.min(toIndex, without.length));
            return { ...c, taskIds: [...without.slice(0, idx), taskId, ...without.slice(idx)] };
          });
          const completedAt = target.isDone ? (task.completedAt ?? new Date().toISOString()) : null;
          const moved = !target.taskIds.includes(taskId);
          return {
            columns,
            tasks:
              completedAt === task.completedAt && !moved
                ? s.tasks
                : {
                    ...s.tasks,
                    [taskId]: {
                      ...task,
                      completedAt,
                      ...(target.isDone ? { progress: 100 } : {}),
                      ...(moved ? { updatedAt: new Date().toISOString() } : {}),
                    },
                  },
          };
        }),

      syncOverdue: () =>
        set((s) => {
          const od = s.columns.find((c) => c.builtin === 'overdue');
          if (!od) return s;
          const today = todayISO();
          let columns = s.columns;
          let tasks = s.tasks;
          let changed = false;
          for (const task of Object.values(s.tasks)) {
            const col = columns.find((c) => c.taskIds.includes(task.id));
            if (!col) continue;
            const overdue = !!task.dueDate && task.dueDate < today;
            if (overdue && !col.isDone && col.id !== od.id && task.autoOverdueFor !== task.dueDate) {
              columns = placeTask(columns, task.id, od.id, Number.MAX_SAFE_INTEGER);
              tasks = { ...tasks, [task.id]: { ...task, autoOverdueFor: task.dueDate, prevColumnId: col.id, updatedAt: new Date().toISOString() } };
              changed = true;
            } else if (!overdue && col.id === od.id && task.autoOverdueFor) {
              const back =
                columns.find((c) => c.id === task.prevColumnId && c.id !== od.id && !c.isDone) ?? firstOpenColumn(columns);
              if (back) columns = placeTask(columns, task.id, back.id, 0);
              tasks = { ...tasks, [task.id]: { ...task, autoOverdueFor: null, prevColumnId: null, updatedAt: new Date().toISOString() } };
              changed = true;
            }
          }
          return changed ? { columns, tasks } : s;
        }),

      toggleDone: (taskId) => {
        const { columns, moveTask } = get();
        const current = columns.find((c) => c.taskIds.includes(taskId));
        if (!current) return;
        const target = current.isDone ? firstOpenColumn(columns) : columns.find((c) => c.isDone);
        if (!target) return;
        moveTask(taskId, target.id, current.isDone ? 0 : target.taskIds.length);
        // Bỏ tick một việc vẫn quá hạn: cho phép tự chuyển lại vào cột Quá hạn
        if (current.isDone) {
          get().updateTask(taskId, { autoOverdueFor: null, prevColumnId: null });
          get().syncOverdue();
        }
      },

      addColumn: (title, color) =>
        set((s) => ({
          columns: [...s.columns, { id: uid('c'), title: title.trim(), color, isDone: false, taskIds: [] }],
        })),

      updateColumn: (id, patch) =>
        set((s) => {
          const columns = s.columns.map((c) => (c.id === id ? { ...c, ...patch } : c));
          if (patch.isDone === undefined) return { columns };
          // Cập nhật trạng thái hoàn thành cho các thẻ trong cột
          const col = columns.find((c) => c.id === id)!;
          const tasks = { ...s.tasks };
          const now = new Date().toISOString();
          for (const tid of col.taskIds) {
            tasks[tid] = { ...tasks[tid], completedAt: col.isDone ? (tasks[tid].completedAt ?? now) : null };
          }
          return { columns, tasks };
        }),

      deleteColumn: (id) =>
        set((s) => {
          if (s.columns.length <= 1) return s;
          const col = s.columns.find((c) => c.id === id);
          if (!col || col.builtin) return s;
          const tasks = { ...s.tasks };
          col.taskIds.forEach((tid) => delete tasks[tid]);
          return { tasks, columns: s.columns.filter((c) => c.id !== id) };
        }),

      moveColumn: (from, to) =>
        set((s) => {
          const columns = [...s.columns];
          const [moved] = columns.splice(from, 1);
          columns.splice(to, 0, moved);
          return { columns };
        }),

      snapshot: () => {
        const { columns, tasks, filters, reminders } = get();
        return { columns, tasks, filters, reminders };
      },
      restore: (data) =>
        set({
          columns: data.columns,
          tasks: data.tasks,
          ...(data.filters ? { filters: data.filters } : {}),
          ...(data.reminders ? { reminders: data.reminders } : {}),
        }),

      applyImport: (data) =>
        set((s) => {
          const lang = s.lang;
          const localized = localizeDefaults(
            { tasks: data.tasks, columns: ensureBuiltins(data.columns, lang), filters: data.filters ?? s.filters },
            lang,
          );
          return { ...localized, reminders: data.reminders ?? s.reminders };
        }),

      clearAll: () => set(emptyBoard(get().lang)),
      loadDemo: () => set(demoData(get().lang)),

      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
      setCalMode: (calMode) => set({ calMode }),
      setCalHiddenTags: (calHiddenTags) => set({ calHiddenTags }),

      checkReminders: () => {
        const s = get();
        const now = Date.now();
        const done = new Set(s.columns.filter((c) => c.isDone).flatMap((c) => c.taskIds));
        const fresh: Reminder[] = [];
        for (const task of Object.values(s.tasks)) {
          if (done.has(task.id) || !task.dueDate || !task.startTime) continue;
          const at = `${task.dueDate}T${task.startTime}`;
          const diff = new Date(`${at}:00`).getTime() - now;
          if (diff <= 0 || diff > REMIND_BEFORE_MS) continue;
          if (s.reminders.some((r) => r.taskId === task.id && r.at === at)) continue;
          fresh.push({ id: uid('n'), taskId: task.id, at, createdAt: new Date().toISOString(), read: false });
        }
        if (fresh.length) set({ reminders: [...fresh, ...s.reminders].slice(0, 50) });
        return fresh;
      },
      markRemindersRead: () =>
        set((s) => (s.reminders.some((r) => !r.read) ? { reminders: s.reminders.map((r) => ({ ...r, read: true })) } : s)),
      setReminderRead: (id, read) =>
        set((s) => ({ reminders: s.reminders.map((r) => (r.id === id && r.read !== read ? { ...r, read } : r)) })),
      clearReminders: () => set({ reminders: [] }),
      setLang: (lang) =>
        set((s) =>
          s.lang === lang
            ? s
            : { lang, ...localizeDefaults(s, lang), calHiddenTags: s.calHiddenTags.map(defaultTextTranslator(lang)) },
        ),

      addFilter: (f) => {
        const id = uid('f');
        set((s) => ({ filters: [...s.filters, { ...f, id }] }));
        return id;
      },
      updateFilter: (id, patch) =>
        set((s) => ({ filters: s.filters.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFilter: (id) => set((s) => ({ filters: s.filters.filter((f) => f.id !== id) })),
      setFilters: (filters) => set({ filters }),
    }),
    {
      name: 'sakura-kanban',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Khi mở app: dịch dữ liệu mặc định theo ngôn ngữ đã lưu (sửa dữ liệu cũ lưu trước khi có tính năng này)
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<BoardState>) };
        merged.columns = ensureBuiltins(merged.columns, merged.lang);
        return { ...merged, ...localizeDefaults(merged, merged.lang) };
      },
      partialize: (s) => ({ columns: s.columns, tasks: s.tasks, theme: s.theme, view: s.view, calMode: s.calMode, calHiddenTags: s.calHiddenTags, reminders: s.reminders, lang: s.lang, filters: s.filters }),
    },
  ),
);

export function defaultFilters(): SavedFilter[] {
  return [
    { id: 'f_urgent', name: null, labelKey: 'prio.high', priorities: ['high'], tags: [], columnIds: [], due: 'any', hideDone: true },
    { id: 'f_overdue', name: null, labelKey: 'filter.overdue', priorities: [], tags: [], columnIds: [], due: 'overdue', hideDone: true },
  ];
}

export function emptyBoard(lang: Lang = detectLang()): BoardData {
  const d = demoData(lang);
  return { tasks: {}, columns: d.columns.map((c) => ({ ...c, taskIds: [] })) };
}
