import pg from 'pg';
import { HttpError } from './http.js';

// Trả ngày (date) và giờ không múi giờ (timestamp) dưới dạng chuỗi, không đổi sang Date theo múi giờ của server
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v);

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new HttpError(500, 'no_database');
    // Serverless: ít kết nối, đóng nhanh khi rảnh
    pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX) || 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  }
  return pool;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
