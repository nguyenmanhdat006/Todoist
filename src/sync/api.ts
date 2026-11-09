/** Gọi API (/api/*). Lỗi được chuẩn hoá thành ApiError để màn hình hiển thị đúng thông báo. */
import type { ExportFile } from '../data/exchange';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
}

export class ApiError extends Error {
  constructor(
    /** 0 = không kết nối được máy chủ */
    public status: number,
    public code: string,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
  get offline() {
    return this.status === 0;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // Không phải JSON: thường là máy chủ chưa chạy / proxy lỗi
    if (!res.ok) throw new ApiError(res.status >= 500 ? 0 : res.status, res.status >= 500 ? 'network' : 'bad_response');
  }
  if (!res.ok) throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'server_error', data);
  return data as T;
}

export const api = {
  me: () => call<{ user: ApiUser }>('GET', '/api/auth/me'),
  login: (email: string, password: string) => call<{ user: ApiUser }>('POST', '/api/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    call<{ user: ApiUser }>('POST', '/api/auth/register', { email, password, name }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  getBoard: () => call<{ revision: number; file: ExportFile | null }>('GET', '/api/board'),
  putBoard: (baseRevision: number, file: ExportFile) =>
    call<{ revision: number; warnings: number }>('PUT', '/api/board', { baseRevision, file }),
};
