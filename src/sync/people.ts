/** Bạn bè, dự án và thành viên dự án đang mở (lấy từ API, không lưu offline) */
import { create } from 'zustand';
import { api, type ApiUser, type FriendLists, type Member, type ProjectInfo } from './api';
import { useSession } from './session';

interface PeopleState extends FriendLists {
  projects: ProjectInfo[];
  /** Thành viên của dự án đang mở */
  members: Member[];
  loaded: boolean;
}

export const usePeople = create<PeopleState>(() => ({
  friends: [],
  incoming: [],
  outgoing: [],
  projects: [],
  members: [],
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

/** Tải lại mọi thứ (sau khi đăng nhập, khi chuyển bảng, hoặc định kỳ) */
export async function refreshPeople() {
  const project = useSession.getState().project;
  try {
    await Promise.all([loadFriends(), loadProjects(), loadMembers(project)]);
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

export async function createProject(name: string) {
  const { project } = await api.createProject(name);
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
  set({ members });
  await loadProjects();
}

export async function removeMember(projectId: string, userId: string) {
  const { members } = await api.removeMember(projectId, userId);
  set({ members });
  await loadProjects();
}

/** Những người có thể gắn vào việc trên bảng đang mở: thành viên dự án, hoặc mình + bạn bè ở bảng cá nhân */
export function assignableUsers(me: ApiUser | null, project: string | null, s: PeopleState): ApiUser[] {
  if (project) return s.members;
  return me ? [me, ...s.friends] : s.friends;
}

/** Tra thông tin người dùng theo id (để hiện avatar) */
export function userDirectory(me: ApiUser | null, s: PeopleState): Map<string, ApiUser> {
  const m = new Map<string, ApiUser>();
  for (const u of [...s.friends, ...s.members, ...(me ? [me] : [])]) m.set(u.id, u);
  return m;
}
