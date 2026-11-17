/**
 * Hoạt động của việc: lịch sử thay đổi và bình luận.
 * Lịch sử được ghi tự động khi lưu bảng (so sánh bản cũ với bản mới), nên mọi thiết bị đều ghi giống nhau.
 */
import type pg from 'pg';
import { db } from './db.js';
import { HttpError } from './http.js';

export type EventType = 'created' | 'status' | 'priority' | 'title' | 'description' | 'due' | 'time' | 'assignee' | 'labels' | 'progress';

interface PendingEvent {
  taskId: string;
  type: EventType;
  data: { from?: string | null; to?: string | null };
}

/** Các loại sửa liên tục (gõ chữ, kéo thanh) chỉ giữ một dòng nếu cùng người sửa trong 5 phút */
const COALESCE: EventType[] = ['title', 'description', 'progress'];

const hm = (v: unknown) => (v ? String(v).slice(0, 5) : null);
const dateOf = (v: unknown) => (v ? String(v).slice(0, 10) : null);

interface TaskLike {
  id: string;
  column_id: string;
  title: string;
  note: string;
  priority: string;
  due_date: unknown;
  start_time: unknown;
  end_time: unknown;
  tags: string[] | null;
  progress: number | null;
  assignee_id: string | null;
}

/** So sánh việc cũ và mới, trả về các sự kiện cần ghi */
export function diffTasks(
  before: Map<string, TaskLike>,
  after: TaskLike[],
  colTitleBefore: Map<string, string>,
  colTitleAfter: Map<string, string>,
): PendingEvent[] {
  const out: PendingEvent[] = [];
  for (const n of after) {
    const o = before.get(n.id);
    if (!o) {
      out.push({ taskId: n.id, type: 'created', data: {} });
      continue;
    }
    const add = (type: EventType, from: string | null, to: string | null) => from !== to && out.push({ taskId: n.id, type, data: { from, to } });
    if (o.column_id !== n.column_id) add('status', colTitleBefore.get(o.column_id) ?? null, colTitleAfter.get(n.column_id) ?? null);
    add('title', o.title, n.title);
    if (o.note !== n.note) out.push({ taskId: n.id, type: 'description', data: {} });
    add('priority', o.priority, n.priority);
    add('due', dateOf(o.due_date), dateOf(n.due_date));
    const ot = `${hm(o.start_time) ?? ''}-${hm(o.end_time) ?? ''}`;
    const nt = `${hm(n.start_time) ?? ''}-${hm(n.end_time) ?? ''}`;
    if (ot !== nt) out.push({ taskId: n.id, type: 'time', data: { from: ot === '-' ? null : ot, to: nt === '-' ? null : nt } });
    add('assignee', o.assignee_id ?? null, n.assignee_id ?? null);
    add('labels', (o.tags ?? []).join(', ') || null, (n.tags ?? []).join(', ') || null);
    add('progress', String(o.progress ?? 0), String(n.progress ?? 0));
  }
  return out;
}

/** Ghi sự kiện (trong cùng giao dịch với việc lưu bảng) */
export async function recordEvents(c: pg.PoolClient, boardId: string, actorId: string, events: PendingEvent[]) {
  for (const e of events) {
    if (COALESCE.includes(e.type)) {
      const last = await c.query<{ id: string; actor_id: string | null; type: string; data: { from?: string | null } }>(
        `select id::text, actor_id, type, data from task_events
          where board_id = $1 and task_id = $2 order by id desc limit 1`,
        [boardId, e.taskId],
      );
      const l = last.rows[0];
      const recent = l && l.type === e.type && l.actor_id === actorId
        ? (await c.query(`select 1 from task_events where id = $1 and created_at > now() - interval '5 minutes'`, [l.id])).rows.length > 0
        : false;
      if (l && recent) {
        const from = l.data?.from ?? null;
        if (e.type !== 'description' && from === (e.data.to ?? null)) await c.query('delete from task_events where id = $1', [l.id]);
        else await c.query('update task_events set data = $2, created_at = now() where id = $1', [l.id, JSON.stringify({ ...e.data, from })]);
        continue;
      }
    }
    await c.query('insert into task_events (board_id, task_id, actor_id, type, data) values ($1, $2, $3, $4, $5)', [
      boardId,
      e.taskId,
      actorId,
      e.type,
      JSON.stringify(e.data),
    ]);
  }
}

/** Xoá hoạt động của những việc không còn trong bảng */
export async function pruneActivity(c: pg.PoolClient, boardId: string, keepIds: string[]) {
  await c.query('delete from task_events where board_id = $1 and task_id <> all($2::text[])', [boardId, keepIds]);
  await c.query('delete from task_comments where board_id = $1 and task_id <> all($2::text[])', [boardId, keepIds]);
}

interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export async function listActivity(boardId: string, taskId: string) {
  const q = db();
  const [events, comments] = await Promise.all([
    q.query(
      `select id::text, actor_id as "actorId", type, data, created_at as "createdAt"
         from task_events where board_id = $1 and task_id = $2 order by id desc limit 200`,
      [boardId, taskId],
    ),
    q.query(
      `select id::text, author_id as "authorId", body, created_at as "createdAt", edited_at as "editedAt"
         from task_comments where board_id = $1 and task_id = $2 order by id desc limit 200`,
      [boardId, taskId],
    ),
  ]);
  const ids = new Set<string>();
  for (const e of events.rows) {
    if (e.actorId) ids.add(e.actorId);
    if (e.type === 'assignee') for (const k of ['from', 'to']) if (e.data?.[k]) ids.add(e.data[k]);
  }
  for (const c of comments.rows) if (c.authorId) ids.add(c.authorId);
  let users: PublicUser[] = [];
  if (ids.size) {
    users = (await q.query<PublicUser>('select id, email, name from users where id = any($1::uuid[])', [[...ids]])).rows;
  }
  return { events: events.rows, comments: comments.rows, users };
}

export async function addComment(boardId: string, taskId: string, authorId: string, raw: unknown) {
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw new HttpError(400, 'empty_comment');
  if (body.length > 5000) throw new HttpError(400, 'comment_too_long');
  const { rows } = await db().query(
    `insert into task_comments (board_id, task_id, author_id, body) values ($1, $2, $3, $4)
     returning id::text, author_id as "authorId", body, created_at as "createdAt", edited_at as "editedAt"`,
    [boardId, taskId, authorId, body],
  );
  return rows[0];
}

/** Chỉ người viết mới xoá được bình luận của mình */
export async function deleteComment(boardId: string, commentId: string, me: string) {
  if (!/^\d+$/.test(commentId)) throw new HttpError(400, 'bad_id');
  const { rowCount } = await db().query('delete from task_comments where id = $1 and board_id = $2 and author_id = $3', [commentId, boardId, me]);
  if (!rowCount) throw new HttpError(404, 'comment_not_found');
}

/** Chỉ người viết mới sửa được bình luận của mình */
export async function editComment(boardId: string, commentId: string, me: string, raw: unknown) {
  if (!/^\d+$/.test(commentId)) throw new HttpError(400, 'bad_id');
  const body = typeof raw === 'string' ? raw.trim() : '';
  if (!body) throw new HttpError(400, 'empty_comment');
  if (body.length > 5000) throw new HttpError(400, 'comment_too_long');
  const { rows } = await db().query(
    `update task_comments set body = $4, edited_at = now() where id = $1 and board_id = $2 and author_id = $3
     returning id::text, author_id as "authorId", body, created_at as "createdAt", edited_at as "editedAt"`,
    [commentId, boardId, me, body],
  );
  if (!rows[0]) throw new HttpError(404, 'comment_not_found');
  return rows[0];
}
