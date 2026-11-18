/**
 * Nhóm (team): nhiều người trong một nhóm, gắn nhóm vào dự án thay vì thêm từng người.
 *  - Chủ nhóm thêm người (phải là bạn của chủ nhóm), bớt người, đổi tên, xoá nhóm. Thành viên có thể tự rời nhóm.
 *  - Host dự án gắn / gỡ nhóm; chỉ gắn được nhóm mà mình là thành viên. Dự án cá nhân không gắn nhóm.
 *  - project_members (role = 'member') luôn bằng hợp các nhóm gắn vào dự án, trừ host; hàm syncProject giữ cho nó khớp.
 */
import type pg from 'pg';
import { db, tx } from './db.js';
import { HttpError } from './http.js';
import { projectRole, readName, requireHost, type PublicUser } from './social.js';

type Q = Pick<pg.PoolClient, 'query'>;

async function teamRole(c: Q, me: string, teamId: string): Promise<'owner' | 'member'> {
  const { rows } = await c.query<{ role: 'owner' | 'member' }>('select role from team_members where team_id = $1 and user_id = $2', [teamId, me]);
  if (!rows[0]) throw new HttpError(404, 'team_not_found');
  return rows[0].role;
}

async function requireOwner(c: Q, me: string, teamId: string) {
  if ((await teamRole(c, me, teamId)) !== 'owner') throw new HttpError(403, 'owner_only');
}

/** Đồng bộ thành viên của dự án theo các nhóm đang gắn; báo cho người mới được thêm vào dự án */
async function syncProject(c: Q, projectId: string, actor?: string) {
  const { rows: added } = await c.query<{ user_id: string }>(
    `insert into project_members (project_id, user_id, role)
     select $1, tm.user_id, 'member' from project_teams pt join team_members tm on tm.team_id = pt.team_id
      where pt.project_id = $1
     on conflict do nothing
     returning user_id`,
    [projectId],
  );
  await c.query(
    `delete from project_members
      where project_id = $1 and role = 'member'
        and user_id not in (select tm.user_id from project_teams pt join team_members tm on tm.team_id = pt.team_id where pt.project_id = $1)`,
    [projectId],
  );
  if (!added.length) return;
  const { rows } = await c.query<{ project: string; by: string }>(
    `select p.name as project, coalesce(nullif(u.name, ''), u.email, '') as by
       from projects p left join users u on u.id = $2 where p.id = $1`,
    [projectId, actor ?? null],
  );
  for (const a of added) {
    if (a.user_id === actor) continue;
    await c.query('insert into notifications (user_id, type, data) values ($1, $2, $3)', [
      a.user_id,
      'project_added',
      JSON.stringify({ projectId, projectName: rows[0]?.project, by: rows[0]?.by }),
    ]);
  }
}

async function syncProjectsOfTeam(c: Q, teamId: string, actor?: string) {
  const { rows } = await c.query<{ project_id: string }>('select project_id from project_teams where team_id = $1', [teamId]);
  for (const r of rows) await syncProject(c, r.project_id, actor);
}

export interface TeamInfo {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'member';
  members: (PublicUser & { role: 'owner' | 'member' })[];
  projects: { id: string; name: string }[];
}

/** Các nhóm mà me là thành viên, kèm thành viên và các dự án (mà me nhìn thấy) đang dùng nhóm */
export async function listTeams(me: string): Promise<TeamInfo[]> {
  const { rows: teams } = await db().query<{ id: string; name: string; ownerId: string; role: 'owner' | 'member' }>(
    `select t.id, t.name, t.owner_id as "ownerId", tm.role
       from teams t join team_members tm on tm.team_id = t.id and tm.user_id = $1
      order by t.created_at`,
    [me],
  );
  if (!teams.length) return [];
  const ids = teams.map((t) => t.id);
  const { rows: members } = await db().query<PublicUser & { teamId: string; role: 'owner' | 'member' }>(
    `select tm.team_id as "teamId", u.id, u.email, u.name, u.avatar_v as "avatarV", tm.role
       from team_members tm join users u on u.id = tm.user_id
      where tm.team_id = any($1::uuid[])
      order by (tm.role = 'owner') desc, u.name, u.email`,
    [ids],
  );
  const { rows: projects } = await db().query<{ teamId: string; id: string; name: string }>(
    `select pt.team_id as "teamId", p.id, p.name
       from project_teams pt join projects p on p.id = pt.project_id
       join project_members pm on pm.project_id = p.id and pm.user_id = $2
      where pt.team_id = any($1::uuid[])
      order by p.name`,
    [ids, me],
  );
  return teams.map((t) => ({
    ...t,
    members: members.filter((m) => m.teamId === t.id).map(({ teamId: _t, ...u }) => u),
    projects: projects.filter((p) => p.teamId === t.id).map((p) => ({ id: p.id, name: p.name })),
  }));
}

export async function createTeam(me: string, rawName: unknown) {
  const name = readName(rawName);
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string }>('insert into teams (name, owner_id) values ($1, $2) returning id', [name, me]);
    await c.query(`insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')`, [rows[0].id, me]);
    return rows[0].id;
  });
}

export async function renameTeam(me: string, teamId: string, rawName: unknown) {
  const name = readName(rawName);
  await requireOwner(db(), me, teamId);
  await db().query('update teams set name = $2 where id = $1', [teamId, name]);
}

export async function deleteTeam(me: string, teamId: string) {
  await tx(async (c) => {
    await requireOwner(c, me, teamId);
    const { rows } = await c.query<{ project_id: string }>('select project_id from project_teams where team_id = $1', [teamId]);
    await c.query('delete from teams where id = $1', [teamId]);
    for (const r of rows) await syncProject(c, r.project_id, me);
  });
}

export async function addTeamMember(me: string, teamId: string, userId: string) {
  await tx(async (c) => {
    await requireOwner(c, me, teamId);
    const { rows: fr } = await c.query(
      `select 1 from friendships where status = 'accepted' and ((requester = $1 and addressee = $2) or (requester = $2 and addressee = $1))`,
      [me, userId],
    );
    if (!fr.length) throw new HttpError(400, 'not_friend');
    const { rowCount } = await c.query(`insert into team_members (team_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [teamId, userId]);
    if (!rowCount) return;
    const { rows } = await c.query<{ team: string; by: string }>(
      `select t.name as team, coalesce(nullif(u.name, ''), u.email) as by from teams t, users u where t.id = $1 and u.id = $2`,
      [teamId, me],
    );
    await c.query('insert into notifications (user_id, type, data) values ($1, $2, $3)', [
      userId,
      'team_added',
      JSON.stringify({ teamId, teamName: rows[0]?.team, by: rows[0]?.by }),
    ]);
    await syncProjectsOfTeam(c, teamId, me);
  });
}

/** Chủ nhóm bỏ một thành viên, hoặc thành viên tự rời nhóm (chủ nhóm không rời được, chỉ xoá nhóm) */
export async function removeTeamMember(me: string, teamId: string, userId: string) {
  await tx(async (c) => {
    const role = await teamRole(c, me, teamId);
    if (userId === me) {
      if (role === 'owner') throw new HttpError(400, 'owner_cannot_leave');
    } else if (role !== 'owner') {
      throw new HttpError(403, 'owner_only');
    }
    await c.query(`delete from team_members where team_id = $1 and user_id = $2 and role <> 'owner'`, [teamId, userId]);
    await syncProjectsOfTeam(c, teamId, me);
  });
}

export async function attachTeam(me: string, projectId: string, teamId: string) {
  await requireHost(me, projectId);
  const { rows } = await db().query<{ kind: string }>('select kind from projects where id = $1', [projectId]);
  if (rows[0]?.kind === 'personal') throw new HttpError(400, 'personal_project');
  await tx(async (c) => {
    await teamRole(c, me, teamId);
    await c.query('insert into project_teams (project_id, team_id) values ($1, $2) on conflict do nothing', [projectId, teamId]);
    await syncProject(c, projectId, me);
  });
}

export async function detachTeam(me: string, projectId: string, teamId: string) {
  await requireHost(me, projectId);
  await tx(async (c) => {
    await c.query('delete from project_teams where project_id = $1 and team_id = $2', [projectId, teamId]);
    await syncProject(c, projectId, me);
  });
}

/** Thành viên rời dự án = rời mọi nhóm gắn vào dự án mà mình không phải chủ nhóm */
export async function leaveProject(me: string, projectId: string) {
  const role = await projectRole(me, projectId);
  if (role === 'host') throw new HttpError(400, 'host_cannot_leave');
  await tx(async (c) => {
    const { rows } = await c.query(
      `select 1 from team_members where user_id = $1 and role = 'owner'
          and team_id in (select team_id from project_teams where project_id = $2)`,
      [me, projectId],
    );
    if (rows.length) throw new HttpError(400, 'owner_cannot_leave');
    await c.query(
      `delete from team_members where user_id = $1 and role <> 'owner'
          and team_id in (select team_id from project_teams where project_id = $2)`,
      [me, projectId],
    );
    await syncProject(c, projectId, me);
  });
}
