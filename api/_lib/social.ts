/**
 * Bạn bè và dự án dùng chung.
 *  - Kết bạn bằng email: gửi lời mời → người kia chấp nhận. Nếu hai bên cùng mời nhau thì tự thành bạn.
 *  - Dự án: người tạo là host; host thêm/bớt thành viên (phải là bạn của host), đổi tên, xoá dự án.
 *    Thành viên xem và sửa bảng của dự án, có thể tự rời dự án.
 */
import { db, tx } from './db.js';
import { HttpError } from './http.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(v: unknown, code = 'bad_id'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, code);
  return v.toLowerCase();
}

/* ---------------- bạn bè ---------------- */

export async function listFriends(me: string) {
  const { rows } = await db().query<PublicUser & { status: string; requester: string; at: string }>(
    `select u.id, u.email, u.name, f.status, f.requester, coalesce(f.accepted_at, f.created_at) as at
       from friendships f
       join users u on u.id = case when f.requester = $1 then f.addressee else f.requester end
      where f.requester = $1 or f.addressee = $1
      order by u.name, u.email`,
    [me],
  );
  const pick = (r: PublicUser) => ({ id: r.id, email: r.email, name: r.name });
  return {
    friends: rows.filter((r) => r.status === 'accepted').map(pick),
    incoming: rows.filter((r) => r.status === 'pending' && r.requester !== me).map(pick),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requester === me).map(pick),
  };
}

export async function friendIds(me: string): Promise<string[]> {
  const { rows } = await db().query<{ id: string }>(
    `select case when requester = $1 then addressee else requester end as id
       from friendships where status = 'accepted' and (requester = $1 or addressee = $1)`,
    [me],
  );
  return rows.map((r) => r.id);
}

async function areFriends(a: string, b: string) {
  const { rows } = await db().query(
    `select 1 from friendships where status = 'accepted'
       and ((requester = $1 and addressee = $2) or (requester = $2 and addressee = $1))`,
    [a, b],
  );
  return rows.length > 0;
}

export async function requestFriend(me: string, rawEmail: unknown) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!email || email.length > 254) throw new HttpError(400, 'invalid_email');
  const { rows: found } = await db().query<PublicUser>('select id, email, name from users where email = $1', [email]);
  const other = found[0];
  if (!other) throw new HttpError(404, 'user_not_found');
  if (other.id === me) throw new HttpError(400, 'self_friend');

  return tx(async (c) => {
    const { rows } = await c.query<{ requester: string; status: string }>(
      `select requester, status from friendships
        where (requester = $1 and addressee = $2) or (requester = $2 and addressee = $1) for update`,
      [me, other.id],
    );
    const row = rows[0];
    if (row?.status === 'accepted') throw new HttpError(409, 'already_friends');
    if (row && row.requester === me) throw new HttpError(409, 'already_requested');
    if (row) {
      // Người kia đã mời mình trước: chấp nhận luôn
      await c.query(`update friendships set status = 'accepted', accepted_at = now() where requester = $1 and addressee = $2`, [
        other.id,
        me,
      ]);
      return { user: other, status: 'accepted' as const };
    }
    await c.query(`insert into friendships (requester, addressee, status) values ($1, $2, 'pending')`, [me, other.id]);
    return { user: other, status: 'pending' as const };
  });
}

export async function acceptFriend(me: string, otherId: string) {
  const { rowCount } = await db().query(
    `update friendships set status = 'accepted', accepted_at = now()
      where requester = $1 and addressee = $2 and status = 'pending'`,
    [otherId, me],
  );
  if (!rowCount) throw new HttpError(404, 'request_not_found');
}

/** Huỷ lời mời đã gửi, từ chối lời mời nhận được, hoặc huỷ kết bạn */
export async function removeFriend(me: string, otherId: string) {
  await db().query(
    `delete from friendships where (requester = $1 and addressee = $2) or (requester = $2 and addressee = $1)`,
    [me, otherId],
  );
}

/* ---------------- dự án ---------------- */

function readName(v: unknown) {
  const name = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80) throw new HttpError(400, 'invalid_name');
  return name;
}

export interface BoardInfo {
  id: string;
  name: string;
  position: number;
}

async function boardsOf(projectIds: string[]): Promise<Map<string, BoardInfo[]>> {
  const out = new Map<string, BoardInfo[]>();
  if (!projectIds.length) return out;
  const { rows } = await db().query<BoardInfo & { project_id: string }>(
    'select id, name, position, project_id from project_boards where project_id = any($1::uuid[]) order by position, created_at',
    [projectIds],
  );
  for (const r of rows) {
    const list = out.get(r.project_id) ?? [];
    list.push({ id: r.id, name: r.name, position: r.position });
    out.set(r.project_id, list);
  }
  return out;
}

export async function listProjects(me: string) {
  const { rows } = await db().query(
    `select p.id, p.name, p.owner_id as "ownerId", pm.role,
            (select count(*)::int from project_members x where x.project_id = p.id) as "memberCount"
       from projects p join project_members pm on pm.project_id = p.id and pm.user_id = $1
      order by p.created_at`,
    [me],
  );
  const boards = await boardsOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, boards: boards.get(r.id) ?? [] }));
}

/** Vai trò của me trong dự án; báo 404 nếu không phải thành viên (không lộ dự án của người khác) */
export async function projectRole(me: string, projectId: string): Promise<'host' | 'member'> {
  const { rows } = await db().query<{ role: 'host' | 'member' }>(
    'select role from project_members where project_id = $1 and user_id = $2',
    [projectId, me],
  );
  if (!rows[0]) throw new HttpError(404, 'project_not_found');
  return rows[0].role;
}

async function requireHost(me: string, projectId: string) {
  if ((await projectRole(me, projectId)) !== 'host') throw new HttpError(403, 'host_only');
}

export async function projectMembers(projectId: string) {
  const { rows } = await db().query<PublicUser & { role: string }>(
    `select u.id, u.email, u.name, pm.role
       from project_members pm join users u on u.id = pm.user_id
      where pm.project_id = $1
      order by (pm.role = 'host') desc, u.name, u.email`,
    [projectId],
  );
  return rows;
}

export async function getProject(me: string, projectId: string) {
  const role = await projectRole(me, projectId);
  const { rows } = await db().query('select id, name, owner_id as "ownerId", created_at as "createdAt" from projects where id = $1', [
    projectId,
  ]);
  const boards = (await boardsOf([projectId])).get(projectId) ?? [];
  return { project: { ...rows[0], role, boards }, members: await projectMembers(projectId) };
}

/** Tạo dự án kèm bảng đầu tiên; người tạo là host */
export async function createProject(me: string, rawName: unknown, rawBoardName: unknown) {
  const name = readName(rawName);
  const boardName = typeof rawBoardName === 'string' && rawBoardName.trim() ? readName(rawBoardName) : 'Bảng chính';
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string }>('insert into projects (name, owner_id) values ($1, $2) returning id', [name, me]);
    const id = rows[0].id;
    await c.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'host')`, [id, me]);
    const b = await c.query<{ id: string }>('insert into project_boards (project_id, name, position) values ($1, $2, 0) returning id', [
      id,
      boardName,
    ]);
    await c.query('insert into boards (board_id) values ($1)', [b.rows[0].id]);
    return { id, name, ownerId: me, role: 'host', memberCount: 1, boards: [{ id: b.rows[0].id, name: boardName, position: 0 }] };
  });
}

export async function renameProject(me: string, projectId: string, rawName: unknown) {
  await requireHost(me, projectId);
  const name = readName(rawName);
  await db().query('update projects set name = $2 where id = $1', [projectId, name]);
  return { id: projectId, name };
}

const BOARD_TABLES = ['reminders', 'saved_filters', 'tasks', 'board_columns', 'boards'];

export async function deleteProject(me: string, projectId: string) {
  await requireHost(me, projectId);
  await tx(async (c) => {
    const { rows } = await c.query<{ id: string }>('select id from project_boards where project_id = $1', [projectId]);
    const ids = [projectId, ...rows.map((r) => r.id)];
    for (const table of BOARD_TABLES) await c.query(`delete from ${table} where board_id = any($1::uuid[])`, [ids]);
    await c.query('delete from projects where id = $1', [projectId]);
  });
}

/* ---------- bảng trong dự án ---------- */

/** Thành viên nào cũng tạo được bảng mới trong dự án */
export async function createBoard(me: string, projectId: string, rawName: unknown) {
  await projectRole(me, projectId);
  const name = readName(rawName);
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string; position: number }>(
      `insert into project_boards (project_id, name, position)
       values ($1, $2, coalesce((select max(position) + 1 from project_boards where project_id = $1), 0))
       returning id, position`,
      [projectId, name],
    );
    await c.query('insert into boards (board_id) values ($1)', [rows[0].id]);
    return { id: rows[0].id, name, position: rows[0].position };
  });
}

async function boardProject(boardId: string): Promise<string> {
  const { rows } = await db().query<{ project_id: string }>('select project_id from project_boards where id = $1', [boardId]);
  if (!rows[0]) throw new HttpError(404, 'board_not_found');
  return rows[0].project_id;
}

/** Đổi tên bảng: chỉ host */
export async function renameBoard(me: string, boardId: string, rawName: unknown) {
  const projectId = await boardProject(boardId);
  await requireHost(me, projectId);
  const name = readName(rawName);
  await db().query('update project_boards set name = $2 where id = $1', [boardId, name]);
  return { id: boardId, name };
}

/** Xoá bảng: chỉ host, và dự án phải còn ít nhất một bảng */
export async function deleteBoard(me: string, boardId: string) {
  const projectId = await boardProject(boardId);
  await requireHost(me, projectId);
  await tx(async (c) => {
    const { rows } = await c.query<{ n: number }>('select count(*)::int as n from project_boards where project_id = $1', [projectId]);
    if (rows[0].n <= 1) throw new HttpError(400, 'last_board');
    for (const table of BOARD_TABLES) await c.query(`delete from ${table} where board_id = $1`, [boardId]);
    await c.query('delete from project_boards where id = $1', [boardId]);
  });
}

/* ---------- thành viên ---------- */

export async function addMember(me: string, projectId: string, memberId: string) {
  await requireHost(me, projectId);
  if (!(await areFriends(me, memberId))) throw new HttpError(400, 'not_friend');
  const { rowCount } = await db().query(
    `insert into project_members (project_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`,
    [projectId, memberId],
  );
  if (rowCount) {
    // Báo cho người vừa được thêm
    const { rows } = await db().query<{ project: string; host: string }>(
      `select p.name as project, coalesce(nullif(u.name, ''), u.email) as host
         from projects p, users u where p.id = $1 and u.id = $2`,
      [projectId, me],
    );
    await notify(memberId, 'project_added', { projectId, projectName: rows[0]?.project, by: rows[0]?.host });
  }
  return projectMembers(projectId);
}

/** Host bỏ một thành viên, hoặc thành viên tự rời dự án (host không rời được, chỉ xoá dự án) */
export async function removeMember(me: string, projectId: string, memberId: string) {
  const role = await projectRole(me, projectId);
  if (memberId === me) {
    if (role === 'host') throw new HttpError(400, 'host_cannot_leave');
  } else if (role !== 'host') {
    throw new HttpError(403, 'host_only');
  }
  await db().query(`delete from project_members where project_id = $1 and user_id = $2 and role <> 'host'`, [projectId, memberId]);
  return memberId === me ? [] : projectMembers(projectId);
}

/* ---------- thông báo ---------- */

export async function notify(userId: string, type: string, data: Record<string, unknown>) {
  await db().query('insert into notifications (user_id, type, data) values ($1, $2, $3)', [userId, type, JSON.stringify(data)]);
}

export async function listNotifications(me: string) {
  const { rows } = await db().query(
    `select id::text, type, data, created_at as "createdAt", read_at is not null as read
       from notifications where user_id = $1 order by created_at desc limit 30`,
    [me],
  );
  return rows;
}

/** Đánh dấu đã đọc theo danh sách id; không truyền thì đánh dấu tất cả */
export async function readNotifications(me: string, ids: unknown) {
  if (Array.isArray(ids)) {
    const list = ids.filter((x): x is string => typeof x === 'string' && /^\d+$/.test(x)).slice(0, 100);
    if (list.length)
      await db().query('update notifications set read_at = now() where user_id = $1 and id = any($2::bigint[]) and read_at is null', [
        me,
        list,
      ]);
  } else {
    await db().query('update notifications set read_at = now() where user_id = $1 and read_at is null', [me]);
  }
  return listNotifications(me);
}

/**
 * Bảng nào được đọc/ghi và những ai được gắn vào việc trên bảng đó.
 *  - không truyền board: bảng cá nhân, chỉ gắn được chính mình
 *  - board = id bảng trong dự án: phải là thành viên dự án, gắn được mọi thành viên
 */
export async function boardAccess(me: string, board: unknown) {
  if (board === undefined || board === null || board === '') {
    return { boardId: me, allowed: new Set([me]) };
  }
  const boardId = requireUuid(board, 'bad_board');
  const { rows } = await db().query<{ project_id: string }>(
    `select pb.project_id from project_boards pb
       join project_members pm on pm.project_id = pb.project_id and pm.user_id = $2
      where pb.id = $1`,
    [boardId, me],
  );
  if (!rows[0]) throw new HttpError(404, 'board_not_found');
  const members = await projectMembers(rows[0].project_id);
  return { boardId, allowed: new Set(members.map((m) => m.id)) };
}
