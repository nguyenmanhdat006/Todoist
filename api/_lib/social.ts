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

export async function listProjects(me: string) {
  const { rows } = await db().query(
    `select p.id, p.name, p.owner_id as "ownerId", pm.role,
            (select count(*)::int from project_members x where x.project_id = p.id) as "memberCount"
       from projects p join project_members pm on pm.project_id = p.id and pm.user_id = $1
      order by p.created_at`,
    [me],
  );
  return rows;
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
  return { project: { ...rows[0], role }, members: await projectMembers(projectId) };
}

export async function createProject(me: string, rawName: unknown) {
  const name = readName(rawName);
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string }>('insert into projects (name, owner_id) values ($1, $2) returning id', [name, me]);
    const id = rows[0].id;
    await c.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'host')`, [id, me]);
    await c.query('insert into boards (board_id) values ($1)', [id]);
    return { id, name, ownerId: me, role: 'host', memberCount: 1 };
  });
}

export async function renameProject(me: string, projectId: string, rawName: unknown) {
  await requireHost(me, projectId);
  const name = readName(rawName);
  await db().query('update projects set name = $2 where id = $1', [projectId, name]);
  return { id: projectId, name };
}

export async function deleteProject(me: string, projectId: string) {
  await requireHost(me, projectId);
  await tx(async (c) => {
    for (const table of ['reminders', 'saved_filters', 'tasks', 'board_columns', 'boards'])
      await c.query(`delete from ${table} where board_id = $1`, [projectId]);
    await c.query('delete from projects where id = $1', [projectId]);
  });
}

export async function addMember(me: string, projectId: string, memberId: string) {
  await requireHost(me, projectId);
  if (!(await areFriends(me, memberId))) throw new HttpError(400, 'not_friend');
  await db().query(
    `insert into project_members (project_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`,
    [projectId, memberId],
  );
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

/** Bảng nào được đọc/ghi và những ai được gắn vào việc trên bảng đó */
export async function boardAccess(me: string, project: unknown) {
  if (project === undefined || project === null || project === '') {
    return { boardId: me, allowed: new Set([me, ...(await friendIds(me))]) };
  }
  const projectId = requireUuid(project, 'bad_project');
  await projectRole(me, projectId);
  const members = await projectMembers(projectId);
  return { boardId: projectId, allowed: new Set(members.map((m) => m.id)) };
}
