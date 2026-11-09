/**
 * Đọc / ghi toàn bộ dữ liệu của một người dùng.
 * Định dạng trao đổi với trình duyệt chính là file xuất JSON (schemaVersion 2, xem docs/export-format.md),
 * nên server và client dùng chung một bộ kiểm tra: parseImport() trong src/data/exchange.ts.
 */
import type pg from 'pg';
import { EXPORT_FORMAT, EXPORT_VERSION, parseImport, type ExportFile } from '../../src/data/exchange.js';
import { db, tx } from './db.js';
import { HttpError } from './http.js';

export interface BoardResponse {
  revision: number;
  /** null = người dùng chưa có dữ liệu nào trên server */
  file: ExportFile | null;
}

const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());
const hm = (v: string | null) => (v ? v.slice(0, 5) : null);

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export async function readBoard(userId: string): Promise<BoardResponse> {
  const q = db();
  const [board, cols, tasks, filters, reminders] = await Promise.all([
    q.query('select revision, timezone, updated_at from boards where user_id = $1', [userId]),
    q.query('select * from board_columns where user_id = $1 order by position', [userId]),
    q.query('select * from tasks where user_id = $1 order by column_id, position', [userId]),
    q.query('select * from saved_filters where user_id = $1 order by position', [userId]),
    q.query('select * from reminders where user_id = $1 order by created_at desc', [userId]),
  ]);
  const b = board.rows[0];
  const revision: number = b?.revision ?? 0;
  if (cols.rows.length === 0) return { revision, file: null };

  const file: ExportFile = {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    timezone: b?.timezone ?? 'UTC',
    settings: { lang: 'vi', theme: 'dark', view: 'kanban', calendarMode: 'week', calendarHiddenTags: [] },
    counts: { columns: cols.rows.length, tags: 0, tasks: tasks.rows.length, filters: filters.rows.length, reminders: reminders.rows.length },
    columns: cols.rows.map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color,
      isDone: c.is_done,
      builtin: c.builtin,
      position: c.position,
    })),
    tags: [],
    tasks: tasks.rows.map((t) => ({
      id: t.id,
      columnId: t.column_id,
      position: t.position,
      title: t.title,
      note: t.note,
      priority: t.priority,
      dueDate: t.due_date,
      startTime: hm(t.start_time),
      endTime: hm(t.end_time),
      tags: t.tags,
      createdAt: iso(t.created_at)!,
      updatedAt: iso(t.updated_at)!,
      completedAt: iso(t.completed_at),
      autoOverdueFor: t.auto_overdue_for,
      prevColumnId: t.prev_column_id,
    })),
    filters: filters.rows.map((f) => ({
      id: f.id,
      name: f.name,
      ...(f.label_key ? { labelKey: f.label_key } : {}),
      priorities: f.priorities,
      tags: f.tags,
      columnIds: f.column_ids,
      due: f.due,
      hideDone: f.hide_done,
    })),
    reminders: reminders.rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      at: String(r.at_local).slice(0, 16).replace(' ', 'T'),
      createdAt: iso(r.created_at)!,
      read: r.read,
    })),
  };
  return { revision, file };
}

/**
 * Thay toàn bộ dữ liệu của người dùng bằng `raw` (file xuất JSON).
 * baseRevision phải bằng revision hiện tại trên server, nếu không trả 409 để client tải bản mới.
 */
export async function writeBoard(userId: string, baseRevision: number, raw: unknown) {
  const parsed = parseImport(raw);
  if (!parsed.ok) throw new HttpError(400, 'invalid_board', { issues: parsed.errors });
  const { columns, tasks, filters = [], reminders = [] } = parsed.data;
  const timezone = validTimezone((raw as { timezone?: unknown }).timezone);

  const colRows = columns.map((c, position) => ({
    id: c.id,
    title: c.title.slice(0, 200),
    color: c.color,
    is_done: c.isDone,
    builtin: c.builtin ?? null,
    position,
  }));
  const taskRows = columns.flatMap((c) =>
    c.taskIds.map((id, position) => {
      const t = tasks[id];
      return {
        id: t.id,
        column_id: c.id,
        position,
        title: t.title.slice(0, 500),
        note: t.note.slice(0, 20_000),
        priority: t.priority,
        due_date: t.dueDate,
        start_time: t.startTime ?? null,
        end_time: t.endTime ?? null,
        tags: t.tags,
        created_at: t.createdAt,
        updated_at: t.updatedAt ?? t.createdAt,
        completed_at: t.completedAt,
        auto_overdue_for: t.autoOverdueFor ?? null,
        prev_column_id: t.prevColumnId ?? null,
      };
    }),
  );
  const filterRows = filters.map((f, position) => ({
    id: f.id,
    name: f.name,
    label_key: f.labelKey ?? null,
    priorities: f.priorities,
    tags: f.tags,
    column_ids: f.columnIds,
    due: f.due,
    hide_done: f.hideDone,
    position,
  }));
  const reminderRows = reminders.map((r) => ({
    id: r.id,
    task_id: r.taskId,
    at_local: r.at,
    created_at: r.createdAt,
    read: r.read,
  }));

  return tx(async (c: pg.PoolClient) => {
    await c.query('insert into boards (user_id) values ($1) on conflict (user_id) do nothing', [userId]);
    const { rows } = await c.query<{ revision: number }>('select revision from boards where user_id = $1 for update', [userId]);
    const current = rows[0].revision;
    if (current !== baseRevision) throw new HttpError(409, 'conflict', { revision: current });

    await c.query('delete from reminders where user_id = $1', [userId]);
    await c.query('delete from saved_filters where user_id = $1', [userId]);
    await c.query('delete from tasks where user_id = $1', [userId]);
    await c.query('delete from board_columns where user_id = $1', [userId]);

    await c.query(
      `insert into board_columns (user_id, id, title, color, is_done, builtin, position)
       select $1, x.id, x.title, x.color, x.is_done, x.builtin, x.position
       from jsonb_to_recordset($2::jsonb) as x(id text, title text, color text, is_done boolean, builtin text, position int)`,
      [userId, JSON.stringify(colRows)],
    );
    if (taskRows.length)
      await c.query(
        `insert into tasks (user_id, id, column_id, position, title, note, priority, due_date, start_time, end_time, tags,
                            created_at, updated_at, completed_at, auto_overdue_for, prev_column_id)
         select $1, x.id, x.column_id, x.position, x.title, x.note, x.priority, x.due_date, x.start_time, x.end_time, x.tags,
                x.created_at, x.updated_at, x.completed_at, x.auto_overdue_for, x.prev_column_id
         from jsonb_to_recordset($2::jsonb) as x(id text, column_id text, position int, title text, note text, priority text,
              due_date date, start_time time, end_time time, tags text[], created_at timestamptz, updated_at timestamptz,
              completed_at timestamptz, auto_overdue_for date, prev_column_id text)`,
        [userId, JSON.stringify(taskRows)],
      );
    if (filterRows.length)
      await c.query(
        `insert into saved_filters (user_id, id, name, label_key, priorities, tags, column_ids, due, hide_done, position)
         select $1, x.id, x.name, x.label_key, x.priorities, x.tags, x.column_ids, x.due, x.hide_done, x.position
         from jsonb_to_recordset($2::jsonb) as x(id text, name text, label_key text, priorities text[], tags text[],
              column_ids text[], due text, hide_done boolean, position int)`,
        [userId, JSON.stringify(filterRows)],
      );
    if (reminderRows.length)
      await c.query(
        `insert into reminders (user_id, id, task_id, at_local, created_at, read)
         select $1, x.id, x.task_id, x.at_local, x.created_at, x.read
         from jsonb_to_recordset($2::jsonb) as x(id text, task_id text, at_local timestamp, created_at timestamptz, read boolean)`,
        [userId, JSON.stringify(reminderRows)],
      );

    const next = await c.query<{ revision: number }>(
      'update boards set revision = revision + 1, timezone = $2, updated_at = now() where user_id = $1 returning revision',
      [userId, timezone],
    );
    return { revision: next.rows[0].revision, warnings: parsed.warnings.length };
  });
}
