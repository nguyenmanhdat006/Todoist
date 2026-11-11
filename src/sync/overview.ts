/**
 * Việc từ mọi bảng mà người dùng truy cập được (dự án cá nhân và dự án nhóm), cho trang Danh sách và Lịch.
 * Bảng đang mở lấy từ dữ liệu trên máy (luôn mới nhất, kể cả chưa lưu); các bảng khác lấy từ máy chủ.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { useBoard } from '../store/board';
import type { Column, Task } from '../types';
import { api, type ApiUser, type OverviewBoard } from './api';
import { quietly } from './activity';
import { projectOfBoard, usePeople } from './people';
import { useSession } from './session';

interface OverviewState {
  boards: OverviewBoard[];
  users: ApiUser[];
  /** Phạm vi đang xem: 'all' | 'p:<id dự án>' | 'b:<id bảng>' */
  scope: string;
  setScope: (s: string) => void;
}

export const useOverview = create<OverviewState>((set) => ({
  boards: [],
  users: [],
  scope: 'all',
  setScope: (scope) => set({ scope }),
}));

export async function loadOverview(background = false) {
  try {
    const r = await (background ? quietly(() => api.overview()) : api.overview());
    useOverview.setState({ boards: r.boards, users: r.users });
  } catch {
    /* mất mạng: giữ dữ liệu cũ */
  }
}

export interface Entry {
  /** boardId:taskId — id việc có thể trùng giữa các bảng (ví dụ nhập cùng một file) */
  key: string;
  task: Task;
  col: Column;
  colIndex: number;
  position: number;
  boardId: string;
  boardName: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  kind: 'personal' | 'team';
  /** Thuộc bảng khác bảng đang mở: xem được, muốn sửa phải mở bảng đó */
  foreign: boolean;
}

/** Mọi việc của mọi bảng (chưa lọc theo phạm vi) */
export function useAllEntries(): Entry[] {
  const columns = useBoard((s) => s.columns);
  const tasks = useBoard((s) => s.tasks);
  const boards = useOverview((s) => s.boards);
  const projects = usePeople((s) => s.projects);
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  const active = board ?? me?.id ?? '';

  return useMemo(() => {
    const cur = projectOfBoard(active, projects);
    const curBoard = cur?.boards.find((b) => b.id === active);
    const out: Entry[] = [];
    const push = (e: Omit<Entry, 'key'>) => out.push({ ...e, key: `${e.boardId}:${e.task.id}` });

    columns.forEach((col, colIndex) =>
      col.taskIds.forEach((id, position) => {
        const task = tasks[id];
        if (task)
          push({
            task, col, colIndex, position, boardId: active, boardName: curBoard?.name ?? '',
            projectId: cur?.id ?? '', projectName: cur?.name ?? '', projectKey: cur?.key ?? '', kind: cur?.kind ?? 'personal', foreign: false,
          });
      }),
    );
    for (const b of boards) {
      if (b.id === active) continue;
      const cols = new Map<string, { col: Column; index: number }>(
        b.columns.map((c, index) => [
          c.id,
          { index, col: { id: c.id, title: c.title, color: c.color, isDone: c.isDone, taskIds: [], builtin: c.builtin ?? undefined, cardColor: c.cardColor } },
        ]),
      );
      for (const t of b.tasks) {
        const c = cols.get(t.columnId);
        if (!c) continue;
        push({
          task: t as Task, col: c.col, colIndex: c.index, position: t.position, boardId: b.id, boardName: b.name,
          projectId: b.projectId, projectName: b.projectName, projectKey: b.projectKey, kind: b.kind, foreign: true,
        });
      }
    }
    return out;
  }, [columns, tasks, boards, projects, active]);
}

/** Việc theo phạm vi đang chọn */
export function useScopedEntries(): Entry[] {
  const all = useAllEntries();
  const scope = useOverview((s) => s.scope);
  return useMemo(() => {
    if (scope.startsWith('p:')) return all.filter((e) => e.projectId === scope.slice(2));
    if (scope.startsWith('b:')) return all.filter((e) => e.boardId === scope.slice(2));
    return all;
  }, [all, scope]);
}

/** Id người dùng → thông tin, cho avatar của việc ở bảng khác */
export function useOverviewUsers(): Map<string, ApiUser> {
  const users = useOverview((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}
