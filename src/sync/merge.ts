/**
 * Gộp thay đổi khi lưu bị xung đột (máy chủ đã có bản mới hơn, thường do tab / thiết bị khác).
 * Thay vì bỏ thay đổi của người dùng và tải bản máy chủ về (việc vừa kéo sang cột khác bị nhảy lại),
 * lấy bản máy chủ làm nền rồi áp những gì người dùng đã làm trên máy này kể từ lần đồng bộ gần nhất:
 *  - việc mới / sửa / chuyển cột ở máy này: giữ theo máy này (nếu cùng một việc cũng bị sửa ở nơi khác thì máy này thắng);
 *  - việc bị xoá ở máy này: xoá;
 *  - việc chỉ bị sửa ở nơi khác: giữ nguyên bản của nơi khác;
 *  - cột, bộ lọc, lời nhắc: nếu máy này có đổi thì dùng của máy này, không thì dùng của máy chủ.
 */
import type { Column, Reminder, SavedFilter, Task } from '../types';

export interface BoardSnap {
  columns: Column[];
  tasks: Record<string, Task>;
  filters: SavedFilter[];
  reminders: Reminder[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const meta = (cols: Column[]) => cols.map(({ taskIds: _ids, ...rest }) => (void _ids, rest));

function placement(cols: Column[]) {
  const m = new Map<string, { col: string; idx: number }>();
  for (const c of cols) c.taskIds.forEach((id, idx) => m.set(id, { col: c.id, idx }));
  return m;
}

/** base = bản đồng bộ gần nhất; local = bản trên máy này; server = bản mới trên máy chủ. Trả null nếu không gộp được. */
export function mergeBoards(base: BoardSnap | null, local: BoardSnap, server: BoardSnap): BoardSnap | null {
  if (!base) return null;

  const wb = placement(base.columns);
  const wl = placement(local.columns);

  const changed: string[] = [];
  for (const id of Object.keys(local.tasks)) {
    const b = base.tasks[id];
    if (!b || !same(b, local.tasks[id]) || wb.get(id)?.col !== wl.get(id)?.col) changed.push(id);
  }
  const removed = Object.keys(base.tasks).filter((id) => !local.tasks[id]);

  const tasks: Record<string, Task> = { ...server.tasks };
  for (const id of removed) delete tasks[id];
  for (const id of changed) tasks[id] = local.tasks[id];

  // Cột: máy này có sửa cấu trúc cột thì theo máy này, không thì theo máy chủ
  const columnsChanged = !same(meta(base.columns), meta(local.columns));
  const shape = columnsChanged ? local.columns : server.columns;
  const colIds = new Set(shape.map((c) => c.id));
  const fallback = (shape.find((c) => !c.isDone && c.builtin !== 'overdue') ?? shape[0])?.id;
  if (!fallback) return null;

  // Việc nằm ở cột nào: mặc định theo máy chủ, việc đã đổi ở máy này thì theo máy này
  const serverWhere = placement(server.columns);
  const changedSet = new Set(changed);
  const colOf = (id: string) => {
    const want = changedSet.has(id) ? wl.get(id)?.col : serverWhere.get(id)?.col;
    return want && colIds.has(want) ? want : fallback;
  };

  const lists = new Map<string, string[]>(shape.map((c) => [c.id, []]));
  // 1) việc không đổi ở máy này: giữ thứ tự của máy chủ
  for (const c of server.columns) {
    for (const id of c.taskIds) {
      if (!tasks[id] || changedSet.has(id)) continue;
      lists.get(colOf(id))!.push(id);
    }
  }
  // 2) việc đã đổi ở máy này: chèn vào đúng vị trí đã đặt
  const byLocal = [...changed].sort((a, b) => (wl.get(a)?.idx ?? 0) - (wl.get(b)?.idx ?? 0));
  for (const id of byLocal) {
    const list = lists.get(colOf(id))!;
    list.splice(Math.min(wl.get(id)?.idx ?? list.length, list.length), 0, id);
  }
  // 3) việc có trong dữ liệu mà chưa vào cột nào (ví dụ cột của chúng đã bị xoá): đưa vào cột mặc định
  const placed = new Set([...lists.values()].flat());
  for (const id of Object.keys(tasks)) if (!placed.has(id)) lists.get(fallback)!.push(id);

  return {
    columns: shape.map((c) => ({ ...c, taskIds: lists.get(c.id)! })),
    tasks,
    filters: same(base.filters, local.filters) ? server.filters : local.filters,
    reminders: same(base.reminders, local.reminders) ? server.reminders : local.reminders,
  };
}
