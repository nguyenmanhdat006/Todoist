import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BoardData, Column, Lang, Priority, Task, ThemeMode, ViewMode } from '../types';
import { addDaysISO, uid } from '../utils';

export interface TaskInput {
  title: string;
  note?: string;
  priority?: Priority;
  dueDate?: string | null;
  tags?: string[];
}

interface BoardState extends BoardData {
  theme: ThemeMode;
  view: ViewMode;
  lang: Lang;

  addTask: (columnId: string, input: TaskInput, index?: number) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void;
  /** Di chuyển thẻ sang cột `toColumnId` tại vị trí `toIndex` (tính sau khi đã gỡ thẻ ra) */
  moveTask: (taskId: string, toColumnId: string, toIndex: number) => void;

  addColumn: (title: string, color: string) => void;
  updateColumn: (id: string, patch: Partial<Omit<Column, 'id' | 'taskIds'>>) => void;
  deleteColumn: (id: string) => void;
  moveColumn: (from: number, to: number) => void;

  snapshot: () => BoardData;
  restore: (data: BoardData) => void;
  importData: (raw: unknown) => boolean;
  /** Tick hoàn thành: chuyển sang cột Hoàn thành, bỏ tick: về đầu cột mở đầu tiên */
  toggleDone: (taskId: string) => void;
  clearAll: () => void;
  loadDemo: () => void;

  setTheme: (t: ThemeMode) => void;
  setView: (v: ViewMode) => void;
  setLang: (l: Lang) => void;
}

function makeTask(input: TaskInput): Task {
  return {
    id: uid('t'),
    title: input.title.trim(),
    note: input.note?.trim() ?? '',
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate ?? null,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
    completedAt: null,
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
    columns: ['Cần làm', 'Đang làm', 'Chờ xem lại', 'Hoàn thành'],
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
    columns: ['To do', 'In progress', 'In review', 'Done'],
  },
} as const;

export function demoData(lang: Lang = detectLang()): BoardData {
  const L = DEMO[lang];
  const t = (i: number, extra: Omit<TaskInput, 'title' | 'note'> = {}, done = false): Task => ({
    ...makeTask({ title: L.tasks[i][0], note: L.tasks[i][1], ...extra }),
    completedAt: done ? new Date(Date.now() - 86_400_000).toISOString() : null,
  });
  const { work, personal, study } = L.tags;
  const tasks = [
    t(0, { priority: 'low' }),
    t(1, { priority: 'high', dueDate: addDaysISO(0), tags: [work] }),
    t(2, { dueDate: addDaysISO(3), tags: [personal] }),
    t(3, { tags: [study] }),
    t(4, { priority: 'high', dueDate: addDaysISO(1), tags: [work] }),
    t(5, { dueDate: addDaysISO(-1), tags: [personal] }),
    t(6, { priority: 'low', tags: [personal] }, true),
  ];
  const ids = tasks.map((x) => x.id);
  return {
    tasks: Object.fromEntries(tasks.map((x) => [x.id, x])),
    columns: [
      { id: uid('c'), title: L.columns[0], color: '#4f8ff7', isDone: false, taskIds: ids.slice(0, 3) },
      { id: uid('c'), title: L.columns[1], color: '#fb923c', isDone: false, taskIds: ids.slice(3, 5) },
      { id: uid('c'), title: L.columns[2], color: '#a78bfa', isDone: false, taskIds: ids.slice(5, 6) },
      { id: uid('c'), title: L.columns[3], color: '#4ade80', isDone: true, taskIds: ids.slice(6) },
    ],
  };
}

/** Kiểm tra và làm sạch dữ liệu nhập từ file JSON */
function sanitize(raw: unknown): BoardData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<BoardData> & { state?: BoardData };
  const src = r.state && Array.isArray(r.state.columns) ? r.state : r;
  if (!Array.isArray(src.columns) || !src.tasks || typeof src.tasks !== 'object') return null;
  const tasks: Record<string, Task> = {};
  for (const [id, v] of Object.entries(src.tasks)) {
    const x = v as Partial<Task>;
    if (typeof x?.title !== 'string') continue;
    tasks[id] = {
      id,
      title: x.title,
      note: typeof x.note === 'string' ? x.note : '',
      priority: x.priority === 'high' || x.priority === 'low' ? x.priority : 'normal',
      dueDate: typeof x.dueDate === 'string' ? x.dueDate : null,
      tags: Array.isArray(x.tags) ? x.tags.filter((g): g is string => typeof g === 'string') : [],
      createdAt: typeof x.createdAt === 'string' ? x.createdAt : new Date().toISOString(),
      completedAt: typeof x.completedAt === 'string' ? x.completedAt : null,
    };
  }
  const columns: Column[] = src.columns
    .filter((c): c is Column => !!c && typeof c.id === 'string' && typeof c.title === 'string')
    .map((c) => ({
      id: c.id,
      title: c.title,
      color: typeof c.color === 'string' ? c.color : '#4f8ff7',
      isDone: !!c.isDone,
      taskIds: Array.isArray(c.taskIds) ? c.taskIds.filter((id) => id in tasks) : [],
    }));
  if (columns.length === 0) return null;
  return { columns, tasks };
}

export const useBoard = create<BoardState>()(
  persist(
    (set, get) => ({
      ...demoData(),
      theme: 'dark',
      view: 'kanban',
      lang: detectLang(),

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
        set((s) => (s.tasks[id] ? { tasks: { ...s.tasks, [id]: { ...s.tasks[id], ...patch } } } : s)),

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
          return {
            columns,
            tasks: completedAt === task.completedAt ? s.tasks : { ...s.tasks, [taskId]: { ...task, completedAt } },
          };
        }),

      toggleDone: (taskId) => {
        const { columns, moveTask } = get();
        const current = columns.find((c) => c.taskIds.includes(taskId));
        if (!current) return;
        const target = current.isDone ? columns.find((c) => !c.isDone) : columns.find((c) => c.isDone);
        if (!target) return;
        moveTask(taskId, target.id, current.isDone ? 0 : target.taskIds.length);
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
          if (!col) return s;
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
        const { columns, tasks } = get();
        return { columns, tasks };
      },
      restore: (data) => set({ columns: data.columns, tasks: data.tasks }),

      importData: (raw) => {
        const data = sanitize(raw);
        if (!data) return false;
        set(data);
        return true;
      },

      clearAll: () => set(emptyBoard(get().lang)),
      loadDemo: () => set(demoData(get().lang)),

      setTheme: (theme) => set({ theme }),
      setView: (view) => set({ view }),
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'sakura-kanban',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ columns: s.columns, tasks: s.tasks, theme: s.theme, view: s.view, lang: s.lang }),
    },
  ),
);

export function emptyBoard(lang: Lang = detectLang()): BoardData {
  const d = demoData(lang);
  return { tasks: {}, columns: d.columns.map((c) => ({ ...c, taskIds: [] })) };
}
