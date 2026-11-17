/**
 * Sao lưu bảng ra một file duy nhất (ghi đè khi dữ liệu thay đổi).
 *  - Gọi từ: lịch chạy hằng ngày (cron), trình duyệt sau khi lưu / khi đóng tab, và nút "Sao lưu ngay".
 *  - Không có gì thay đổi (so sánh mã băm) thì không ghi.
 *  - Nếu dữ liệu hiện tại ít hơn hẳn bản sao lưu (từ ≥ 4 việc xuống còn dưới một nửa) thì GIỮ bản cũ và đánh dấu cảnh báo,
 *    để một lần mất dữ liệu không ghi đè mất bản sao lưu tốt. Chỉ ghi đè khi người dùng chủ động xác nhận (force).
 */
import { createHash } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';
import { readBoard } from './board.js';

export type BackupReason = 'auto' | 'close' | 'cron' | 'manual';
export type BackupStatus = 'unchanged' | 'saved' | 'flagged' | 'empty';

export interface BackupMeta {
  boardId: string;
  updatedAt: string;
  taskCount: number;
  sizeBytes: number;
  revision: number;
  reason: BackupReason;
  flagged: boolean;
  flaggedTasks: number | null;
}

const META_COLS = `board_id as "boardId", updated_at as "updatedAt", task_count as "taskCount", size_bytes as "sizeBytes", revision, reason, flagged, flagged_tasks as "flaggedTasks"`;

const REASONS: BackupReason[] = ['auto', 'close', 'cron', 'manual'];
export const readReason = (v: unknown): BackupReason => (REASONS.includes(v as BackupReason) ? (v as BackupReason) : 'auto');

export async function backupBoard(boardId: string, opts: { reason: BackupReason; by?: string | null; force?: boolean }): Promise<{ status: BackupStatus; backup: BackupMeta | null }> {
  const { revision, file } = await readBoard(boardId);
  const current = await getBackupMeta(boardId);
  // Bảng chưa có dữ liệu thì chưa có gì để sao lưu
  if (!file) return { status: 'empty', backup: current };

  // exportedAt đổi mỗi lần đọc nên không tính vào mã băm
  const { exportedAt: _ignored, ...stable } = file;
  void _ignored;
  const json = JSON.stringify(stable);
  const hash = createHash('sha256').update(json).digest('hex');
  const tasks = file.tasks.length;

  const prev = await db().query<{ data_hash: string; task_count: number; flagged: boolean }>('select data_hash, task_count, flagged from board_backups where board_id = $1', [boardId]);
  const old = prev.rows[0];
  if (old && old.data_hash === hash && !old.flagged) return { status: 'unchanged', backup: current };

  if (old && !opts.force && old.task_count >= 4 && tasks * 2 < old.task_count) {
    // Nghi mất dữ liệu: giữ bản cũ, chỉ ghi chú cảnh báo
    await db().query('update board_backups set flagged = true, flagged_tasks = $2, flagged_at = now() where board_id = $1', [boardId, tasks]);
    return { status: 'flagged', backup: await getBackupMeta(boardId) };
  }

  const full = JSON.stringify({ ...stable, exportedAt: new Date().toISOString() });
  await db().query(
    `insert into board_backups (board_id, data, data_hash, task_count, size_bytes, revision, reason, created_by, updated_at, flagged, flagged_tasks, flagged_at)
     values ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, now(), false, null, null)
     on conflict (board_id) do update set data = excluded.data, data_hash = excluded.data_hash, task_count = excluded.task_count,
       size_bytes = excluded.size_bytes, revision = excluded.revision, reason = excluded.reason, created_by = excluded.created_by,
       updated_at = now(), flagged = false, flagged_tasks = null, flagged_at = null`,
    [boardId, full, hash, tasks, Buffer.byteLength(full), revision, opts.reason, opts.by ?? null],
  );
  return { status: 'saved', backup: await getBackupMeta(boardId) };
}

export async function getBackupMeta(boardId: string): Promise<BackupMeta | null> {
  const { rows } = await db().query<BackupMeta>(`select ${META_COLS} from board_backups where board_id = $1`, [boardId]);
  return rows[0] ?? null;
}

export async function getBackupFile(boardId: string): Promise<{ file: unknown; meta: BackupMeta }> {
  const { rows } = await db().query<BackupMeta & { data: unknown }>(`select data, ${META_COLS} from board_backups where board_id = $1`, [boardId]);
  if (!rows[0]) throw new HttpError(404, 'no_backup');
  const { data, ...meta } = rows[0];
  return { file: data, meta };
}

/** Sao lưu của mọi bảng trong một dự án (chỉ thông tin, không kèm dữ liệu) */
export async function listProjectBackups(projectId: string) {
  const { rows } = await db().query(
    `select pb.id as "boardId", pb.name, p.key as "projectKey", bk.updated_at as "updatedAt", bk.task_count as "taskCount", bk.size_bytes as "sizeBytes",
            bk.revision, bk.reason, bk.flagged, bk.flagged_tasks as "flaggedTasks", (bk.board_id is not null) as "hasBackup"
       from project_boards pb join projects p on p.id = pb.project_id left join board_backups bk on bk.board_id = pb.id
      where pb.project_id = $1
      order by pb.position, pb.created_at`,
    [projectId],
  );
  return rows.map(({ projectKey, ...r }) => ({ ...r, fileName: backupFileName(projectKey, r.name) }));
}

/** Tên file tải về: chỉ ký tự an toàn */
export function backupFileName(projectKey: string, boardName: string): string {
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  return `backup-${slug(projectKey) || 'project'}-${slug(boardName) || 'board'}.json`;
}

/** Bảng có thay đổi sau lần sao lưu gần nhất (hoặc chưa từng sao lưu): việc của lịch chạy hằng ngày */
export async function boardsNeedingBackup(limit = 300): Promise<string[]> {
  const { rows } = await db().query<{ board_id: string }>(
    `select b.board_id
       from boards b left join board_backups bk on bk.board_id = b.board_id
      where bk.board_id is null or b.updated_at > bk.updated_at or bk.flagged
      order by b.updated_at desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => r.board_id);
}
