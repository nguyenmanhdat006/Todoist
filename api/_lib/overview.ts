/**
 * Tổng hợp công việc từ mọi bảng mà người dùng truy cập được (dự án cá nhân và dự án nhóm đã tham gia),
 * để trang Danh sách và Lịch hiển thị tất cả cùng lúc.
 */
import { db } from './db.js';
import { mapColumnRow, mapTaskRow } from './board.js';

export interface OverviewBoard {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  kind: 'personal' | 'team';
  columns: ReturnType<typeof mapColumnRow>[];
  tasks: ReturnType<typeof mapTaskRow>[];
}

export async function readOverview(me: string) {
  const { rows: boards } = await db().query<{
    id: string;
    name: string;
    project_id: string;
    project_name: string;
    kind: 'personal' | 'team';
  }>(
    `select pb.id, pb.name, p.id as project_id, p.name as project_name, p.kind
       from project_boards pb
       join projects p on p.id = pb.project_id
       join project_members pm on pm.project_id = p.id and pm.user_id = $1
      order by (p.kind = 'personal') desc, p.created_at, pb.position, pb.created_at`,
    [me],
  );
  if (boards.length === 0) return { boards: [] as OverviewBoard[], users: [] as { id: string; name: string; email: string }[] };

  const ids = boards.map((b) => b.id);
  const [cols, tasks] = await Promise.all([
    db().query('select * from board_columns where board_id = any($1::uuid[]) order by position', [ids]),
    db().query('select * from tasks where board_id = any($1::uuid[]) order by column_id, position', [ids]),
  ]);

  const byBoard = new Map<string, OverviewBoard>(
    boards.map((b) => [
      b.id,
      { id: b.id, name: b.name, projectId: b.project_id, projectName: b.project_name, kind: b.kind, columns: [], tasks: [] },
    ]),
  );
  for (const c of cols.rows) byBoard.get(c.board_id)?.columns.push(mapColumnRow(c));
  for (const t of tasks.rows) byBoard.get(t.board_id)?.tasks.push(mapTaskRow(t));

  // Thông tin những người được gắn vào việc, để hiện avatar
  const assigneeIds = [...new Set(tasks.rows.flatMap((t) => (t.assignees ?? []) as string[]))];
  const { rows: users } = assigneeIds.length
    ? await db().query<{ id: string; name: string; email: string }>('select id, name, email from users where id = any($1::uuid[])', [assigneeIds])
    : { rows: [] };

  return { boards: [...byBoard.values()], users };
}
