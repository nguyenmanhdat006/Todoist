/**
 * Chạy các file SQL trong db/migrations theo thứ tự tên, mỗi file đúng một lần (ghi vào bảng schema_migrations).
 *
 *   npm run db:migrate            → cần DATABASE_URL (đọc từ .env.local)
 *   node scripts/... --if-env     → bỏ qua nếu không có DATABASE_URL (dùng trong bước build trên Vercel)
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes('--if-env')) {
    console.log('[migrate] Không có DATABASE_URL, bỏ qua.');
    process.exit(0);
  }
  console.error('[migrate] Thiếu DATABASE_URL. Tạo file .env.local với DATABASE_URL=... rồi chạy lại.');
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);
  // Khoá để hai bản build chạy cùng lúc không áp dụng trùng
  await client.query('select pg_advisory_lock(727274)');
  const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] Đã áp dụng ${file}`);
      applied++;
    } catch (e) {
      await client.query('rollback');
      throw new Error(`[migrate] Lỗi ở ${file}: ${(e as Error).message}`);
    }
  }
  if (!applied) console.log('[migrate] Cơ sở dữ liệu đã ở phiên bản mới nhất.');
} finally {
  await client.query('select pg_advisory_unlock(727274)').catch(() => {});
  await client.end();
}
