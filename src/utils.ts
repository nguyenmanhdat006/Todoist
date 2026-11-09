import type { T } from './i18n';
import type { Column, Lang, SavedFilter, Task } from './types';
import { presetTagNames, tagColor } from './types';
import type { CSSProperties } from 'react';

export const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayISO = () => toISODate(new Date());

export function addDaysISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function parseISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "09:00–10:30", "09:00" hoặc "" khi là việc cả ngày */
export function timeRange(task: Pick<Task, 'dueDate' | 'startTime' | 'endTime'>) {
  if (!task.dueDate || !task.startTime) return '';
  return task.endTime ? `${task.startTime}–${task.endTime}` : task.startTime;
}

/** "HH:MM" -> số phút từ 00:00 */
export function toMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(n: number) {
  const v = Math.max(0, Math.min(n, 23 * 60 + 59));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Mọi nhãn để chọn: nhãn có sẵn (theo thứ tự cố định) rồi tới nhãn tự tạo (theo ABC) */
export function knownTags(tasks: Record<string, Task>, lang: Lang, locale: string, extra: string[] = []) {
  const presets = presetTagNames(lang);
  const preset = new Set(presets);
  const custom = new Set<string>();
  for (const x of Object.values(tasks)) for (const g of x.tags) if (!preset.has(g)) custom.add(g);
  for (const g of extra) if (!preset.has(g)) custom.add(g);
  return [...presets, ...[...custom].sort((a, b) => a.localeCompare(b, locale))];
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'done';

export function dueInfo(due: string | null, done: boolean, t: T): { label: string; tone: DueTone } | null {
  if (!due) return null;
  const today = parseISODate(todayISO());
  const date = parseISODate(due);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  let label: string;
  if (diff === 0) label = t('due.today');
  else if (diff === 1) label = t('due.tomorrow');
  else if (diff === -1) label = t('due.yesterday');
  else
    label = new Intl.DateTimeFormat(t.locale, {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    }).format(date);
  let tone: DueTone = 'normal';
  if (done) tone = 'done';
  else if (diff < 0) tone = 'overdue';
  else if (diff === 0) tone = 'today';
  else if (diff <= 2) tone = 'soon';
  return { label, tone };
}

export function isOverdue(due: string | null, done: boolean) {
  return !!due && !done && due < todayISO();
}

/** Bỏ dấu tiếng Việt để tìm kiếm: "hoc tieng nhat" khớp "Học tiếng Nhật" */
export function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Chọn màu chữ đọc được trên nền màu cột */
export function readableText(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? '#2b2023' : '#ffffff';
}

/** Style cho một nhãn dạng khối màu đặc: nền theo màu nhãn, chữ tối hoặc trắng tuỳ độ sáng */
export function tagStyle(tag: string): CSSProperties {
  const c = tagColor(tag);
  return { '--tag': c, '--tag-fg': readableText(c) } as CSSProperties;
}

/** Cột cho phép cập nhật tiến độ: mọi cột trừ "Cần làm" (chưa bắt đầu) và cột Hoàn thành (luôn 100%) */
export function canTrackProgress(col: Column | undefined) {
  return !!col && !col.isDone && col.builtin !== 'todo';
}

/** Tiến độ hiển thị: Hoàn thành = 100, Cần làm = 0, còn lại theo giá trị đã nhập */
export function progressOf(task: Task, col: Column | undefined) {
  if (col?.isDone) return 100;
  if (!canTrackProgress(col)) return 0;
  return Math.min(100, Math.max(0, Math.round(task.progress ?? 0)));
}

/**
 * Trạng thái màu của việc theo hạn:
 *  done = đã xong (xanh dương), overdue = quá hạn (đỏ), today = hạn hôm nay (vàng), ok = còn thời gian (xanh lá)
 */
export type TaskStatus = 'done' | 'overdue' | 'today' | 'ok';
export const STATUS_COLORS: Record<TaskStatus, string> = {
  ok: '#22a35a',
  today: '#f5b301',
  overdue: '#ef4444',
  done: '#2563eb',
};
export const STATUS_ORDER: TaskStatus[] = ['ok', 'today', 'overdue', 'done'];

export function taskStatus(task: Pick<Task, 'dueDate'>, done: boolean, today = todayISO()): TaskStatus {
  if (done) return 'done';
  if (!task.dueDate) return 'ok';
  if (task.dueDate < today) return 'overdue';
  return task.dueDate === today ? 'today' : 'ok';
}

/** Việc có khớp bộ lọc đã lưu không */
export function matchesFilter(task: Task, f: SavedFilter, done: boolean, columnId: string | undefined) {
  if (f.hideDone && done) return false;
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.tags.length && !task.tags.some((g) => f.tags.includes(g))) return false;
  if (f.columnIds.length && (!columnId || !f.columnIds.includes(columnId))) return false;
  const today = todayISO();
  switch (f.due) {
    case 'overdue':
      return isOverdue(task.dueDate, done);
    case 'today':
      return task.dueDate === today;
    case 'week':
      return !!task.dueDate && task.dueDate >= today && task.dueDate <= addDaysISO(7);
    case 'none':
      return !task.dueDate;
    default:
      return true;
  }
}
