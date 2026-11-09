export type Priority = 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  title: string;
  note: string;
  priority: Priority;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** Giờ bắt đầu HH:MM trong ngày dueDate; null = cả ngày */
  startTime?: string | null;
  /** Giờ kết thúc HH:MM */
  endTime?: string | null;
  tags: string[];
  createdAt: string;
  /** Lần sửa gần nhất (nội dung hoặc chuyển cột); dùng khi đồng bộ lên server sau này */
  updatedAt?: string;
  completedAt: string | null;
  /** Hạn chót tại thời điểm app tự chuyển việc vào cột Quá hạn (để không kéo lại nếu người dùng tự chuyển ra) */
  autoOverdueFor?: string | null;
  /** Cột trước khi bị chuyển vào cột Quá hạn, để trả về khi đổi hạn */
  prevColumnId?: string | null;
  /** Tiến độ hoàn thành 0–100 (%). Việc trong cột Hoàn thành luôn tính là 100 */
  progress?: number;
}

/** Lời nhắc: tạo ra khi một việc có giờ còn ≤ 1 tiếng nữa là bắt đầu */
export interface Reminder {
  id: string;
  taskId: string;
  /** Thời điểm bắt đầu lúc tạo nhắc, dạng YYYY-MM-DDTHH:MM (giờ máy) */
  at: string;
  createdAt: string;
  read: boolean;
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

export type BuiltinColumn = 'overdue' | 'todo' | 'doing' | 'review' | 'done';
export const BUILTIN_COLUMNS: BuiltinColumn[] = ['overdue', 'todo', 'doing', 'review', 'done'];

export interface BoardData {
  columns: Column[];
  tasks: Record<string, Task>;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ViewMode = 'kanban' | 'list' | 'calendar';
export type CalMode = 'month' | 'week' | 'day';
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

/** Nhãn có sẵn: luôn hiện để chọn, mỗi nhãn một màu riêng, tự dịch theo ngôn ngữ */
export const PRESET_TAGS = [
  { key: 'work', vi: 'Công việc', en: 'Work', color: '#4f8ff7' },
  { key: 'personal', vi: 'Cá nhân', en: 'Personal', color: '#4ade80' },
  { key: 'study', vi: 'Học tập', en: 'Study', color: '#a78bfa' },
  { key: 'homework', vi: 'Bài tập', en: 'Homework', color: '#fb923c' },
  { key: 'exam', vi: 'Lịch thi', en: 'Exam', color: '#f87171' },
  { key: 'meeting', vi: 'Họp', en: 'Meeting', color: '#38bdf8' },
  { key: 'health', vi: 'Sức khoẻ', en: 'Health', color: '#2dd4bf' },
  { key: 'family', vi: 'Gia đình', en: 'Family', color: '#f472b6' },
  { key: 'shopping', vi: 'Mua sắm', en: 'Shopping', color: '#facc15' },
  { key: 'finance', vi: 'Tài chính', en: 'Finance', color: '#a3e635' },
  { key: 'other', vi: 'Khác', en: 'Other', color: '#94a3b8' },
] as const;

export function presetTagNames(lang: Lang): string[] {
  return PRESET_TAGS.map((p) => p[lang]);
}

const PRESET_COLOR = new Map<string, string>(PRESET_TAGS.flatMap((p) => [[p.vi, p.color], [p.en, p.color]] as [string, string][]));

/** Màu nhãn: nhãn có sẵn dùng màu riêng, nhãn tự tạo thì cùng tên luôn ra cùng một màu */
const TAG_COLORS = ['#4f8ff7', '#38bdf8', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf'];
export function tagColor(tag: string) {
  const preset = PRESET_COLOR.get(tag);
  if (preset) return preset;
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}
