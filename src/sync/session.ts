/**
 * Đăng nhập và đồng bộ dữ liệu với máy chủ.
 *
 * - Máy chủ (Neon) là bản chính. Trình duyệt vẫn giữ bản tạm trong localStorage (store board.ts)
 *   để mở app nhanh và dùng được khi mất mạng.
 * - Mỗi thay đổi được gửi lên sau ~0,8 giây (cả bảng một lần, dạng file xuất JSON).
 * - revision tăng mỗi lần lưu; nếu thiết bị khác đã lưu trước (409), tải bản mới về và cho chọn giữ bản trên máy này.
 */
import { create } from 'zustand';
import { buildExport, parseImport, type ExportFile } from '../data/exchange';
import { defaultFilters, emptyBoard, useBoard, type Snapshot } from '../store/board';
import { api, ApiError, type ApiUser } from './api';

export type Status = 'checking' | 'anon' | 'choose' | 'ready';
export type SyncState = 'saved' | 'saving' | 'pending' | 'offline' | 'error';

export interface Notice {
  id: number;
  key: 'sync.conflict' | 'sync.sessionExpired' | 'sync.uploaded';
  actionKey?: 'sync.keepLocal';
  onAction?: () => void;
}

/** Lựa chọn khi đăng nhập lần đầu trên máy đã có dữ liệu chưa đồng bộ */
export interface Choice {
  localTasks: number;
  serverTasks: number;
  serverRevision: number;
  serverFile: ExportFile | null;
}

interface Meta {
  userId: string | null;
  email: string;
  name: string;
  revision: number;
  dirty: boolean;
  /** Bảng đang mở: null = bảng cá nhân, hoặc id dự án */
  project: string | null;
}

interface SessionState {
  status: Status;
  user: ApiUser | null;
  sync: SyncState;
  /** Lỗi khi kiểm tra phiên lúc mở app (ví dụ không kết nối được máy chủ) */
  bootError: string | null;
  choice: Choice | null;
  notice: Notice | null;
  /** Bảng đang mở (null = cá nhân) */
  project: string | null;
  /** Đang chuyển bảng */
  switching: boolean;
}

export const useSession = create<SessionState>(() => ({
  status: 'checking',
  user: null,
  sync: 'saved',
  bootError: null,
  choice: null,
  notice: null,
  project: null,
  switching: false,
}));

const set = useSession.setState;
const META_KEY = 'tm-sync';
const PUSH_DELAY = 800;
const RETRY_DELAY = 15_000;

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null');
    if (m && typeof m === 'object')
      return {
        userId: typeof m.userId === 'string' ? m.userId : null,
        email: String(m.email ?? ''),
        name: String(m.name ?? ''),
        revision: Number(m.revision) || 0,
        dirty: m.dirty === true,
        project: typeof m.project === 'string' ? m.project : null,
      };
  } catch {
    /* localStorage bị chặn */
  }
  return { userId: null, email: '', name: '', revision: 0, dirty: false, project: null };
}

let meta = readMeta();
function saveMeta(patch: Partial<Meta>) {
  meta = { ...meta, ...patch };
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* bỏ qua */
  }
}

let noticeId = 0;
const notify = (n: Omit<Notice, 'id'>) => set({ notice: { ...n, id: ++noticeId } });

/* ---------- áp dữ liệu vào store mà không kích hoạt gửi lên ---------- */

let applying = false;
function withoutPush(fn: () => void) {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

function applyFile(file: ExportFile) {
  const parsed = parseImport(file);
  if (!parsed.ok) throw new ApiError(500, 'bad_board');
  withoutPush(() => useBoard.getState().applyImport(parsed.data));
}

function resetLocal() {
  withoutPush(() => {
    const lang = useBoard.getState().lang;
    useBoard.setState({ ...emptyBoard(lang), filters: defaultFilters(), reminders: [] });
  });
}

const taskCount = () => Object.keys(useBoard.getState().tasks).length;

/* ---------- gửi lên ---------- */

let localVersion = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pushing = false;

function schedule(delay = PUSH_DELAY) {
  clearTimeout(timer);
  timer = setTimeout(() => void push(), delay);
}

export async function push(): Promise<void> {
  const s = useSession.getState();
  if (s.status !== 'ready' || pushing) return;
  if (!meta.dirty) {
    set({ sync: 'saved' });
    return;
  }
  pushing = true;
  const started = localVersion;
  set({ sync: 'saving' });
  try {
    const st = useBoard.getState();
    const { revision } = await api.putBoard(meta.revision, buildExport(st), meta.project);
    saveMeta({ revision, dirty: localVersion !== started });
    set({ sync: meta.dirty ? 'pending' : 'saved' });
    if (meta.dirty) schedule(0);
  } catch (e) {
    await handlePushError(e);
  } finally {
    pushing = false;
  }
}

async function handlePushError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(0, 'network');
  if (err.offline) {
    set({ sync: 'offline' });
    schedule(RETRY_DELAY);
  } else if (err.status === 401) {
    set({ status: 'anon', user: null, sync: 'pending' });
    notify({ key: 'sync.sessionExpired' });
  } else if (err.status === 409) {
    await resolveConflict();
  } else {
    set({ sync: 'error' });
  }
}

/** Thiết bị khác đã lưu trước: lấy bản trên máy chủ, giữ bản trên máy này để người dùng chọn lại */
async function resolveConflict() {
  const local: Snapshot = useBoard.getState().snapshot();
  try {
    const { revision, file } = await api.getBoard(meta.project);
    if (file) applyFile(file);
    saveMeta({ revision, dirty: false });
    set({ sync: 'saved' });
    notify({
      key: 'sync.conflict',
      actionKey: 'sync.keepLocal',
      onAction: () => {
        useBoard.getState().restore(local);
        // restore() đi qua subscribe nên tự đánh dấu cần gửi; gửi ngay
        schedule(0);
      },
    });
  } catch (e) {
    await handlePushError(e);
  }
}

// Theo dõi thay đổi dữ liệu trong store để gửi lên
useBoard.subscribe((s, prev) => {
  if (applying) return;
  if (s.columns === prev.columns && s.tasks === prev.tasks && s.filters === prev.filters && s.reminders === prev.reminders) return;
  if (useSession.getState().status !== 'ready') return;
  localVersion++;
  if (!meta.dirty) saveMeta({ dirty: true });
  set({ sync: 'pending' });
  schedule();
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('beforeunload', (e) => {
    const { status, sync } = useSession.getState();
    if (status === 'ready' && (sync === 'saving' || sync === 'pending')) e.preventDefault();
  });
}

/* ---------- đăng nhập / mở app ---------- */

async function enter(user: ApiUser) {
  const sameUser = meta.userId === user.id;
  // Dữ liệu đang có trên máy chưa từng gắn với tài khoản nào (dùng app trước khi có đăng nhập)
  const unsyncedLocal = !meta.userId && taskCount() > 0;
  saveMeta({ userId: user.id, email: user.email, name: user.name, ...(sameUser ? {} : { revision: 0, dirty: false, project: null }) });
  set({ user, bootError: null, project: meta.project });

  if (sameUser && meta.dirty) {
    // Còn thay đổi chưa gửi từ lần trước (mất mạng / tắt máy): gửi trước
    set({ status: 'ready' });
    await push();
    return;
  }
  let board: { revision: number; file: ExportFile | null };
  try {
    board = await api.getBoard(meta.project);
  } catch (e) {
    // Dự án đã bị xoá hoặc mình không còn là thành viên: quay về bảng cá nhân
    if (!(e instanceof ApiError && e.status === 404 && meta.project)) throw e;
    saveMeta({ project: null, revision: 0, dirty: false });
    set({ project: null });
    resetLocal();
    board = await api.getBoard(null);
  }
  const { revision, file } = board;
  if (unsyncedLocal) {
    set({
      status: 'choose',
      choice: { localTasks: taskCount(), serverTasks: file?.tasks.length ?? 0, serverRevision: revision, serverFile: file },
    });
    return;
  }
  if (!sameUser) resetLocal();
  if (file) applyFile(file);
  saveMeta({ revision, dirty: !file });
  set({ status: 'ready', sync: file ? 'saved' : 'pending' });
  // Tài khoản mới: lưu bảng trống (có các cột mặc định) lên máy chủ
  if (!file) await push();
}

/** Người dùng chọn giữ dữ liệu trên máy này hay dùng dữ liệu của tài khoản */
export async function choose(useLocal: boolean) {
  const c = useSession.getState().choice;
  if (!c) return;
  set({ choice: null });
  saveMeta({ revision: c.serverRevision });
  if (useLocal) {
    saveMeta({ dirty: true });
    set({ status: 'ready' });
    await push();
    if (!meta.dirty) notify({ key: 'sync.uploaded' });
    return;
  }
  if (c.serverFile) {
    applyFile(c.serverFile);
    saveMeta({ dirty: false });
    set({ status: 'ready', sync: 'saved' });
  } else {
    resetLocal();
    saveMeta({ dirty: true });
    set({ status: 'ready' });
    await push();
  }
}

export async function boot() {
  set({ status: 'checking', bootError: null });
  try {
    const { user } = await api.me();
    await enter(user);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(0, 'network');
    if (err.offline && meta.userId) {
      // Mất mạng nhưng đã đăng nhập trước đó: dùng bản trên máy, thử lại sau
      set({
        status: 'ready',
        user: { id: meta.userId, email: meta.email, name: meta.name },
        sync: 'offline',
      });
      schedule(RETRY_DELAY);
      retryBoot();
    } else {
      set({ status: 'anon', user: null, bootError: err.offline ? 'network' : null });
    }
  }
}

/** Khi đang dùng bản offline, thử kết nối lại định kỳ để kiểm tra phiên và tải bản mới */
let retrying = false;
function retryBoot() {
  if (retrying) return;
  retrying = true;
  const tick = async () => {
    try {
      const { user } = await api.me();
      retrying = false;
      await enter(user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        retrying = false;
        set({ status: 'anon', user: null });
        notify({ key: 'sync.sessionExpired' });
      } else setTimeout(tick, RETRY_DELAY);
    }
  };
  setTimeout(tick, RETRY_DELAY);
}

export async function login(email: string, password: string) {
  const { user } = await api.login(email, password);
  await enter(user);
}

export async function register(email: string, password: string, name: string) {
  const { user } = await api.register(email, password, name);
  await enter(user);
}

/** Đăng xuất: gửi nốt thay đổi rồi xoá dữ liệu trên máy. Trả false nếu người dùng huỷ vì còn dữ liệu chưa lưu. */
export async function logout(confirmLoss: () => boolean): Promise<boolean> {
  clearTimeout(timer);
  if (meta.dirty) await push();
  if (meta.dirty && !confirmLoss()) return false;
  try {
    await api.logout();
  } catch {
    /* vẫn đăng xuất ở máy */
  }
  resetLocal();
  saveMeta({ userId: null, email: '', name: '', revision: 0, dirty: false, project: null });
  set({ status: 'anon', user: null, sync: 'saved', choice: null, project: null });
  return true;
}

export const syncNow = () => {
  if (!meta.dirty) saveMeta({ dirty: true });
  return push();
};

/* ---------- chuyển bảng (cá nhân / dự án) ---------- */

/**
 * Mở bảng khác: gửi nốt thay đổi của bảng hiện tại, rồi tải bảng mới từ máy chủ.
 * Trả false nếu không chuyển được (mất mạng mà còn thay đổi chưa lưu và người dùng huỷ).
 */
export async function switchBoard(project: string | null, confirmLoss: () => boolean): Promise<boolean> {
  if (project === meta.project) return true;
  clearTimeout(timer);
  if (meta.dirty) await push();
  if (meta.dirty && !confirmLoss()) return false;
  set({ switching: true });
  try {
    const { revision, file } = await api.getBoard(project);
    saveMeta({ project, revision, dirty: false });
    resetLocal();
    if (file) applyFile(file);
    set({ project, sync: file ? 'saved' : 'pending' });
    if (!file) {
      // Bảng mới (dự án vừa tạo): lưu các cột mặc định lên máy chủ
      saveMeta({ dirty: true });
      await push();
    }
    return true;
  } catch (e) {
    await handlePushError(e);
    return false;
  } finally {
    set({ switching: false });
  }
}

/** Bảng dự án có thể bị người khác sửa: định kỳ tải bản mới nếu máy này không có thay đổi chưa lưu */
async function pull() {
  const s = useSession.getState();
  if (s.status !== 'ready' || s.switching || pushing || meta.dirty) return;
  try {
    const { revision, file } = await api.getBoard(meta.project);
    if (revision > meta.revision && !meta.dirty && file) {
      applyFile(file);
      saveMeta({ revision });
    }
  } catch {
    /* thử lại lần sau */
  }
}

if (typeof window !== 'undefined') {
  setInterval(() => void pull(), 30_000);
  window.addEventListener('focus', () => void pull());
}
