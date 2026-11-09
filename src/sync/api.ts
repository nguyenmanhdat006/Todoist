/** Gọi API (/api/*). Lỗi được chuẩn hoá thành ApiError để màn hình hiển thị đúng thông báo. */
import type { ExportFile } from '../data/exchange';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
}

export interface FriendLists {
  friends: ApiUser[];
  incoming: ApiUser[];
  outgoing: ApiUser[];
}

export interface ProjectInfo {
  id: string;
  name: string;
  ownerId: string;
  role: 'host' | 'member';
  memberCount?: number;
}

export interface Member extends ApiUser {
  role: 'host' | 'member';
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
  getBoard: (project: string | null) =>
    call<{ revision: number; file: ExportFile | null }>('GET', project ? `/api/board?project=${encodeURIComponent(project)}` : '/api/board'),
  putBoard: (baseRevision: number, file: ExportFile, project: string | null) =>
    call<{ revision: number; warnings: number }>('PUT', '/api/board', { baseRevision, file, ...(project ? { project } : {}) }),

  // bạn bè
  friends: () => call<FriendLists>('GET', '/api/friends'),
  requestFriend: (email: string) => call<{ user: ApiUser; status: 'pending' | 'accepted' }>('POST', '/api/friends/request', { email }),
  acceptFriend: (id: string) => call<FriendLists>('POST', `/api/friends/${id}/accept`),
  removeFriend: (id: string) => call<FriendLists>('DELETE', `/api/friends/${id}`),

  // dự án
  projects: () => call<{ projects: ProjectInfo[] }>('GET', '/api/projects'),
  createProject: (name: string) => call<{ project: ProjectInfo }>('POST', '/api/projects', { name }),
  project: (id: string) => call<{ project: ProjectInfo; members: Member[] }>('GET', `/api/projects/${id}`),
  renameProject: (id: string, name: string) => call<{ project: { id: string; name: string } }>('PATCH', `/api/projects/${id}`, { name }),
  deleteProject: (id: string) => call<{ ok: true }>('DELETE', `/api/projects/${id}`),
  addMember: (id: string, userId: string) => call<{ members: Member[] }>('POST', `/api/projects/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => call<{ members: Member[] }>('DELETE', `/api/projects/${id}/members/${userId}`),
};
