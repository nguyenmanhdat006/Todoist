import { trackStart } from './activity';
/** Gọi API (/api/*). Lỗi được chuẩn hoá thành ApiError để màn hình hiển thị đúng thông báo. */
import type { ExportColumn, ExportFile, ExportTask } from '../data/exchange';

export type Role = 'admin' | 'user';

export interface ApiUser {
  id: string;
  email: string;
  name: string;
}

/** Người đang đăng nhập; role (admin / user) thiếu khi dùng bản offline */
export interface AccountUser extends ApiUser {
  role?: Role;
}

export interface AdminUser extends AccountUser {
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export interface FriendLists {
  friends: ApiUser[];
  incoming: ApiUser[];
  outgoing: ApiUser[];
}

export interface BoardInfo {
  id: string;
  name: string;
  position: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  ownerId: string;
  role: 'host' | 'member';
  /** Mã dự án dùng làm tiền tố mã ticket (ví dụ STU-12) */
  key: string;
  /** personal = dự án riêng (chỉ mình), team = dự án nhóm */
  kind: 'personal' | 'team';
  memberCount?: number;
  boards: BoardInfo[];
}

/** Một bảng cùng cột và việc, dùng cho trang Danh sách / Lịch gộp nhiều bảng */
export interface OverviewBoard {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  kind: 'personal' | 'team';
  columns: ExportColumn[];
  tasks: ExportTask[];
}

export interface ServerNotice {
  id: string;
  type: 'project_added' | 'friend_request' | 'friend_accepted' | 'friend_declined' | string;
  data: { projectId?: string; projectName?: string; by?: string; userId?: string; name?: string; email?: string };
  createdAt: string;
  read: boolean;
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
  const finish = trackStart();
  try {
    return await request<T>(method, path, body);
  } finally {
    finish();
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  me: () => call<{ user: AccountUser }>('GET', '/api/auth/me'),
  login: (email: string, password: string) => call<{ user: AccountUser }>('POST', '/api/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    call<{ user: AccountUser }>('POST', '/api/auth/register', { email, password, name }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  forgotPassword: (email: string, lang: string) => call<{ ok: true }>('POST', '/api/auth/forgot', { email, lang }),
  resetCheck: (token: string) => call<{ ok: true; email: string }>('POST', '/api/auth/reset/check', { token }),
  resetPassword: (token: string, password: string) => call<{ ok: true }>('POST', '/api/auth/reset', { token, password }),
  updateProfile: (name: string) => call<{ user: AccountUser }>('PATCH', '/api/me', { name }),
  changePassword: (current: string, password: string) => call<{ ok: true }>('POST', '/api/me/password', { current, password }),
  adminUsers: () => call<{ users: AdminUser[] }>('GET', '/api/admin/users'),
  adminUpdateUser: (id: string, patch: { role?: Role; disabled?: boolean }) =>
    call<{ user: AdminUser }>('PATCH', `/api/admin/users/${id}`, patch),
  /** board = id bảng trong dự án; null = bảng cá nhân */
  getBoard: (board: string | null) =>
    call<{ revision: number; file: ExportFile | null }>('GET', board ? `/api/board?board=${encodeURIComponent(board)}` : '/api/board'),
  putBoard: (baseRevision: number, file: ExportFile, board: string | null) =>
    call<{ revision: number; warnings: number; assigned?: Record<string, { number: number | null; creatorId: string | null }> }>('PUT', '/api/board', { baseRevision, file, ...(board ? { board } : {}) }),

  // bạn bè
  friends: () => call<FriendLists>('GET', '/api/friends'),
  requestFriend: (email: string) => call<{ user: ApiUser; status: 'pending' | 'accepted' }>('POST', '/api/friends/request', { email }),
  acceptFriend: (id: string) => call<FriendLists>('POST', `/api/friends/${id}/accept`),
  removeFriend: (id: string) => call<FriendLists>('DELETE', `/api/friends/${id}`),

  // dự án
  projects: () => call<{ projects: ProjectInfo[] }>('GET', '/api/projects'),
  createProject: (name: string, kind: 'personal' | 'team') => call<{ project: ProjectInfo }>('POST', '/api/projects', { name, kind }),
  createBoard: (projectId: string, name: string) => call<{ board: BoardInfo }>('POST', `/api/projects/${projectId}/boards`, { name }),
  renameBoard: (id: string, name: string) => call<{ board: BoardInfo }>('PATCH', `/api/boards/${id}`, { name }),
  deleteBoard: (id: string) => call<{ ok: true }>('DELETE', `/api/boards/${id}`),
  overview: () => call<{ boards: OverviewBoard[]; users: ApiUser[] }>('GET', '/api/overview'),
  notifications: () => call<{ items: ServerNotice[] }>('GET', '/api/notifications'),
  readNotifications: (ids?: string[]) => call<{ items: ServerNotice[] }>('POST', '/api/notifications/read', ids ? { ids } : {}),
  project: (id: string) => call<{ project: ProjectInfo; members: Member[] }>('GET', `/api/projects/${id}`),
  renameProject: (id: string, name: string, key?: string) =>
    call<{ project: { id: string; name: string; key: string } }>('PATCH', `/api/projects/${id}`, key ? { name, key } : { name }),
  deleteProject: (id: string) => call<{ ok: true }>('DELETE', `/api/projects/${id}`),
  addMember: (id: string, userId: string) => call<{ members: Member[] }>('POST', `/api/projects/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => call<{ members: Member[] }>('DELETE', `/api/projects/${id}/members/${userId}`),
};
