/**
 * API của app (Express). Trên Vercel file này chạy như một Vercel Function;
 * vercel.json chuyển mọi đường dẫn /api/* về đây. Chạy ở máy: npm run dev:api
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  DUMMY_HASH,
  checkRateLimit,
  endSession,
  hashPassword,
  logAttempt,
  readCredentials,
  requireUser,
  sessionUser,
  startSession,
  verifyPassword,
  type User,
} from './_lib/auth.js';
import { readBoard, writeBoard } from './_lib/board.js';
import { db } from './_lib/db.js';
import {
  acceptFriend,
  createBoard,
  deleteBoard,
  listNotifications,
  readNotifications,
  renameBoard,
  addMember,
  boardAccess,
  createProject,
  deleteProject,
  getProject,
  listFriends,
  listProjects,
  removeFriend,
  removeMember,
  renameProject,
  requestFriend,
  requireUuid,
} from './_lib/social.js';
import { HttpError, clientIp, route } from './_lib/http.js';

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

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name });

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
       returning id, email, name`,
      [email, name, hash],
    );
    if (!rows[0]) {
      await logAttempt(email, ip, false);
      throw new HttpError(409, 'email_taken');
    }
    await db().query('insert into boards (board_id) values ($1) on conflict do nothing', [rows[0].id]);
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
    const { rows } = await db().query<User & { password_hash: string }>(
      'select id, email, name, password_hash from users where email = $1',
      [email],
    );
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    await logAttempt(email, ip, ok && !!user);
    if (!user || !ok) throw new HttpError(401, 'wrong_credentials');
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
    res.json(await writeBoard(boardId, body.baseRevision, body.file, allowed));
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
    const b = (req.body ?? {}) as { name?: unknown; boardName?: unknown };
    res.status(201).json({ project: await createProject(req.user!.id, b.name, b.boardName) });
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
    res.json({ project: await renameProject(req.user!.id, requireUuid(req.params.id), (req.body as { name?: unknown })?.name) });
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
