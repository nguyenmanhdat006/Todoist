/**
 * Xuất / nhập dữ liệu dạng JSON.
 *
 * File xuất có cấu trúc "phẳng" như các bảng trong cơ sở dữ liệu (columns, tags, tasks, filters, reminders),
 * mỗi dòng có id ổn định và vị trí (position), để sau này đổ thẳng vào DB.
 * Mô tả đầy đủ: docs/export-format.md và docs/export.schema.json.
 */
// Dùng chung cho cả trình duyệt và API (api/), nên chỉ phụ thuộc types.ts và ghi rõ đuôi .js cho Node
import type { BuiltinColumn, Column, DueRule, Priority, Reminder, SavedFilter, Task } from '../types.js';
import { BUILTIN_COLUMNS, PRESET_TAGS, tagColor } from '../types.js';

/** Mã thông báo khi nhập; trùng với khoá trong src/i18n.ts */
export type IssueKey =
  | 'imp.notObject'
  | 'imp.unknownFormat'
  | 'imp.newerVersion'
  | 'imp.missingLists'
  | 'imp.noColumns'
  | 'imp.skipItem'
  | 'imp.fixedField'
  | 'imp.duplicateId'
  | 'imp.unknownColumn'
  | 'imp.orphans'
  | 'toast.unreadable';
type TKey = IssueKey;

export const EXPORT_FORMAT = 'task-management-export';
export const EXPORT_VERSION = 2;

export interface ExportColumn {
  id: string;
  title: string;
  color: string;
  isDone: boolean;
  /** Khoá của cột mặc định (không xoá được), null nếu là cột tự tạo */
  builtin: BuiltinColumn | null;
  position: number;
  /** Màu thẻ: 'status' (theo hạn), 'none' hoặc #rrggbb */
  cardColor: string;
}

export interface ExportTag {
  name: string;
  color: string;
  /** Khoá của nhãn có sẵn (work, study, ...), null nếu là nhãn tự tạo */
  preset: string | null;
  taskCount: number;
}

export interface ExportTask {
  id: string;
  columnId: string;
  position: number;
  title: string;
  note: string;
  priority: Priority;
  dueDate: string | null;
  startTime: string | null;
  endTime: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  autoOverdueFor: string | null;
  prevColumnId: string | null;
  progress: number;
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  /** Múi giờ của máy lúc xuất; dueDate/startTime/endTime là giờ địa phương theo múi giờ này */
  timezone: string;
  settings: {
    lang: string;
    theme: string;
    view: string;
    calendarMode: string;
    calendarHiddenTags: string[];
  };
  counts: { columns: number; tags: number; tasks: number; filters: number; reminders: number };
  columns: ExportColumn[];
  tags: ExportTag[];
  tasks: ExportTask[];
  filters: SavedFilter[];
  reminders: Reminder[];
}

export interface ExportSource {
  columns: Column[];
  tasks: Record<string, Task>;
  filters: SavedFilter[];
  reminders: Reminder[];
  lang: string;
  theme: string;
  view: string;
  calMode: string;
  calHiddenTags: string[];
}

const PRESET_BY_NAME = new Map<string, string>(PRESET_TAGS.flatMap((p) => [[p.vi, p.key], [p.en, p.key]] as [string, string][]));

export function buildExport(s: ExportSource, now = new Date()): ExportFile {
  const tasks: ExportTask[] = [];
  for (const col of s.columns) {
    col.taskIds.forEach((id, position) => {
      const x = s.tasks[id];
      if (!x) return;
      tasks.push({
        id: x.id,
        columnId: col.id,
        position,
        title: x.title,
        note: x.note,
        priority: x.priority,
        dueDate: x.dueDate,
        startTime: x.dueDate ? (x.startTime ?? null) : null,
        endTime: x.dueDate && x.startTime ? (x.endTime ?? null) : null,
        tags: [...x.tags],
        createdAt: x.createdAt,
        updatedAt: x.updatedAt ?? x.createdAt,
        completedAt: x.completedAt,
        autoOverdueFor: x.autoOverdueFor ?? null,
        prevColumnId: x.prevColumnId ?? null,
        progress: clampProgress(x.progress),
      });
    });
  }

  const tagCount = new Map<string, number>();
  for (const x of tasks) for (const g of x.tags) tagCount.set(g, (tagCount.get(g) ?? 0) + 1);
  for (const f of s.filters) for (const g of f.tags) if (!tagCount.has(g)) tagCount.set(g, 0);
  const tags: ExportTag[] = [...tagCount.entries()].map(([name, n]) => ({
    name,
    color: tagColor(name),
    preset: PRESET_BY_NAME.get(name) ?? null,
    taskCount: n,
  }));

  const columns: ExportColumn[] = s.columns.map((c, position) => ({
    id: c.id,
    title: c.title,
    color: c.color,
    isDone: c.isDone,
    builtin: c.builtin ?? null,
    position,
    cardColor: c.cardColor ?? 'status',
  }));

  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    settings: {
      lang: s.lang,
      theme: s.theme,
      view: s.view,
      calendarMode: s.calMode,
      calendarHiddenTags: [...s.calHiddenTags],
    },
    counts: { columns: columns.length, tags: tags.length, tasks: tasks.length, filters: s.filters.length, reminders: s.reminders.length },
    columns,
    tags,
    tasks,
    filters: s.filters.map((f) => ({ ...f, priorities: [...f.priorities], tags: [...f.tags], columnIds: [...f.columnIds] })),
    reminders: s.reminders.map((r) => ({ ...r })),
  };
}

export function exportFileName(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `task-management-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/* ------------------------------------------------------------------ */
/* Nhập                                                                */
/* ------------------------------------------------------------------ */

export interface Issue {
  key: TKey;
  vars?: Record<string, string | number>;
}

export interface ImportData {
  columns: Column[];
  tasks: Record<string, Task>;
  /** undefined = file không có (định dạng cũ), giữ nguyên dữ liệu hiện tại */
  filters?: SavedFilter[];
  reminders?: Reminder[];
}

export type ImportResult =
  | {
      ok: true;
      data: ImportData;
      /** Những chỗ đã tự sửa hoặc bỏ qua */
      warnings: Issue[];
      /** 1 = định dạng cũ, 2 = định dạng hiện tại */
      sourceVersion: number;
      exportedAt: string | null;
      counts: { columns: number; tasks: number; filters: number; reminders: number };
    }
  | { ok: false; errors: Issue[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PRIORITIES: Priority[] = ['high', 'normal', 'low'];
const DUE_RULES: DueRule[] = ['any', 'overdue', 'today', 'week', 'none'];

/** Tiến độ hợp lệ: số nguyên 0–100, sai thì về 0 */
export function clampProgress(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(100, Math.max(0, n));
}

function validDate(v: string) {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const validStamp = (v: string) => !Number.isNaN(Date.parse(v));

interface RawTask extends Obj {
  columnId?: unknown;
  position?: unknown;
}

/** Đọc một việc, tự sửa trường hỏng (ghi cảnh báo). Trả về null nếu không dùng được. */
function readTask(raw: unknown, path: string, warn: (key: TKey, vars?: Issue['vars']) => void): Task | null {
  if (!isObj(raw)) {
    warn('imp.skipItem', { path });
    return null;
  }
  const id = str(raw.id)?.trim();
  const title = str(raw.title)?.trim();
  if (!id || !title) {
    warn('imp.skipItem', { path });
    return null;
  }
  const fix = (field: string) => warn('imp.fixedField', { path, field });

  let priority: Priority = 'normal';
  if (raw.priority !== undefined) {
    if (PRIORITIES.includes(raw.priority as Priority)) priority = raw.priority as Priority;
    else fix('priority');
  }

  let dueDate = str(raw.dueDate);
  if (raw.dueDate != null && (!dueDate || !validDate(dueDate))) {
    fix('dueDate');
    dueDate = null;
  }
  let startTime = str(raw.startTime);
  if (raw.startTime != null && (!startTime || !TIME_RE.test(startTime))) {
    fix('startTime');
    startTime = null;
  }
  let endTime = str(raw.endTime);
  if (raw.endTime != null && (!endTime || !TIME_RE.test(endTime))) {
    fix('endTime');
    endTime = null;
  }
  if (!dueDate) startTime = null;
  if (!startTime) endTime = null;
  if (startTime && endTime && endTime <= startTime) {
    fix('endTime');
    endTime = null;
  }

  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    const seen = new Set<string>();
    for (const g of raw.tags) {
      const name = typeof g === 'string' ? g.trim().replace(/\s+/g, ' ') : '';
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        tags.push(name);
      }
    }
    if (tags.length !== raw.tags.length) fix('tags');
  } else if (raw.tags !== undefined) fix('tags');
  if (tags.length > 50) tags = tags.slice(0, 50);

  let createdAt = str(raw.createdAt);
  if (!createdAt || !validStamp(createdAt)) {
    if (raw.createdAt !== undefined) fix('createdAt');
    createdAt = new Date().toISOString();
  }
  let updatedAt = str(raw.updatedAt);
  if (raw.updatedAt != null && (!updatedAt || !validStamp(updatedAt))) {
    fix('updatedAt');
    updatedAt = null;
  }
  let completedAt = str(raw.completedAt);
  if (raw.completedAt != null && (!completedAt || !validStamp(completedAt))) {
    fix('completedAt');
    completedAt = null;
  }
  const autoOverdueFor = str(raw.autoOverdueFor);
  const prevColumnId = str(raw.prevColumnId);

  return {
    id,
    title,
    note: str(raw.note) ?? '',
    priority,
    dueDate,
    startTime,
    endTime,
    tags,
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    completedAt,
    autoOverdueFor: autoOverdueFor && validDate(autoOverdueFor) ? autoOverdueFor : null,
    prevColumnId: prevColumnId || null,
    progress: clampProgress(raw.progress),
  };
}

function readColumn(raw: unknown, path: string, warn: (key: TKey, vars?: Issue['vars']) => void) {
  if (!isObj(raw)) {
    warn('imp.skipItem', { path });
    return null;
  }
  const id = str(raw.id)?.trim();
  const title = str(raw.title)?.trim();
  if (!id || !title) {
    warn('imp.skipItem', { path });
    return null;
  }
  let color = str(raw.color) ?? '';
  if (!COLOR_RE.test(color)) {
    if (raw.color !== undefined) warn('imp.fixedField', { path, field: 'color' });
    color = '#4f8ff7';
  }
  const builtin = BUILTIN_COLUMNS.includes(raw.builtin as BuiltinColumn) ? (raw.builtin as BuiltinColumn) : undefined;
  const col: Column = { id, title, color, isDone: raw.isDone === true || builtin === 'done', taskIds: [] };
  if (builtin) col.builtin = builtin;
  const card = str(raw.cardColor);
  if (card && (card === 'status' || card === 'none' || COLOR_RE.test(card))) col.cardColor = card;
  else if (raw.cardColor !== undefined) warn('imp.fixedField', { path, field: 'cardColor' });
  return col;
}

function readFilters(raw: unknown, columnIds: Set<string>, warn: (key: TKey, vars?: Issue['vars']) => void): SavedFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedFilter[] = [];
  const ids = new Set<string>();
  raw.forEach((f, i) => {
    const path = `filters[${i}]`;
    if (!isObj(f) || !str(f.id) || ids.has(f.id as string)) {
      warn('imp.skipItem', { path });
      return;
    }
    ids.add(f.id as string);
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    const labelKey = f.labelKey === 'prio.high' || f.labelKey === 'filter.overdue' ? f.labelKey : undefined;
    const name = str(f.name);
    if (!name && !labelKey) {
      warn('imp.skipItem', { path });
      return;
    }
    out.push({
      id: f.id as string,
      name: name ?? null,
      ...(labelKey ? { labelKey } : {}),
      priorities: arr(f.priorities).filter((p): p is Priority => PRIORITIES.includes(p as Priority)),
      tags: arr(f.tags),
      columnIds: arr(f.columnIds).filter((c) => columnIds.has(c)),
      due: DUE_RULES.includes(f.due as DueRule) ? (f.due as DueRule) : 'any',
      hideDone: f.hideDone === true,
    });
  });
  return out;
}

function readReminders(raw: unknown, tasks: Record<string, Task>): Reminder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Reminder =>
        isObj(r) && typeof r.id === 'string' && typeof r.taskId === 'string' && r.taskId in tasks && typeof r.at === 'string',
    )
    .map((r) => ({
      id: r.id,
      taskId: r.taskId,
      at: r.at,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
      read: r.read === true,
    }))
    .slice(0, 50);
}

/** Đọc file xuất định dạng hiện tại (bảng phẳng) */
function readV2(f: Obj, warnings: Issue[]): ImportResult {
  const warn = (key: TKey, vars?: Issue['vars']) => warnings.push({ key, vars });
  if (!Array.isArray(f.columns) || !Array.isArray(f.tasks)) return { ok: false, errors: [{ key: 'imp.missingLists' }] };

  const columns: Column[] = [];
  const colIds = new Set<string>();
  const colRaw = f.columns
    .map((c, i) => ({ c, i, pos: isObj(c) && typeof c.position === 'number' ? c.position : i }))
    .sort((a, b) => a.pos - b.pos);
  for (const { c, i } of colRaw) {
    const col = readColumn(c, `columns[${i}]`, warn);
    if (!col) continue;
    if (colIds.has(col.id)) {
      warn('imp.duplicateId', { path: `columns[${i}]`, id: col.id });
      continue;
    }
    colIds.add(col.id);
    columns.push(col);
  }
  if (columns.length === 0) return { ok: false, errors: [{ key: 'imp.noColumns' }] };

  const tasks: Record<string, Task> = {};
  const placed: { id: string; columnId: string; position: number; i: number }[] = [];
  const fallback = columns.find((c) => c.builtin === 'todo') ?? columns.find((c) => !c.isDone) ?? columns[0];
  (f.tasks as unknown[]).forEach((raw, i) => {
    const path = `tasks[${i}]`;
    const task = readTask(raw, path, warn);
    if (!task) return;
    if (tasks[task.id]) {
      warn('imp.duplicateId', { path, id: task.id });
      return;
    }
    const r = raw as RawTask;
    let columnId = str(r.columnId) ?? '';
    if (!colIds.has(columnId)) {
      warn('imp.unknownColumn', { path });
      columnId = fallback.id;
    }
    tasks[task.id] = task;
    placed.push({ id: task.id, columnId, position: typeof r.position === 'number' ? r.position : Number.MAX_SAFE_INTEGER, i });
  });
  placed.sort((a, b) => a.position - b.position || a.i - b.i);
  const byCol = new Map(columns.map((c) => [c.id, c]));
  for (const p of placed) byCol.get(p.columnId)!.taskIds.push(p.id);
  finishDone(columns, tasks);

  const filters = readFilters(f.filters, colIds, warn);
  const reminders = readReminders(f.reminders, tasks);
  return {
    ok: true,
    data: { columns, tasks, filters, reminders },
    warnings,
    sourceVersion: 2,
    exportedAt: str(f.exportedAt),
    counts: { columns: columns.length, tasks: placed.length, filters: filters.length, reminders: reminders.length },
  };
}

/** Đọc định dạng cũ: { app: 'kanban-todo', version: 1, columns: [{..., taskIds}], tasks: {id: task} } hoặc bản lưu localStorage */
function readV1(src: Obj, warnings: Issue[]): ImportResult {
  const warn = (key: TKey, vars?: Issue['vars']) => warnings.push({ key, vars });
  if (!Array.isArray(src.columns) || !isObj(src.tasks)) return { ok: false, errors: [{ key: 'imp.missingLists' }] };
  const tasks: Record<string, Task> = {};
  for (const [id, v] of Object.entries(src.tasks)) {
    const task = readTask(isObj(v) ? { ...v, id: str(v.id) ?? id } : v, `tasks.${id}`, warn);
    if (task) tasks[task.id] = task;
  }
  const columns: Column[] = [];
  const used = new Set<string>();
  src.columns.forEach((c, i) => {
    const col = readColumn(c, `columns[${i}]`, warn);
    if (!col || columns.some((x) => x.id === col.id)) return;
    const ids = isObj(c) && Array.isArray(c.taskIds) ? c.taskIds : [];
    col.taskIds = ids.filter((id): id is string => typeof id === 'string' && id in tasks && !used.has(id));
    col.taskIds.forEach((id) => used.add(id));
    columns.push(col);
  });
  if (columns.length === 0) return { ok: false, errors: [{ key: 'imp.noColumns' }] };
  // Việc không nằm trong cột nào: đưa vào cột mở đầu tiên
  const orphan = Object.keys(tasks).filter((id) => !used.has(id));
  if (orphan.length) {
    const fallback = columns.find((c) => c.builtin === 'todo') ?? columns.find((c) => !c.isDone) ?? columns[0];
    fallback.taskIds.push(...orphan);
    warn('imp.orphans', { n: orphan.length });
  }
  finishDone(columns, tasks);
  const colIds = new Set(columns.map((c) => c.id));
  const filters = Array.isArray(src.filters) ? readFilters(src.filters, colIds, warn) : undefined;
  const reminders = Array.isArray(src.reminders) ? readReminders(src.reminders, tasks) : undefined;
  return {
    ok: true,
    data: { columns, tasks, filters, reminders },
    warnings,
    sourceVersion: 1,
    exportedAt: null,
    counts: { columns: columns.length, tasks: Object.keys(tasks).length, filters: filters?.length ?? 0, reminders: reminders?.length ?? 0 },
  };
}

/** Việc trong cột Hoàn thành phải có completedAt và ngược lại */
function finishDone(columns: Column[], tasks: Record<string, Task>) {
  for (const c of columns)
    for (const id of c.taskIds) {
      const x = tasks[id];
      if (c.isDone && !x.completedAt) x.completedAt = x.updatedAt ?? x.createdAt;
      if (!c.isDone && x.completedAt) x.completedAt = null;
    }
}

export function parseImport(raw: unknown): ImportResult {
  const warnings: Issue[] = [];
  if (!isObj(raw)) return { ok: false, errors: [{ key: 'imp.notObject' }] };
  if (raw.format === EXPORT_FORMAT) {
    const v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
    if (v > EXPORT_VERSION) return { ok: false, errors: [{ key: 'imp.newerVersion', vars: { v } }] };
    if (v < 2) return { ok: false, errors: [{ key: 'imp.unknownFormat' }] };
    return readV2(raw, warnings);
  }
  // Bản lưu localStorage của zustand: { state: {...}, version }
  if (isObj(raw.state) && Array.isArray(raw.state.columns)) return readV1(raw.state, warnings);
  if (Array.isArray(raw.columns) && isObj(raw.tasks)) return readV1(raw, warnings);
  return { ok: false, errors: [{ key: 'imp.unknownFormat' }] };
}
