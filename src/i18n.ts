import { useMemo } from 'react';
import { useBoard } from './store/board';
import type { Lang } from './types';

const vi = {
  'nav.label': 'Kiểu xem',
  'nav.board': 'Bảng',
  'nav.list': 'Danh sách',

  'page.title': 'Công việc',
  'stats.label': 'Thống kê',
  'stats.open': 'đang mở',
  'stats.done': 'đã xong',
  'stats.overdue': 'quá hạn',
  'create': 'Tạo việc',
  'search.placeholder': 'Tìm việc, ghi chú, nhãn…',
  'filter.label': 'Bộ lọc',
  'filter.all': 'Tất cả',
  'filter.overdue': 'Quá hạn',
  'filter.clear': 'Xoá bộ lọc',

  'prio.high': 'Gấp',
  'prio.normal': 'Bình thường',
  'prio.low': 'Thấp',

  'due.today': 'Hôm nay',
  'due.tomorrow': 'Ngày mai',
  'due.yesterday': 'Hôm qua',

  'toast.undo': 'Hoàn tác',
  'toast.taskDeleted': 'Đã xoá “{title}”.',
  'toast.columnDeleted': 'Đã xoá cột “{title}”.',
  'toast.imported': 'Đã nhập dữ liệu từ {name}.',
  'toast.badFormat': 'File không đúng định dạng của app.',
  'toast.unreadable': 'Không đọc được file. Hãy chọn file .json đã xuất từ app.',
  'toast.demo': 'Đã nạp dữ liệu mẫu.',
  'toast.cleared': 'Đã xoá toàn bộ công việc.',

  'data.button': 'Dữ liệu và sao lưu',
  'data.heading': 'Dữ liệu (lưu trong trình duyệt này)',
  'data.export': 'Xuất file JSON để sao lưu',
  'data.import': 'Nhập từ file JSON',
  'data.demo': 'Nạp dữ liệu mẫu',
  'data.clear': 'Xoá toàn bộ công việc…',
  'data.clearConfirm': 'Xoá hết mọi việc? Các cột vẫn được giữ.',
  'data.clearNo': 'Không',
  'data.clearYes': 'Xoá hết',

  'progress.title': '{done}/{total} việc đã xong',
  'progress.aria': 'Đã xong {pct}%',
  'theme.label': 'Giao diện',
  'theme.light': 'Sáng',
  'theme.dark': 'Tối',
  'theme.system': 'Theo hệ thống',
  'lang.label': 'Ngôn ngữ',

  'help.button': 'Phím tắt và hướng dẫn',
  'help.title': 'Phím tắt',
  'help.new': 'Thêm việc mới',
  'help.search': 'Tìm kiếm',
  'help.esc': 'Đóng hộp thoại, xoá ô tìm',
  'help.save': 'Lưu trong hộp thoại',
  'help.drag': 'Nhấc / thả thẻ bằng bàn phím',
  'help.note': 'Dữ liệu chỉ lưu trong trình duyệt này. Hãy xuất file JSON thỉnh thoảng để sao lưu.',

  'col.menu': 'Tuỳ chỉnh cột {title}',
  'col.menuDialog': 'Tuỳ chỉnh cột',
  'col.addTask': 'Thêm việc vào {title}',
  'col.drag': 'Kéo để đổi vị trí cột {title}',
  'col.name': 'Tên cột',
  'col.color': 'Màu',
  'col.isDone': 'Đây là cột Hoàn thành (việc được tick sẽ chuyển vào đây)',
  'col.delete': 'Xoá cột',
  'col.deleteWith': 'Xoá cột và {n} việc',
  'col.empty': 'Chưa có việc. Bấm để thêm, hoặc kéo thẻ vào đây.',
  'col.quickAdd': 'Tên việc, Enter để thêm',
  'col.add': 'Thêm cột',
  'col.newName': 'Tên cột mới, Enter để tạo',

  'card.role': 'Thẻ công việc',
  'card.check': 'Đánh dấu hoàn thành',
  'card.uncheck': 'Bỏ đánh dấu hoàn thành',

  'modal.edit': 'Sửa công việc',
  'modal.new': 'Công việc mới',
  'modal.close': 'Đóng',
  'modal.title': 'Tên công việc',
  'modal.titlePh': 'Ví dụ: Nộp báo cáo tuần',
  'modal.titleError': 'Hãy nhập tên công việc.',
  'modal.note': 'Ghi chú',
  'modal.column': 'Cột',
  'modal.due': 'Hạn chót',
  'modal.priority': 'Mức ưu tiên',
  'modal.tags': 'Nhãn (cách nhau bằng dấu phẩy)',
  'modal.tagsPh': 'Công việc, Cá nhân',
  'modal.delete': 'Xoá việc',
  'modal.cancel': 'Huỷ',
  'modal.save': 'Lưu',
  'modal.add': 'Thêm việc',

  'list.empty': 'Không có công việc nào khớp bộ lọc.',
  'list.done': 'Hoàn thành',
  'list.task': 'Công việc',
  'list.column': 'Cột',
  'list.priority': 'Ưu tiên',
  'list.due': 'Hạn chót',
  'list.tags': 'Nhãn',
  'list.noDoneCol': 'Chưa có cột nào được đặt là cột Hoàn thành',

  'color.blue': 'Xanh dương',
  'color.sky': 'Xanh trời',
  'color.violet': 'Tím',
  'color.pink': 'Hồng',
  'color.orange': 'Cam',
  'color.yellow': 'Vàng',
  'color.green': 'Xanh lá',
  'color.slate': 'Xám',
};

export type TKey = keyof typeof vi;

const en: Record<TKey, string> = {
  'nav.label': 'View',
  'nav.board': 'Board',
  'nav.list': 'List',

  'page.title': 'Tasks',
  'stats.label': 'Stats',
  'stats.open': 'open',
  'stats.done': 'done',
  'stats.overdue': 'overdue',
  'create': 'New task',
  'search.placeholder': 'Search tasks, notes, tags…',
  'filter.label': 'Filters',
  'filter.all': 'All',
  'filter.overdue': 'Overdue',
  'filter.clear': 'Clear filters',

  'prio.high': 'Urgent',
  'prio.normal': 'Normal',
  'prio.low': 'Low',

  'due.today': 'Today',
  'due.tomorrow': 'Tomorrow',
  'due.yesterday': 'Yesterday',

  'toast.undo': 'Undo',
  'toast.taskDeleted': 'Deleted “{title}”.',
  'toast.columnDeleted': 'Deleted column “{title}”.',
  'toast.imported': 'Imported data from {name}.',
  'toast.badFormat': "This file isn't a backup from this app.",
  'toast.unreadable': "Couldn't read the file. Choose a .json file exported from this app.",
  'toast.demo': 'Loaded sample data.',
  'toast.cleared': 'Deleted all tasks.',

  'data.button': 'Data and backup',
  'data.heading': 'Data (stored in this browser)',
  'data.export': 'Export JSON backup',
  'data.import': 'Import from JSON',
  'data.demo': 'Load sample data',
  'data.clear': 'Delete all tasks…',
  'data.clearConfirm': 'Delete every task? Columns are kept.',
  'data.clearNo': 'Cancel',
  'data.clearYes': 'Delete all',

  'progress.title': '{done} of {total} tasks done',
  'progress.aria': '{pct}% done',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'lang.label': 'Language',

  'help.button': 'Shortcuts and help',
  'help.title': 'Shortcuts',
  'help.new': 'New task',
  'help.search': 'Search',
  'help.esc': 'Close dialog, clear search',
  'help.save': 'Save in a dialog',
  'help.drag': 'Pick up / drop a card with the keyboard',
  'help.note': 'Data is stored only in this browser. Export a JSON backup now and then.',

  'col.menu': 'Edit column {title}',
  'col.menuDialog': 'Edit column',
  'col.addTask': 'Add task to {title}',
  'col.drag': 'Drag to move column {title}',
  'col.name': 'Column name',
  'col.color': 'Color',
  'col.isDone': 'This is the Done column (ticked tasks move here)',
  'col.delete': 'Delete column',
  'col.deleteWith': 'Delete column and {n} tasks',
  'col.empty': 'No tasks yet. Click to add one, or drag a card here.',
  'col.quickAdd': 'Task name, press Enter to add',
  'col.add': 'Add column',
  'col.newName': 'New column name, press Enter',

  'card.role': 'Task card',
  'card.check': 'Mark as done',
  'card.uncheck': 'Mark as not done',

  'modal.edit': 'Edit task',
  'modal.new': 'New task',
  'modal.close': 'Close',
  'modal.title': 'Title',
  'modal.titlePh': 'e.g. Send the weekly report',
  'modal.titleError': 'Enter a task title.',
  'modal.note': 'Notes',
  'modal.column': 'Column',
  'modal.due': 'Due date',
  'modal.priority': 'Priority',
  'modal.tags': 'Tags (comma-separated)',
  'modal.tagsPh': 'Work, Personal',
  'modal.delete': 'Delete task',
  'modal.cancel': 'Cancel',
  'modal.save': 'Save',
  'modal.add': 'Add task',

  'list.empty': 'No tasks match these filters.',
  'list.done': 'Done',
  'list.task': 'Task',
  'list.column': 'Column',
  'list.priority': 'Priority',
  'list.due': 'Due',
  'list.tags': 'Tags',
  'list.noDoneCol': 'No column is set as the Done column',

  'color.blue': 'Blue',
  'color.sky': 'Sky',
  'color.violet': 'Violet',
  'color.pink': 'Pink',
  'color.orange': 'Orange',
  'color.yellow': 'Yellow',
  'color.green': 'Green',
  'color.slate': 'Slate',
};

const DICT: Record<Lang, Record<TKey, string>> = { vi, en };

export interface T {
  (key: TKey, vars?: Record<string, string | number>): string;
  lang: Lang;
  locale: string;
}

export function makeT(lang: Lang): T {
  const d = DICT[lang];
  const t = ((key: TKey, vars?: Record<string, string | number>) =>
    d[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))) as T;
  t.lang = lang;
  t.locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  return t;
}

export function useT(): T {
  const lang = useBoard((s) => s.lang);
  return useMemo(() => makeT(lang), [lang]);
}
