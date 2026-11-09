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

export const PRIORITY: Record<Priority, { label: string }> = {
  high: { label: 'Gấp' },
  normal: { label: 'Bình thường' },
  low: { label: 'Thấp' },
};

export const COLUMN_COLORS = [
  { name: 'Xanh dương', hex: '#4f8ff7' },
  { name: 'Xanh trời', hex: '#38bdf8' },
  { name: 'Tím', hex: '#a78bfa' },
  { name: 'Hồng', hex: '#f472b6' },
  { name: 'Cam', hex: '#fb923c' },
  { name: 'Vàng', hex: '#facc15' },
  { name: 'Xanh lá', hex: '#4ade80' },
  { name: 'Xám', hex: '#94a3b8' },
];

/** Màu nhãn: cùng tên nhãn luôn ra cùng một màu */
const TAG_COLORS = ['#4f8ff7', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];
export function tagColor(tag: string) {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
