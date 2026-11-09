export type Priority = 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  /** YYYY-MM-DD */
  dueDate: string | null;
  tags: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface Column {
  id: string;
  title: string;
  color: string;
  /** Thẻ nằm trong cột này được coi là đã hoàn thành */
  isDone: boolean;
  taskIds: string[];
  /** Cột mặc định: luôn tồn tại, không xoá được */
  builtin?: BuiltinColumn;
}

export type BuiltinColumn = 'todo' | 'doing' | 'review' | 'done';
export const BUILTIN_COLUMNS: BuiltinColumn[] = ['todo', 'doing', 'review', 'done'];

export interface BoardData {
  columns: Column[];
  tasks: Record<string, Task>;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ViewMode = 'kanban' | 'list';
/** Điều kiện hạn chót của bộ lọc */
export type DueRule = 'any' | 'overdue' | 'today' | 'week' | 'none';

/** Bộ lọc do người dùng tạo. Điều kiện để trống = không giới hạn. */
export interface SavedFilter {
  id: string;
  /** Tên do người dùng đặt; null = dùng tên mặc định theo ngôn ngữ (labelKey) */
  name: string | null;
  labelKey?: 'prio.high' | 'filter.overdue';
  priorities: Priority[];
  tags: string[];
  columnIds: string[];
  due: DueRule;
  hideDone: boolean;
}

export type Lang = 'vi' | 'en';

export const PRIORITIES: Priority[] = ['high', 'normal', 'low'];

export const COLUMN_COLORS = [
  { key: 'blue', hex: '#4f8ff7' },
  { key: 'sky', hex: '#38bdf8' },
  { key: 'violet', hex: '#a78bfa' },
  { key: 'pink', hex: '#f472b6' },
  { key: 'orange', hex: '#fb923c' },
  { key: 'yellow', hex: '#facc15' },
  { key: 'green', hex: '#4ade80' },
  { key: 'slate', hex: '#94a3b8' },
] as const;

/** Màu nhãn: cùng tên nhãn luôn ra cùng một màu */
const TAG_COLORS = ['#4f8ff7', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];
export function tagColor(tag: string) {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
