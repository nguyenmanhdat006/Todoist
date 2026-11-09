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
}

export interface BoardData {
  columns: Column[];
  tasks: Record<string, Task>;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ViewMode = 'kanban' | 'list';
export type PriorityFilter = 'all' | Priority | 'overdue';

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
