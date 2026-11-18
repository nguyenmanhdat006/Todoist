/** Bạn bè, dự án và thành viên dự án đang mở (lấy từ API, không lưu offline) */
import { create } from 'zustand';
import { api, type ApiUser, type BoardInfo, type FriendLists, type Member, type ProjectInfo, type ServerNotice, type TeamInfo } from './api';
import { useSession } from './session';
import { toast } from '../toast';
import { quietly } from './activity';

interface PeopleState extends FriendLists {
  projects: ProjectInfo[];
  /** Các nhóm mình thuộc về */
  teams: TeamInfo[];
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
  teams: [],
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

export async function loadTeams() {
  const { teams } = await api.teams();
  set({ teams });
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

let noticesSeen = false;

export async function loadNotices() {
  const { items } = await api.notifications();
  // Thông báo bạn bè mới đến khi đang mở app: hiện thêm toast
  if (noticesSeen) {
    const known = new Set(usePeople.getState().notices.map((n) => n.id));
    for (const n of items) {
      if (n.read || known.has(n.id)) continue;
      const who = n.data.name || n.data.email || '';
      if (n.type === 'friend_request') toast.info('toast.friendRequestIn', { name: who });
      else if (n.type === 'friend_accepted') toast.success('toast.friendAcceptedBy', { name: who });
      else if (n.type === 'friend_declined') toast.info('toast.friendDeclinedBy', { name: who });
    }
  }
  noticesSeen = true;
  set({ notices: items });
}

export async function readNotices(ids?: string[]) {
  const { items } = await api.readNotifications(ids);
  set({ notices: items });
}

/** Tải lại mọi thứ (sau khi đăng nhập, khi chuyển bảng, hoặc định kỳ) */
export async function refreshPeople() {
  try {
    await quietly(async () => {
      await Promise.all([loadFriends(), loadProjects(), loadTeams(), loadNotices()]);
      const board = useSession.getState().board;
      await loadMembers(projectOfBoard(board, usePeople.getState().projects)?.id ?? null);
    });
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
  toast.success('toast.friendAccepted');
}

export async function removeFriend(id: string) {
  set(await api.removeFriend(id));
  toast.success('toast.friendRemoved');
}

export async function createProject(name: string, kind: 'personal' | 'team') {
  const { project } = await api.createProject(name, kind);
  await loadProjects();
  toast.success('toast.projectCreated', { name: name.trim() });
  return project;
}

export async function renameProject(id: string, name: string, key?: string) {
  await api.renameProject(id, name, key);
  await loadProjects();
  toast.success('toast.projectRenamed', { name: name.trim() });
}

export async function deleteProject(id: string) {
  await api.deleteProject(id);
  await loadProjects();
  toast.success('toast.projectDeleted');
}

export async function createTeam(name: string) {
  const { id, teams } = await api.createTeam(name);
  set({ teams });
  toast.success('toast.teamCreated', { name: name.trim() });
  return id;
}

export async function renameTeam(id: string, name: string) {
  set(await api.renameTeam(id, name));
  toast.success('toast.teamRenamed', { name: name.trim() });
}

export async function deleteTeam(id: string) {
  set(await api.deleteTeam(id));
  await loadProjects();
  toast.success('toast.teamDeleted');
}

export async function addTeamMember(teamId: string, userId: string) {
  set(await api.addTeamMember(teamId, userId));
  await loadMembers(projectOfBoard(useSession.getState().board, usePeople.getState().projects)?.id ?? null);
  toast.success('toast.memberAdded');
}

export async function removeTeamMember(teamId: string, userId: string) {
  set(await api.removeTeamMember(teamId, userId));
  await refreshPeople();
  toast.success('toast.memberRemoved');
}

/** Gắn nhóm vào dự án: thành viên của nhóm tự thành thành viên dự án */
export async function attachTeam(projectId: string, teamId: string) {
  const r = await api.attachTeam(projectId, teamId);
  await refreshPeople();
  toast.success('toast.teamAttached');
  return r;
}

export async function detachTeam(projectId: string, teamId: string) {
  const r = await api.detachTeam(projectId, teamId);
  await refreshPeople();
  toast.success('toast.teamDetached');
  return r;
}

export async function leaveProject(projectId: string) {
  await api.leaveProject(projectId);
  await refreshPeople();
  toast.success('toast.memberRemoved');
}

export async function createBoard(projectId: string, name: string) {
  const { board } = await api.createBoard(projectId, name);
  await loadProjects();
  toast.success('toast.boardCreated', { name: name.trim() });
  return board;
}

export async function renameBoard(id: string, name: string) {
  await api.renameBoard(id, name);
  await loadProjects();
  toast.success('toast.boardRenamed', { name: name.trim() });
}

export async function deleteBoard(id: string) {
  await api.deleteBoard(id);
  await loadProjects();
  toast.success('toast.boardDeleted');
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

/** Mã dự án của bảng đang mở (tiền tố mã ticket); chưa tải xong thì rỗng */
export function useCurrentProjectKey(): string {
  const projects = usePeople((s) => s.projects);
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  return projectOfBoard(board ?? me?.id ?? null, projects)?.key ?? '';
}
