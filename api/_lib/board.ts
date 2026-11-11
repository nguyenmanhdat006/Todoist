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

/** Dòng bảng board_columns → cột trong file xuất */
export function mapColumnRow(c: Record<string, any>) {
  return {
    id: c.id as string,
    title: c.title as string,
    color: c.color as string,
    isDone: c.is_done as boolean,
    builtin: c.builtin ?? null,
    position: c.position as number,
    cardColor: (c.card_color ?? 'status') as string,
  };
}

/** Dòng bảng tasks → việc trong file xuất */
export function mapTaskRow(t: Record<string, any>) {
  return {
    id: t.id as string,
    columnId: t.column_id as string,
    position: t.position as number,
    title: t.title as string,
    note: t.note as string,
    priority: t.priority,
    dueDate: t.due_date as string | null,
    startTime: hm(t.start_time),
    endTime: hm(t.end_time),
    tags: t.tags as string[],
    createdAt: iso(t.created_at)!,
    updatedAt: iso(t.updated_at)!,
    completedAt: iso(t.completed_at),
    autoOverdueFor: (t.auto_overdue_for ?? null) as string | null,
    prevColumnId: (t.prev_column_id ?? null) as string | null,
    progress: (t.progress ?? 0) as number,
    assignees: (t.assignees ?? []) as string[],
    number: (t.number ?? null) as number | null,
    creatorId: (t.creator_id ?? null) as string | null,
    assigneeId: (t.assignee_id ?? null) as string | null,
  };
}

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export async function readBoard(boardId: string): Promise<BoardResponse> {
  const q = db();
  const [board, cols, tasks, filters, reminders] = await Promise.all([
    q.query('select revision, timezone, updated_at from boards where board_id = $1', [boardId]),
    q.query('select * from board_columns where board_id = $1 order by position', [boardId]),
    q.query('select * from tasks where board_id = $1 order by column_id, position', [boardId]),
    q.query('select * from saved_filters where board_id = $1 order by position', [boardId]),
    q.query('select * from reminders where board_id = $1 order by created_at desc', [boardId]),
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
    columns: cols.rows.map(mapColumnRow),
    tags: [],
    tasks: tasks.rows.map(mapTaskRow),
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
/**
 * allowedAssignees: id người được phép gắn vào việc (thành viên dự án, hoặc bạn bè + chính mình ở bảng cá nhân).
 * Id lạ bị bỏ đi để không gắn được người ngoài.
 */
export async function writeBoard(boardId: string, baseRevision: number, raw: unknown, allowedAssignees: Set<string>, writerId: string) {
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
    card_color: c.cardColor ?? 'status',
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
        progress: t.progress ?? 0,
        assignees: (t.assignees ?? []).filter((id) => allowedAssignees.has(id)),
        assignee_id: t.assigneeId && allowedAssignees.has(t.assigneeId) ? t.assigneeId : null,
        // số và người tạo do máy chủ quyết định ở bên dưới
        number: null as number | null,
        creator_id: null as string | null,
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
    await c.query('insert into boards (board_id) values ($1) on conflict (board_id) do nothing', [boardId]);
    const { rows } = await c.query<{ revision: number }>('select revision from boards where board_id = $1 for update', [boardId]);
    const current = rows[0].revision;
    if (current !== baseRevision) throw new HttpError(409, 'conflict', { revision: current });

    // Việc đã có giữ nguyên số và người tạo (client không được tự đặt); việc mới được cấp số tiếp theo của dự án
    const existing = new Map(
      (await c.query<{ id: string; number: number | null; creator_id: string | null }>('select id, number, creator_id from tasks where board_id = $1', [boardId])).rows.map((r) => [
        r.id,
        r,
      ]),
    );
    const fresh = taskRows.filter((r) => !existing.has(r.id));
    const proj = await c.query<{ project_id: string }>('select project_id from project_boards where id = $1', [boardId]);
    let nextNumber = 0;
    if (proj.rows[0] && fresh.length) {
      const seq = await c.query<{ ticket_seq: number }>('update projects set ticket_seq = ticket_seq + $2 where id = $1 returning ticket_seq', [
        proj.rows[0].project_id,
        fresh.length,
      ]);
      nextNumber = seq.rows[0].ticket_seq - fresh.length + 1;
    }
    const assigned: Record<string, { number: number | null; creatorId: string | null }> = {};
    // Việc mới đánh số theo thứ tự tạo
    const order = [...fresh].sort((a, z) => (a.created_at < z.created_at ? -1 : a.created_at > z.created_at ? 1 : 0));
    const numberOf = new Map(order.map((r, i) => [r.id, proj.rows[0] ? nextNumber + i : null]));
    for (const r of taskRows) {
      const ex = existing.get(r.id);
      if (ex) {
        r.number = ex.number;
        r.creator_id = ex.creator_id;
      } else {
        r.number = numberOf.get(r.id) ?? null;
        r.creator_id = writerId;
        assigned[r.id] = { number: r.number, creatorId: r.creator_id };
      }
    }

    await c.query('delete from reminders where board_id = $1', [boardId]);
    await c.query('delete from saved_filters where board_id = $1', [boardId]);
    await c.query('delete from tasks where board_id = $1', [boardId]);
    await c.query('delete from board_columns where board_id = $1', [boardId]);

    await c.query(
      `insert into board_columns (board_id, id, title, color, is_done, builtin, position, card_color)
       select $1, x.id, x.title, x.color, x.is_done, x.builtin, x.position, x.card_color
       from jsonb_to_recordset($2::jsonb) as x(id text, title text, color text, is_done boolean, builtin text, position int, card_color text)`,
      [boardId, JSON.stringify(colRows)],
    );
    if (taskRows.length)
      await c.query(
        `insert into tasks (board_id, id, column_id, position, title, note, priority, due_date, start_time, end_time, tags,
                            created_at, updated_at, completed_at, auto_overdue_for, prev_column_id, progress, assignees,
                            number, creator_id, assignee_id)
         select $1, x.id, x.column_id, x.position, x.title, x.note, x.priority, x.due_date, x.start_time, x.end_time, x.tags,
                x.created_at, x.updated_at, x.completed_at, x.auto_overdue_for, x.prev_column_id, x.progress, x.assignees,
                x.number, x.creator_id, x.assignee_id
         from jsonb_to_recordset($2::jsonb) as x(id text, column_id text, position int, title text, note text, priority text,
              due_date date, start_time time, end_time time, tags text[], created_at timestamptz, updated_at timestamptz,
              completed_at timestamptz, auto_overdue_for date, prev_column_id text, progress smallint, assignees uuid[],
              number int, creator_id uuid, assignee_id uuid)`,
        [boardId, JSON.stringify(taskRows)],
      );
    if (filterRows.length)
      await c.query(
        `insert into saved_filters (board_id, id, name, label_key, priorities, tags, column_ids, due, hide_done, position)
         select $1, x.id, x.name, x.label_key, x.priorities, x.tags, x.column_ids, x.due, x.hide_done, x.position
         from jsonb_to_recordset($2::jsonb) as x(id text, name text, label_key text, priorities text[], tags text[],
              column_ids text[], due text, hide_done boolean, position int)`,
        [boardId, JSON.stringify(filterRows)],
      );
    if (reminderRows.length)
      await c.query(
        `insert into reminders (board_id, id, task_id, at_local, created_at, read)
         select $1, x.id, x.task_id, x.at_local, x.created_at, x.read
         from jsonb_to_recordset($2::jsonb) as x(id text, task_id text, at_local timestamp, created_at timestamptz, read boolean)`,
        [boardId, JSON.stringify(reminderRows)],
      );

    const next = await c.query<{ revision: number }>(
      'update boards set revision = revision + 1, timezone = $2, updated_at = now() where board_id = $1 returning revision',
      [boardId, timezone],
    );
    return { revision: next.rows[0].revision, warnings: parsed.warnings.length, assigned };
  });
}
