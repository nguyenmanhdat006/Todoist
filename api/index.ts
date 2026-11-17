/**
 * API của app (Express). Trên Vercel file này chạy như một Vercel Function;
 * vercel.json chuyển mọi đường dẫn /api/* về đây. Chạy ở máy: npm run dev:api
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  DUMMY_HASH,
  checkRateLimit,
  consumeResetToken,
  createResetToken,
  endOtherSessions,
  endSession,
  hashPassword,
  logAttempt,
  lookupResetToken,
  readCredentials,
  requireAdmin,
  requireUser,
  sessionUser,
  startSession,
  verifyPassword,
  type User,
} from './_lib/auth.js';
import { addComment, deleteComment, editComment, listActivity } from './_lib/activity.js';
import { readBoard, writeBoard } from './_lib/board.js';
import { backupBoard, backupFileName, boardsNeedingBackup, getBackupFile, listProjectBackups, readReason } from './_lib/backup.js';
import { readOverview } from './_lib/overview.js';
import { db } from './_lib/db.js';
import {
  acceptFriend,
  createBoard,
  createPersonalSpace,
  deleteBoard,
  listNotifications,
  readNotifications,
  renameBoard,
  addLink,
  addMember,
  boardAccess,
  deleteLink,
  listLinks,
  updateLink,
  createProject,
  deleteProject,
  getProject,
  projectRole,
  listFriends,
  listProjects,
  removeFriend,
  removeMember,
  renameProject,
  requestFriend,
  requireUuid,
} from './_lib/social.js';
import { HttpError, clientIp, route } from './_lib/http.js';
import { mailConfigured, resetEmail, sendMail } from './_lib/mail.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Body JSON: trên Vercel body đã được đọc sẵn (req.body), ở máy thì tự đọc
const parseJson = express.json({ limit: '4mb' });
app.use((req, res, next) => {
  const pre = (req as { body?: unknown }).body;
  if (pre !== undefined && typeof pre === 'object' && !Buffer.isBuffer(pre)) return next();
  parseJson(req, res, next);
});

// Chặn gửi form từ trang khác (CSRF): request thay đổi dữ liệu phải là JSON và cùng nguồn
app.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // Có body thì phải là JSON (form HTML từ trang khác không gửi được JSON nếu không qua CORS)
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || !!req.headers['transfer-encoding'];
  if (hasBody && !req.is('application/json')) return next(new HttpError(415, 'json_required'));
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      /* origin hỏng */
    }
    // Sau proxy (Vercel, Vite) tên miền gốc nằm ở x-forwarded-host
    const fwd = req.headers['x-forwarded-host'];
    const allowed = [Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim(), req.headers.host].filter(Boolean);
    if (!allowed.includes(host)) return next(new HttpError(403, 'bad_origin'));
  }
  next();
});

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, role: u.role, avatarV: u.avatarV ?? null });

/* ---------- health ---------- */

app.get(
  '/api/health',
  route(async (_req, res) => {
    await db().query('select 1');
    res.json({ ok: true });
  }),
);

/* ---------- tài khoản ---------- */

app.post(
  '/api/auth/register',
  route(async (req, res) => {
    const { email, password, name } = readCredentials(req.body, true);
    const ip = clientIp(req);
    await checkRateLimit(email, ip);
    const hash = await hashPassword(password);
    const { rows } = await db().query<User>(
      `insert into users (email, name, password_hash) values ($1, $2, $3)
       on conflict (email) do nothing
       returning id, email, name, role, avatar_v as "avatarV"`,
      [email, name, hash],
    );
    if (!rows[0]) {
      await logAttempt(email, ip, false);
      throw new HttpError(409, 'email_taken');
    }
    await createPersonalSpace(rows[0].id);
    await startSession(req, res, rows[0].id);
    res.status(201).json({ user: publicUser(rows[0]) });
  }),
);

app.post(
  '/api/auth/login',
  route(async (req, res) => {
    const { email, password } = readCredentials(req.body);
    const ip = clientIp(req);
    await checkRateLimit(email, ip);
    const { rows } = await db().query<User & { password_hash: string; disabled: boolean }>(
      'select id, email, name, role, avatar_v as "avatarV", disabled, password_hash from users where email = $1',
      [email],
    );
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    await logAttempt(email, ip, ok && !!user);
    if (!user || !ok) throw new HttpError(401, 'wrong_credentials');
    if (user.disabled) throw new HttpError(403, 'account_disabled');
    await startSession(req, res, user.id);
    res.json({ user: publicUser(user) });
  }),
);

app.post(
  '/api/auth/logout',
  route(async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/auth/me',
  route(async (req, res) => {
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, 'unauthorized');
    res.json({ user: publicUser(user) });
  }),
);

/* ---------- quên mật khẩu ---------- */

/** Địa chỉ gốc của app để dựng liên kết trong email (APP_URL, hoặc tên miền đang được gọi) */
function appBase(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const fwd = req.headers['x-forwarded-host'];
  const host = (Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim()) || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : /^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https';
  return `${proto}://${host}`;
}

// Luôn trả ok dù email có tồn tại hay không, để không lộ tài khoản nào có trong hệ thống
app.post(
  '/api/auth/forgot',
  route(async (req, res) => {
    const b = (req.body ?? {}) as { email?: unknown; lang?: unknown };
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email');
    if (!mailConfigured()) throw new HttpError(503, 'mail_not_configured');
    const { rows } = await db().query<User & { disabled: boolean }>('select id, email, name, role, disabled from users where email = $1', [email]);
    const user = rows[0];
    if (user && !user.disabled) {
      // Quá nhiều yêu cầu thì im lặng bỏ qua (vẫn trả ok) để không lộ tài khoản có tồn tại hay không
      const token = await createResetToken(user.id, clientIp(req));
      if (token) {
        const link = `${appBase(req)}/?reset=${encodeURIComponent(token)}`;
        try {
          await sendMail(resetEmail(user.email, user.name, link, b.lang === 'en' ? 'en' : 'vi'));
        } catch (e) {
          // Không báo lỗi cho người gọi; ghi log để quản trị xử lý
          console.error('[mail] gửi email đặt lại mật khẩu thất bại:', e);
        }
      }
    }
    res.json({ ok: true });
  }),
);

app.post(
  '/api/auth/reset/check',
  route(async (req, res) => {
    const found = await lookupResetToken((req.body as { token?: unknown })?.token);
    if (!found) throw new HttpError(400, 'invalid_token');
    res.json({ ok: true, email: found.email });
  }),
);

app.post(
  '/api/auth/reset',
  route(async (req, res) => {
    const b = (req.body ?? {}) as { token?: unknown; password?: unknown };
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'weak_password');
    if (typeof b.token !== 'string' || !(await consumeResetToken(b.token, password))) throw new HttpError(400, 'invalid_token');
    res.json({ ok: true });
  }),
);

/* ---------- hồ sơ cá nhân ---------- */

app.patch(
  '/api/me',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name || name.length > 80) throw new HttpError(400, 'invalid_name');
    const { rows } = await db().query<User>('update users set name = $2 where id = $1 returning id, email, name, role, avatar_v as "avatarV"', [req.user!.id, name]);
    res.json({ user: publicUser(rows[0]) });
  }),
);

const AVATAR_MAX = 200 * 1024;

/** Nhận ảnh đã thu nhỏ ở trình duyệt (data URL PNG / JPEG / WebP) */
app.put(
  '/api/me/avatar',
  requireUser,
  route(async (req, res) => {
    const image = (req.body as { image?: unknown } | undefined)?.image;
    const m = typeof image === 'string' ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image) : null;
    if (!m) throw new HttpError(400, 'bad_image');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > AVATAR_MAX) throw new HttpError(413, 'image_too_large');
    // Kiểm tra đầu file khớp loại ảnh khai báo
    const head = bytes.subarray(0, 12);
    const ok =
      (m[1] === 'image/png' && head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
      (m[1] === 'image/jpeg' && head[0] === 0xff && head[1] === 0xd8) ||
      (m[1] === 'image/webp' && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP');
    if (!ok) throw new HttpError(400, 'bad_image');
    const { rows } = await db().query<User>(
      `update users set avatar = $2, avatar_type = $3, avatar_v = coalesce(avatar_v, 0) + 1 where id = $1
       returning id, email, name, role, avatar_v as "avatarV"`,
      [req.user!.id, bytes, m[1]],
    );
    res.json({ user: publicUser(rows[0]) });
  }),
);

app.delete(
  '/api/me/avatar',
  requireUser,
  route(async (req, res) => {
    const { rows } = await db().query<User>(
      `update users set avatar = null, avatar_type = null, avatar_v = null where id = $1
       returning id, email, name, role, avatar_v as "avatarV"`,
      [req.user!.id],
    );
    res.json({ user: publicUser(rows[0]) });
  }),
);

// Ảnh đại diện của một người (chỉ người đã đăng nhập xem được); địa chỉ có ?v= nên cache được lâu
app.get(
  '/api/avatars/:id',
  requireUser,
  route(async (req, res) => {
    const id = requireUuid(req.params.id);
    const { rows } = await db().query<{ avatar: Buffer | null; avatar_type: string | null }>('select avatar, avatar_type from users where id = $1', [id]);
    const r = rows[0];
    if (!r?.avatar || !r.avatar_type) throw new HttpError(404, 'no_avatar');
    res.setHeader('Content-Type', r.avatar_type);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(r.avatar);
  }),
);

app.post(
  '/api/me/password',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const current = typeof b.current === 'string' ? b.current : '';
    const next = typeof b.password === 'string' ? b.password : '';
    if (!current || current.length > 200) throw new HttpError(400, 'invalid_password');
    if (next.length < 8 || next.length > 200) throw new HttpError(400, 'weak_password');
    const ip = clientIp(req);
    const me = req.user!;
    await checkRateLimit(me.email, ip);
    const { rows } = await db().query<{ password_hash: string }>('select password_hash from users where id = $1', [me.id]);
    const ok = await verifyPassword(current, rows[0]?.password_hash ?? DUMMY_HASH);
    await logAttempt(me.email, ip, ok);
    if (!ok) throw new HttpError(400, 'wrong_password');
    await db().query('update users set password_hash = $2 where id = $1', [me.id, await hashPassword(next)]);
    await endOtherSessions(req, me.id);
    res.json({ ok: true });
  }),
);

/* ---------- quản trị người dùng (chỉ admin) ---------- */

app.get(
  '/api/admin/users',
  requireAdmin,
  route(async (_req, res) => {
    const { rows } = await db().query(
      `select id, email, name, role, disabled, created_at as "createdAt" from users order by created_at`,
    );
    res.json({ users: rows });
  }),
);

app.patch(
  '/api/admin/users/:id',
  requireAdmin,
  route(async (req, res) => {
    const id = requireUuid(req.params.id);
    if (id === req.user!.id) throw new HttpError(400, 'self_change');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const sets: string[] = [];
    const vals: unknown[] = [id];
    if (b.role !== undefined) {
      if (b.role !== 'admin' && b.role !== 'user') throw new HttpError(400, 'invalid_role');
      vals.push(b.role);
      sets.push(`role = $${vals.length}`);
    }
    if (b.disabled !== undefined) {
      if (typeof b.disabled !== 'boolean') throw new HttpError(400, 'invalid_disabled');
      vals.push(b.disabled);
      sets.push(`disabled = $${vals.length}`);
    }
    if (!sets.length) throw new HttpError(400, 'nothing_to_change');
    const { rows } = await db().query(
      `update users set ${sets.join(', ')} where id = $1 returning id, email, name, role, disabled, created_at as "createdAt"`,
      vals,
    );
    if (!rows[0]) throw new HttpError(404, 'not_found');
    if (rows[0].disabled) await db().query('delete from sessions where user_id = $1', [id]);
    res.json({ user: rows[0] });
  }),
);

/* ---------- dữ liệu ---------- */

// ?project=<id> để mở bảng của dự án; không có thì là bảng cá nhân
app.get(
  '/api/board',
  requireUser,
  route(async (req, res) => {
    // ?board=<id bảng dự án>; ?project= là tên cũ, vẫn nhận (bảng đầu tiên của dự án cũ có id = id dự án)
    const { boardId } = await boardAccess(req.user!.id, req.query.board ?? req.query.project);
    res.json(await readBoard(boardId));
  }),
);

app.put(
  '/api/board',
  requireUser,
  route(async (req, res) => {
    const body = (req.body ?? {}) as { baseRevision?: unknown; file?: unknown; board?: unknown; project?: unknown };
    if (typeof body.baseRevision !== 'number' || !Number.isInteger(body.baseRevision)) throw new HttpError(400, 'bad_revision');
    const { boardId, allowed } = await boardAccess(req.user!.id, body.board ?? body.project);
    res.json(await writeBoard(boardId, body.baseRevision, body.file, allowed, req.user!.id));
  }),
);

// Hoạt động của việc: lịch sử và bình luận. ?board= như /api/board (không có = bảng cá nhân)
app.get(
  '/api/tasks/:taskId/activity',
  requireUser,
  route(async (req, res) => {
    const { boardId } = await boardAccess(req.user!.id, req.query.board);
    res.json(await listActivity(boardId, String(req.params.taskId).slice(0, 100)));
  }),
);

app.post(
  '/api/tasks/:taskId/comments',
  requireUser,
  route(async (req, res) => {
    const { boardId } = await boardAccess(req.user!.id, req.query.board);
    const comment = await addComment(boardId, String(req.params.taskId).slice(0, 100), req.user!.id, (req.body as { body?: unknown })?.body);
    res.status(201).json({ comment });
  }),
);

app.patch(
  '/api/comments/:id',
  requireUser,
  route(async (req, res) => {
    const { boardId } = await boardAccess(req.user!.id, req.query.board);
    res.json({ comment: await editComment(boardId, String(req.params.id), req.user!.id, (req.body as { body?: unknown })?.body) });
  }),
);

app.delete(
  '/api/comments/:id',
  requireUser,
  route(async (req, res) => {
    const { boardId } = await boardAccess(req.user!.id, req.query.board);
    await deleteComment(boardId, String(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
);

// Việc từ mọi bảng truy cập được, cho trang Danh sách và Lịch
app.get(
  '/api/overview',
  requireUser,
  route(async (req, res) => {
    res.json(await readOverview(req.user!.id));
  }),
);

/* ---------- bạn bè ---------- */

app.get(
  '/api/friends',
  requireUser,
  route(async (req, res) => {
    res.json(await listFriends(req.user!.id));
  }),
);

app.post(
  '/api/friends/request',
  requireUser,
  route(async (req, res) => {
    const out = await requestFriend(req.user!.id, (req.body as { email?: unknown })?.email);
    res.status(201).json(out);
  }),
);

app.post(
  '/api/friends/:id/accept',
  requireUser,
  route(async (req, res) => {
    await acceptFriend(req.user!.id, requireUuid(req.params.id));
    res.json(await listFriends(req.user!.id));
  }),
);

// Từ chối / huỷ lời mời / huỷ kết bạn
app.delete(
  '/api/friends/:id',
  requireUser,
  route(async (req, res) => {
    await removeFriend(req.user!.id, requireUuid(req.params.id));
    res.json(await listFriends(req.user!.id));
  }),
);

/* ---------- dự án ---------- */

app.get(
  '/api/projects',
  requireUser,
  route(async (req, res) => {
    res.json({ projects: await listProjects(req.user!.id) });
  }),
);

app.post(
  '/api/projects',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as { name?: unknown; kind?: unknown };
    res.status(201).json({ project: await createProject(req.user!.id, b.name, b.kind) });
  }),
);

app.get(
  '/api/projects/:id',
  requireUser,
  route(async (req, res) => {
    res.json(await getProject(req.user!.id, requireUuid(req.params.id)));
  }),
);

app.patch(
  '/api/projects/:id',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as { name?: unknown; key?: unknown };
    res.json({ project: await renameProject(req.user!.id, requireUuid(req.params.id), b.name, b.key) });
  }),
);

app.delete(
  '/api/projects/:id',
  requireUser,
  route(async (req, res) => {
    await deleteProject(req.user!.id, requireUuid(req.params.id));
    res.json({ ok: true });
  }),
);

/* ---------- bảng trong dự án ---------- */

app.post(
  '/api/projects/:id/boards',
  requireUser,
  route(async (req, res) => {
    res.status(201).json({ board: await createBoard(req.user!.id, requireUuid(req.params.id), (req.body as { name?: unknown })?.name) });
  }),
);

app.patch(
  '/api/boards/:id',
  requireUser,
  route(async (req, res) => {
    res.json({ board: await renameBoard(req.user!.id, requireUuid(req.params.id), (req.body as { name?: unknown })?.name) });
  }),
);

app.delete(
  '/api/boards/:id',
  requireUser,
  route(async (req, res) => {
    await deleteBoard(req.user!.id, requireUuid(req.params.id));
    res.json({ ok: true });
  }),
);

/* ---------- thông báo ---------- */

app.get(
  '/api/notifications',
  requireUser,
  route(async (req, res) => {
    res.json({ items: await listNotifications(req.user!.id) });
  }),
);

// { ids: ['12', '13'] } hoặc {} để đánh dấu tất cả
app.post(
  '/api/notifications/read',
  requireUser,
  route(async (req, res) => {
    res.json({ items: await readNotifications(req.user!.id, (req.body as { ids?: unknown })?.ids) });
  }),
);

app.post(
  '/api/projects/:id/members',
  requireUser,
  route(async (req, res) => {
    const memberId = requireUuid((req.body as { userId?: unknown })?.userId);
    res.json({ members: await addMember(req.user!.id, requireUuid(req.params.id), memberId) });
  }),
);

// Host bỏ thành viên, hoặc thành viên tự rời (userId = chính mình)
app.delete(
  '/api/projects/:id/members/:userId',
  requireUser,
  route(async (req, res) => {
    res.json({ members: await removeMember(req.user!.id, requireUuid(req.params.id), requireUuid(req.params.userId)) });
  }),
);

/* ---------- liên kết tài liệu / báo cáo của dự án ---------- */

app.get(
  '/api/projects/:id/links',
  requireUser,
  route(async (req, res) => {
    res.json({ links: await listLinks(req.user!.id, requireUuid(req.params.id)) });
  }),
);

app.post(
  '/api/projects/:id/links',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as { kind?: unknown; url?: unknown; title?: unknown };
    res.status(201).json({ link: await addLink(req.user!.id, requireUuid(req.params.id), b.kind, b.url, b.title) });
  }),
);

app.patch(
  '/api/projects/:id/links/:linkId',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as { url?: unknown; title?: unknown };
    res.json({ link: await updateLink(req.user!.id, requireUuid(req.params.id), requireUuid(req.params.linkId), b.url, b.title) });
  }),
);

app.delete(
  '/api/projects/:id/links/:linkId',
  requireUser,
  route(async (req, res) => {
    await deleteLink(req.user!.id, requireUuid(req.params.id), requireUuid(req.params.linkId));
    res.json({ ok: true });
  }),
);

/* ---------- sao lưu bảng (mỗi bảng một file, ghi đè khi dữ liệu đổi) ---------- */

app.get(
  '/api/projects/:id/backups',
  requireUser,
  route(async (req, res) => {
    const id = requireUuid(req.params.id);
    await projectRole(req.user!.id, id);
    res.json({ backups: await listProjectBackups(id) });
  }),
);

// Sao lưu ngay (trình duyệt gọi sau khi lưu, khi đóng tab, hoặc bấm nút). force = ghi đè cả khi nghi mất dữ liệu
app.post(
  '/api/backup',
  requireUser,
  route(async (req, res) => {
    const b = (req.body ?? {}) as { board?: unknown; reason?: unknown; force?: unknown };
    const { boardId } = await boardAccess(req.user!.id, b.board);
    res.json(await backupBoard(boardId, { reason: readReason(b.reason), by: req.user!.id, force: b.force === true }));
  }),
);

// File sao lưu của một bảng; ?download=1 để tải về dưới dạng file
app.get(
  '/api/backup/file',
  requireUser,
  route(async (req, res) => {
    const { boardId } = await boardAccess(req.user!.id, req.query.board);
    const { file } = await getBackupFile(boardId);
    if (req.query.download === '1') {
      const { rows } = await db().query<{ key: string; name: string }>(
        'select p.key, pb.name from project_boards pb join projects p on p.id = pb.project_id where pb.id = $1',
        [boardId],
      );
      res.setHeader('Content-Disposition', `attachment; filename="${backupFileName(rows[0]?.key ?? '', rows[0]?.name ?? '')}"`);
    }
    res.type('application/json').send(JSON.stringify(file));
  }),
);

// Lịch chạy hằng ngày (Vercel Cron): sao lưu mọi bảng đã thay đổi. Cần biến môi trường CRON_SECRET.
app.get(
  '/api/cron/backup',
  route(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new HttpError(503, 'cron_not_configured');
    if (req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    const ids = await boardsNeedingBackup();
    let saved = 0;
    let flagged = 0;
    for (const id of ids) {
      try {
        const r = await backupBoard(id, { reason: 'cron' });
        if (r.status === 'saved') saved++;
        else if (r.status === 'flagged') flagged++;
      } catch {
        /* bảng lỗi không làm hỏng cả lượt chạy */
      }
    }
    res.json({ checked: ids.length, saved, flagged });
  }),
);

/* ---------- 404 và lỗi ---------- */

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, ...err.extra });
    return;
  }
  // Lỗi đọc JSON của express.json()
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_json' });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

export default app;
