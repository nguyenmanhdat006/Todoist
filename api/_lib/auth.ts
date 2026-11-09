import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.js';
import { HttpError, isHttps, readCookie } from './http.js';

export const SESSION_COOKIE = 'tm_session';
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

/* ---------- mật khẩu (scrypt, có sẵn trong Node) ---------- */

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(pw.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Dùng khi email không tồn tại, để thời gian phản hồi giống như khi sai mật khẩu */
export const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);

/* ---------- phiên đăng nhập (token ngẫu nhiên trong cookie httpOnly, DB chỉ lưu sha256) ---------- */

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function startSession(req: Request, res: Response, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().query('insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)', [
    sha256(token),
    userId,
    expires,
    String(req.headers['user-agent'] ?? '').slice(0, 300),
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function endSession(req: Request, res: Response) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db().query('delete from sessions where token_hash = $1', [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isHttps(req), sameSite: 'lax', path: '/' });
}

export async function sessionUser(req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const { rows } = await db().query<User>(
    `select u.id, u.email, u.name
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
  return rows[0] ?? null;
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, 'unauthorized');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/* ---------- chặn dò mật khẩu ---------- */

const WINDOW = "interval '15 minutes'";
const MAX_FAILS_PER_EMAIL = 8;
const MAX_FAILS_PER_IP = 30;

export async function checkRateLimit(email: string, ip: string) {
  const { rows } = await db().query<{ by_email: string; by_ip: string }>(
    `select
       count(*) filter (where email = $1) as by_email,
       count(*) filter (where ip = $2)    as by_ip
     from auth_attempts
     where not ok and at > now() - ${WINDOW} and (email = $1 or ip = $2)`,
    [email, ip],
  );
  const r = rows[0];
  if (Number(r.by_email) >= MAX_FAILS_PER_EMAIL || Number(r.by_ip) >= MAX_FAILS_PER_IP) throw new HttpError(429, 'too_many_attempts');
}

export async function logAttempt(email: string, ip: string, ok: boolean) {
  await db().query('insert into auth_attempts (email, ip, ok) values ($1, $2, $3)', [email, ip, ok]);
  // Dọn bản ghi cũ thỉnh thoảng
  if (Math.random() < 0.02) await db().query("delete from auth_attempts where at < now() - interval '1 day'");
}

/* ---------- kiểm tra dữ liệu nhập ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readCredentials(body: unknown, needName = false) {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email');
  if (needName && (password.length < 8 || password.length > 200)) throw new HttpError(400, 'weak_password');
  if (!password || password.length > 200) throw new HttpError(400, 'invalid_password');
  return { email, password, name };
}
