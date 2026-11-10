/** Bạn bè, dự án và thành viên dự án đang mở (lấy từ API, không lưu offline) */
import { create } from 'zustand';
import { api, type ApiUser, type BoardInfo, type FriendLists, type Member, type ProjectInfo, type ServerNotice } from './api';
import { useSession } from './session';

interface PeopleState extends FriendLists {
  projects: ProjectInfo[];
  /** Thành viên của dự án đang mở */
  members: Member[];
  /** Thông báo từ máy chủ (ví dụ: được thêm vào dự án) */
  notices: ServerNotice[];
  loaded: boolean;
}

export const usePeople = create<PeopleState>(() => ({
  friends: [],
  incoming: [],
  outgoing: [],
  projects: [],
  members: [],
  notices: [],
  loaded: false,
}));

const set = usePeople.setState;

export async function loadFriends() {
  set(await api.friends());
}

export async function loadProjects() {
  const { projects } = await api.projects();
  set({ projects });
}

export async function loadMembers(projectId: string | null) {
  if (!projectId) {
    set({ members: [] });
    return;
  }
  const { members } = await api.project(projectId);
  set({ members });
}

/** Dự án chứa bảng đang mở (null nếu đang ở bảng cá nhân) */
export function projectOfBoard(board: string | null, projects: ProjectInfo[]): ProjectInfo | undefined {
  if (!board) return undefined;
  return projects.find((p) => p.boards.some((b) => b.id === board));
}

export function boardInfo(board: string | null, projects: ProjectInfo[]): BoardInfo | undefined {
  return projectOfBoard(board, projects)?.boards.find((b) => b.id === board);
}

export async function loadNotices() {
  const { items } = await api.notifications();
  set({ notices: items });
}

export async function readNotices(ids?: string[]) {
  const { items } = await api.readNotifications(ids);
  set({ notices: items });
}

/** Tải lại mọi thứ (sau khi đăng nhập, khi chuyển bảng, hoặc định kỳ) */
export async function refreshPeople() {
  try {
    await Promise.all([loadFriends(), loadProjects(), loadNotices()]);
    const board = useSession.getState().board;
    await loadMembers(projectOfBoard(board, usePeople.getState().projects)?.id ?? null);
    set({ loaded: true });
  } catch {
    /* mất mạng: giữ dữ liệu cũ */
  }
}

export async function requestFriend(email: string) {
  const out = await api.requestFriend(email);
  await loadFriends();
  return out;
}

export async function acceptFriend(id: string) {
  set(await api.acceptFriend(id));
}

export async function removeFriend(id: string) {
  set(await api.removeFriend(id));
}

export async function createProject(name: string, boardName: string) {
  const { project } = await api.createProject(name, boardName);
  await loadProjects();
  return project;
}

export async function renameProject(id: string, name: string) {
  await api.renameProject(id, name);
  await loadProjects();
}

export async function deleteProject(id: string) {
  await api.deleteProject(id);
  await loadProjects();
}

export async function addMember(projectId: string, userId: string) {
  const { members } = await api.addMember(projectId, userId);
  await refreshPeople();
  return members;
}

export async function removeMember(projectId: string, userId: string) {
  const { members } = await api.removeMember(projectId, userId);
  await refreshPeople();
  return members;
}

export async function createBoard(projectId: string, name: string) {
  const { board } = await api.createBoard(projectId, name);
  await loadProjects();
  return board;
}

export async function renameBoard(id: string, name: string) {
  await api.renameBoard(id, name);
  await loadProjects();
}

export async function deleteBoard(id: string) {
  await api.deleteBoard(id);
  await loadProjects();
}

/** Người có thể gắn vào việc: thành viên dự án ở bảng dự án; bảng cá nhân chỉ có chính mình */
export function assignableUsers(me: ApiUser | null, board: string | null, s: PeopleState): ApiUser[] {
  if (board) return s.members;
  return me ? [me] : [];
}

/** Tra thông tin người dùng theo id (để hiện avatar) */
export function userDirectory(me: ApiUser | null, s: PeopleState): Map<string, ApiUser> {
  const m = new Map<string, ApiUser>();
  for (const u of [...s.friends, ...s.members, ...(me ? [me] : [])]) m.set(u.id, u);
  return m;
}
