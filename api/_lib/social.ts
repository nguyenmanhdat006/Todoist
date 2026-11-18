/**
 * Bạn bè và dự án dùng chung.
 *  - Kết bạn bằng email: gửi lời mời → người kia chấp nhận. Nếu hai bên cùng mời nhau thì tự thành bạn.
 *  - Dự án: người tạo là host; host gắn nhóm (team) vào dự án, đổi tên, xoá dự án.
 *    Thành viên của các nhóm gắn vào dự án xem và sửa bảng của dự án (xem teams.ts).
 */
import { db, tx } from './db.js';
import { HttpError } from './http.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarV?: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUuid(v: unknown, code = 'bad_id'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(400, code);
  return v.toLowerCase();
}

/* ---------------- bạn bè ---------------- */

export async function listFriends(me: string) {
  const { rows } = await db().query<PublicUser & { status: string; requester: string; at: string }>(
    `select u.id, u.email, u.name, u.avatar_v as "avatarV", f.status, f.requester, coalesce(f.accepted_at, f.created_at) as at
       from friendships f
       join users u on u.id = case when f.requester = $1 then f.addressee else f.requester end
      where f.requester = $1 or f.addressee = $1
      order by u.name, u.email`,
    [me],
  );
  const pick = (r: PublicUser) => ({ id: r.id, email: r.email, name: r.name, avatarV: r.avatarV ?? null });
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

export async function areFriends(a: string, b: string) {
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
  const { rows: found } = await db().query<PublicUser>('select id, email, name, avatar_v as "avatarV" from users where email = $1', [email]);
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
      await notifyFrom(c, other.id, 'friend_accepted', me);
      return { user: other, status: 'accepted' as const };
    }
    await c.query(`insert into friendships (requester, addressee, status) values ($1, $2, 'pending')`, [me, other.id]);
    await notifyFrom(c, other.id, 'friend_request', me);
    return { user: other, status: 'pending' as const };
  });
}

/** Gửi thông báo tới `to` về việc của người dùng `from` (kèm tên và email để hiện ngay) */
async function notifyFrom(c: { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> }, to: string, type: string, from: string) {
  const { rows } = await c.query('select name, email from users where id = $1', [from]);
  const u = rows[0] ?? {};
  await c.query('insert into notifications (user_id, type, data) values ($1, $2, $3)', [
    to,
    type,
    JSON.stringify({ userId: from, name: u.name ?? '', email: u.email ?? '' }),
  ]);
}

export async function acceptFriend(me: string, otherId: string) {
  const { rowCount } = await db().query(
    `update friendships set status = 'accepted', accepted_at = now()
      where requester = $1 and addressee = $2 and status = 'pending'`,
    [otherId, me],
  );
  if (!rowCount) throw new HttpError(404, 'request_not_found');
  await notifyFrom(db(), otherId, 'friend_accepted', me);
}

/** Huỷ lời mời đã gửi, từ chối lời mời nhận được, hoặc huỷ kết bạn */
export async function removeFriend(me: string, otherId: string) {
  // Từ chối lời mời nhận được: báo cho người gửi. Huỷ lời mời đã gửi hoặc huỷ kết bạn thì không báo.
  const { rowCount: declined } = await db().query(
    `delete from friendships where requester = $2 and addressee = $1 and status = 'pending'`,
    [me, otherId],
  );
  if (declined) {
    await notifyFrom(db(), otherId, 'friend_declined', me);
    return;
  }
  await db().query(
    `delete from friendships where (requester = $1 and addressee = $2) or (requester = $2 and addressee = $1)`,
    [me, otherId],
  );
}

/* ---------------- dự án ---------------- */

/** Mã dự án: 2–6 ký tự, chữ in hoa hoặc số, bắt đầu bằng chữ */
export const KEY_RE = /^[A-Z][A-Z0-9]{1,5}$/;

const VI_FROM = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
const VI_TO = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

/** Chữ cái đầu của tên người dùng (Đạt Nguyễn → "Đ N"), dùng làm mã dự án cá nhân */
async function initialsOf(c: { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> }, userId: string): Promise<string> {
  const { rows } = await c.query('select name, email from users where id = $1', [userId]);
  const u = rows[0] as { name: string; email: string } | undefined;
  const words = (u?.name?.trim() || u?.email?.split('@')[0] || '').split(/\s+/).filter(Boolean);
  return words.map((w) => w[0]).join('');
}

/** Mã mặc định từ tên dự án (tối đa 3 chữ cái, bỏ dấu), thêm số nếu đã có dự án khác dùng */
async function freeKey(c: { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> }, name: string): Promise<string> {
  const letters = [...name.toLowerCase()].map((ch) => { const i = VI_FROM.indexOf(ch); return i >= 0 ? VI_TO[i] : ch; }).join('').toUpperCase().replace(/[^A-Z]/g, '');
  const base = (letters.slice(0, 3) || 'PRJ').padEnd(2, 'X');
  for (let n = 1; n < 1000; n++) {
    const key = n === 1 ? base : `${base}${n}`.slice(0, 6);
    const { rows } = await c.query('select 1 from projects where key = $1', [key]);
    if (!rows[0]) return key;
  }
  throw new HttpError(500, 'server_error');
}

export function readName(v: unknown) {
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
    `select p.id, p.name, p.key, p.owner_id as "ownerId", p.kind, pm.role,
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

export async function requireHost(me: string, projectId: string) {
  if ((await projectRole(me, projectId)) !== 'host') throw new HttpError(403, 'host_only');
}

export async function projectMembers(projectId: string) {
  const { rows } = await db().query<PublicUser & { role: string }>(
    `select u.id, u.email, u.name, u.avatar_v as "avatarV", pm.role
       from project_members pm join users u on u.id = pm.user_id
      where pm.project_id = $1
      order by (pm.role = 'host') desc, u.name, u.email`,
    [projectId],
  );
  return rows;
}

export async function getProject(me: string, projectId: string) {
  const role = await projectRole(me, projectId);
  const { rows } = await db().query('select id, name, key, owner_id as "ownerId", kind, created_at as "createdAt" from projects where id = $1', [
    projectId,
  ]);
  const boards = (await boardsOf([projectId])).get(projectId) ?? [];
  const { rows: teams } = await db().query(
    `select t.id, t.name, (select count(*)::int from team_members x where x.team_id = t.id) as "memberCount"
       from project_teams pt join teams t on t.id = pt.team_id
      where pt.project_id = $1 order by t.name`,
    [projectId],
  );
  return { project: { ...rows[0], role, boards }, members: await projectMembers(projectId), teams };
}

export type ProjectKind = 'personal' | 'team';

/**
 * Tạo dự án (chưa có bảng nào; tự tạo bảng sau). Người tạo là host.
 * kind = 'personal': dự án riêng, không thêm được người khác; 'team': dự án nhóm.
 */
export async function createProject(me: string, rawName: unknown, rawKind: unknown) {
  const name = readName(rawName);
  const kind: ProjectKind = rawKind === 'personal' ? 'personal' : 'team';
  return tx(async (c) => {
    const key = await freeKey(c, name);
    const { rows } = await c.query<{ id: string }>('insert into projects (name, key, owner_id, kind) values ($1, $2, $3, $4) returning id', [
      name,
      key,
      me,
      kind,
    ]);
    const id = rows[0].id;
    await c.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'host')`, [id, me]);
    return { id, name, key, ownerId: me, kind, role: 'host', memberCount: 1, boards: [] as BoardInfo[] };
  });
}

/**
 * Tài khoản mới: tạo sẵn dự án cá nhân "Cá nhân" với bảng "Bảng của tôi".
 * Id bảng = id người dùng (trùng với bảng cá nhân mặc định của API) để dữ liệu luôn ở cùng một chỗ.
 */
export async function createPersonalSpace(userId: string) {
  await tx(async (c) => {
    await c.query('insert into boards (board_id) values ($1) on conflict do nothing', [userId]);
    const { rows } = await c.query<{ id: string }>(
      `insert into projects (name, key, owner_id, kind) values ('Cá nhân', $2, $1, 'personal') returning id`,
      [userId, await freeKey(c, await initialsOf(c, userId))],
    );
    await c.query(`insert into project_members (project_id, user_id, role) values ($1, $2, 'host')`, [rows[0].id, userId]);
    await c.query(`insert into project_boards (id, project_id, name, position) values ($1, $2, 'Bảng của tôi', 0)`, [userId, rows[0].id]);
  });
}

export async function renameProject(me: string, projectId: string, rawName: unknown, rawKey?: unknown) {
  await requireHost(me, projectId);
  const name = readName(rawName);
  let key: string | null = null;
  if (rawKey !== undefined && rawKey !== null && rawKey !== '') {
    key = typeof rawKey === 'string' ? rawKey.trim().toUpperCase() : '';
    if (!KEY_RE.test(key)) throw new HttpError(400, 'invalid_key');
    const { rows } = await db().query('select 1 from projects where key = $1 and id <> $2', [key, projectId]);
    if (rows[0]) throw new HttpError(409, 'key_taken');
  }
  const { rows } = await db().query<{ key: string }>('update projects set name = $2, key = coalesce($3, key) where id = $1 returning key', [projectId, name, key]);
  return { id: projectId, name, key: rows[0].key };
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

/** Xoá bảng: chỉ host */
export async function deleteBoard(me: string, boardId: string) {
  const projectId = await boardProject(boardId);
  await requireHost(me, projectId);
  await tx(async (c) => {
    for (const table of BOARD_TABLES) await c.query(`delete from ${table} where board_id = $1`, [boardId]);
    await c.query('delete from project_boards where id = $1', [boardId]);
  });
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

/* ---------------- liên kết tài liệu / báo cáo của dự án ---------------- */

export type LinkKind = 'doc' | 'report';

export interface ProjectLink {
  id: string;
  kind: LinkKind;
  title: string;
  url: string;
  createdBy: string | null;
  createdAt: string;
}

/** Chỉ nhận địa chỉ http(s) (chặn javascript:, data:...) */
function readUrl(v: unknown): URL {
  const raw = typeof v === 'string' ? v.trim() : '';
  if (!raw || raw.length > 2000) throw new HttpError(400, 'invalid_url');
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HttpError(400, 'invalid_url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, 'invalid_url');
  return u;
}

const LINK_COLS = `id, kind, title, url, created_by as "createdBy", created_at as "createdAt"`;

export async function listLinks(me: string, projectId: string): Promise<ProjectLink[]> {
  await projectRole(me, projectId);
  const { rows } = await db().query<ProjectLink>(`select ${LINK_COLS} from project_links where project_id = $1 order by created_at`, [projectId]);
  return rows;
}

export async function addLink(me: string, projectId: string, rawKind: unknown, rawUrl: unknown, rawTitle: unknown): Promise<ProjectLink> {
  await projectRole(me, projectId);
  if (rawKind !== 'doc' && rawKind !== 'report') throw new HttpError(400, 'invalid_kind');
  const url = readUrl(rawUrl);
  const typed = typeof rawTitle === 'string' ? rawTitle.trim().replace(/\s+/g, ' ') : '';
  if (typed.length > 120) throw new HttpError(400, 'invalid_name');
  const title = typed || url.hostname.replace(/^www\./, '');
  const { rows: count } = await db().query<{ n: number }>('select count(*)::int as n from project_links where project_id = $1', [projectId]);
  if (count[0].n >= 200) throw new HttpError(400, 'too_many_links');
  const { rows } = await db().query<ProjectLink>(
    `insert into project_links (project_id, kind, title, url, created_by) values ($1, $2, $3, $4, $5) returning ${LINK_COLS}`,
    [projectId, rawKind, title, url.toString(), me],
  );
  return rows[0];
}

export async function updateLink(me: string, projectId: string, linkId: string, rawUrl: unknown, rawTitle: unknown): Promise<ProjectLink> {
  const role = await projectRole(me, projectId);
  const { rows: cur } = await db().query<{ createdBy: string | null }>('select created_by as "createdBy" from project_links where id = $1 and project_id = $2', [linkId, projectId]);
  if (!cur[0]) throw new HttpError(404, 'link_not_found');
  if (role !== 'host' && cur[0].createdBy !== me) throw new HttpError(403, 'forbidden');
  const url = readUrl(rawUrl);
  const title = (typeof rawTitle === 'string' ? rawTitle.trim().replace(/\s+/g, ' ') : '').slice(0, 120) || url.hostname.replace(/^www\./, '');
  const { rows } = await db().query<ProjectLink>(`update project_links set title = $3, url = $4 where id = $1 and project_id = $2 returning ${LINK_COLS}`, [
    linkId,
    projectId,
    title,
    url.toString(),
  ]);
  return rows[0];
}

export async function deleteLink(me: string, projectId: string, linkId: string) {
  const role = await projectRole(me, projectId);
  const { rows } = await db().query<{ createdBy: string | null }>('select created_by as "createdBy" from project_links where id = $1 and project_id = $2', [linkId, projectId]);
  if (!rows[0]) throw new HttpError(404, 'link_not_found');
  if (role !== 'host' && rows[0].createdBy !== me) throw new HttpError(403, 'forbidden');
  await db().query('delete from project_links where id = $1', [linkId]);
}
