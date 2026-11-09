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

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'done';

export function dueInfo(due: string | null, done: boolean): { label: string; tone: DueTone } | null {
  if (!due) return null;
  const today = parseISODate(todayISO());
  const date = parseISODate(due);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  let label: string;
  if (diff === 0) label = 'Hôm nay';
  else if (diff === 1) label = 'Ngày mai';
  else if (diff === -1) label = 'Hôm qua';
  else
    label = new Intl.DateTimeFormat('vi-VN', {
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
