import { quietly } from './activity';
/**
 * Đăng nhập và đồng bộ dữ liệu với máy chủ.
 *
 * - Máy chủ (Neon) là bản chính. Trình duyệt vẫn giữ bản tạm trong localStorage (store board.ts)
 *   để mở app nhanh và dùng được khi mất mạng.
 * - Mỗi thay đổi được gửi lên sau ~0,8 giây (cả bảng một lần, dạng file xuất JSON).
 * - revision tăng mỗi lần lưu; nếu thiết bị khác đã lưu trước (409), tải bản mới về và cho chọn giữ bản trên máy này.
 */
import { toast } from '../toast';
import { makeT } from '../i18n';
import { create } from 'zustand';
import { buildExport, parseImport, type ExportFile } from '../data/exchange';
import { defaultFilters, emptyBoard, useBoard, type Snapshot } from '../store/board';
import { api, ApiError, type AccountUser } from './api';
import { mergeBoards, type BoardSnap } from './merge';

export type Status = 'checking' | 'anon' | 'ready';
export type SyncState = 'saved' | 'saving' | 'pending' | 'offline' | 'error';

export interface Notice {
  id: number;
  key: 'sync.conflict' | 'sync.sessionExpired';
  actionKey?: 'sync.keepLocal';
  onAction?: () => void;
}

interface Meta {
  userId: string | null;
  email: string;
  name: string;
  revision: number;
  dirty: boolean;
  /** Bảng đang mở: null = bảng cá nhân, hoặc id bảng trong một dự án */
  board: string | null;
}

interface SessionState {
  status: Status;
  user: AccountUser | null;
  sync: SyncState;
  /** Lỗi khi kiểm tra phiên lúc mở app (ví dụ không kết nối được máy chủ) */
  bootError: string | null;
  notice: Notice | null;
  /** Bảng đang mở (null = bảng cá nhân, hoặc id bảng trong dự án) */
  board: string | null;
  /** Đang chuyển bảng */
  switching: boolean;
  /** Sao lưu: done = bản sao lưu khớp dữ liệu, pending = đang chờ / đang sao lưu, flagged = giữ bản cũ vì dữ liệu ít hẳn */
  backup: 'done' | 'pending' | 'flagged';
}

export const useSession = create<SessionState>(() => ({
  status: 'checking',
  user: null,
  sync: 'saved',
  bootError: null,
  notice: null,
  board: null,
  switching: false,
  backup: 'done',
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
        // 'project' là tên cũ: bảng đầu tiên của dự án cũ có id = id dự án
        board: typeof m.board === 'string' ? m.board : typeof m.project === 'string' ? m.project : null,
      };
  } catch {
    /* localStorage bị chặn */
  }
  return { userId: null, email: '', name: '', revision: 0, dirty: false, board: null };
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

/**
 * Mỗi lần đổi bảng / đăng nhập / đăng xuất tăng thế hệ lên 1. Việc chạy bất đồng bộ (gửi, tải định kỳ, giải quyết xung đột)
 * nhớ thế hệ và bảng lúc bắt đầu; xong mà đã đổi thì bỏ kết quả, tránh ghi dữ liệu của bảng này vào bảng kia.
 */
let epoch = 0;
let reloadingForOtherTab = false;
/** Bảng mà dữ liệu đang nằm trong store thật sự thuộc về. Khác bảng đang mở (meta.board) thì tuyệt đối không gửi lên. */
let loadedFor: string | null = meta.board;
const sameScope = (ep: number, board: string | null) => ep === epoch && board === meta.board;

const ownerKey = (userId: string | null, board: string | null) => `${userId ?? '-'}:${board ?? 'me'}`;
/** Ghi nhận dữ liệu trong store thuộc về bảng này (lưu cùng dữ liệu trong localStorage nên không thể lệch nhau) */
function own(board: string | null) {
  loadedFor = board;
  useBoard.setState({ owner: ownerKey(meta.userId, board) });
}
/**
 * Dữ liệu lưu trên máy gắn với một bảng; nếu không khớp bảng đang ghi trong meta (ví dụ hai tab đổi bảng chen nhau)
 * thì bỏ dữ liệu đó và tải lại từ máy chủ, không bao giờ gửi nó lên bảng khác.
 */
function reconcileOwner() {
  const owner = useBoard.getState().owner;
  if (owner == null || !meta.userId) return; // dữ liệu cũ chưa gắn nhãn: tin là đúng
  if (owner === ownerKey(meta.userId, meta.board)) return;
  console.warn('[sync] dữ liệu trên máy không thuộc bảng đang mở, tải lại từ máy chủ');
  resetLocal();
  saveMeta({ revision: 0, dirty: false });
  useBoard.setState({ owner: null });
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

/**
 * Bản dữ liệu ở lần đồng bộ gần nhất với máy chủ (tải về hoặc gửi lên thành công). Khi lưu bị xung đột,
 * so máy này với bản nền để biết người dùng đã làm gì, rồi áp những việc đó lên bản mới của máy chủ.
 */
let base: BoardSnap | null = null;
const snapOf = (): BoardSnap => {
  const s = useBoard.getState();
  return { columns: s.columns, tasks: s.tasks, filters: s.filters, reminders: s.reminders };
};

function applyFile(file: ExportFile) {
  const parsed = parseImport(file);
  if (!parsed.ok) throw new ApiError(500, 'bad_board');
  withoutPush(() => useBoard.getState().applyImport(parsed.data, true));
  base = snapOf();
}

function resetLocal() {
  withoutPush(() => {
    const lang = useBoard.getState().lang;
    useBoard.setState({ ...emptyBoard(lang), filters: defaultFilters(), reminders: [] });
  });
  base = null;
}


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
  if (s.status !== 'ready' || pushing || s.switching) return;
  if (loadedFor !== meta.board) {
    // Dữ liệu trong bộ nhớ không phải của bảng đang mở: gửi lên sẽ ghi đè nhầm bảng, nên chặn lại
    console.error('[sync] bỏ qua lần gửi: dữ liệu không thuộc bảng đang mở');
    return;
  }
  if (!meta.dirty) {
    set({ sync: 'saved' });
    return;
  }
  pushing = true;
  const started = localVersion;
  const ep = epoch;
  const board = meta.board;
  set({ sync: 'saving' });
  try {
    const st = useBoard.getState();
    const sent = snapOf();
    const { revision, assigned } = await quietly(() => api.putBoard(meta.revision, buildExport(st), board));
    // Đã đổi bảng trong lúc gửi: dữ liệu đã vào đúng bảng cũ, không đụng tới thông tin của bảng mới
    if (!sameScope(ep, board)) return;
    base = sent;
    // Số ticket và người tạo do máy chủ cấp cho việc mới
    if (assigned && Object.keys(assigned).length) withoutPush(() => useBoard.getState().applyTicketInfo(assigned));
    saveMeta({ revision, dirty: localVersion !== started });
    setUnbacked(true);
    scheduleBackup();
    const wasDown = useSession.getState().sync === 'offline' || useSession.getState().sync === 'error';
    set({ sync: meta.dirty ? 'pending' : 'saved' });
    if (wasDown) toast.success('toast.online');
    if (meta.dirty) schedule(0);
  } catch (e) {
    if (sameScope(ep, board)) await handlePushError(e);
  } finally {
    pushing = false;
  }
}

/* ---------- sao lưu tự động ---------- */

// Sao lưu ngay sau khi lưu xong vài giây (gộp các lần sửa liên tiếp)
const BACKUP_DELAY = 3000;
const BACKUP_RETRY = 20_000;
let backupTimer: ReturnType<typeof setTimeout> | undefined;
const warnedBackup = new Set<string>();
/** Đã có thay đổi được lưu lên máy chủ nhưng chưa được sao lưu thành file */
let unbacked = false;
function setUnbacked(v: boolean, flagged = false) {
  unbacked = v;
  set({ backup: flagged ? 'flagged' : v ? 'pending' : 'done' });
}

export function markBackedUp(board: string | null) {
  if (board === meta.board) setUnbacked(false);
}

/** Thông báo đỏ (tam giác) "chưa sao lưu dữ liệu" kèm nút Sao lưu ngay */
function warnNotBackedUp() {
  toast.warning('backup.leaveWarn', undefined, { actionLabel: makeT(useBoard.getState().lang)('backup.now'), onAction: () => void syncAndBackup() });
}

/** Lưu nốt thay đổi rồi sao lưu ngay (nút trong cảnh báo khi thoát) */
export async function syncAndBackup(): Promise<void> {
  clearTimeout(timer);
  while (pushing) await new Promise((r) => setTimeout(r, 40));
  if (meta.dirty) await push();
  if (meta.dirty) return; // chưa lưu được (mất mạng...): không sao lưu bản cũ
  const ep = epoch;
  const board = meta.board;
  try {
    const r = await api.backupNow(board, 'manual');
    if (!sameScope(ep, board)) return;
    if (r.status === 'flagged') toast.error('backup.flaggedToast');
    else {
      setUnbacked(false);
      toast.success('backup.saved');
    }
  } catch {
    toast.error('toast.syncError');
  }
}

/** Sau khi lưu xong vài giây không có thay đổi mới thì nhờ máy chủ sao lưu bảng (chỉ ghi nếu dữ liệu thật sự đổi) */
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => void runBackup(), BACKUP_DELAY);
}

async function runBackup() {
  const ep = epoch;
  const board = meta.board;
  if (useSession.getState().status !== 'ready' || meta.dirty || loadedFor !== board) return;
  try {
    const r = await quietly(() => api.backupNow(board, 'auto'));
    if (sameScope(ep, board)) setUnbacked(r.status === 'flagged', r.status === 'flagged');
    // Dữ liệu ít hơn hẳn bản sao lưu: báo một lần cho mỗi bảng
    if (r.status === 'flagged' && sameScope(ep, board) && !warnedBackup.has(String(board))) {
      warnedBackup.add(String(board));
      toast.error('backup.flaggedToast');
    }
  } catch {
    // Mất mạng / lỗi tạm: thử lại sau ít giây
    if (sameScope(ep, board)) {
      clearTimeout(backupTimer);
      backupTimer = setTimeout(() => void runBackup(), BACKUP_RETRY);
    }
  }
}

async function handlePushError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(0, 'network');
  if (err.offline) {
    if (useSession.getState().sync !== 'offline') toast.info('toast.offline');
    set({ sync: 'offline' });
    schedule(RETRY_DELAY);
  } else if (err.status === 401) {
    set({ status: 'anon', user: null, sync: 'pending' });
    notify({ key: 'sync.sessionExpired' });
  } else if (err.status === 409) {
    await resolveConflict();
  } else {
    if (useSession.getState().sync !== 'error') toast.error('toast.syncError');
    set({ sync: 'error' });
  }
}

/** Các lần gộp gần đây (để nhận ra vòng lặp xung đột liên tục và dừng gộp) */
let recentMerges: number[] = [];
let lastMergedToast = 0;

/** Thiết bị khác đã lưu trước: lấy bản trên máy chủ, giữ bản trên máy này để người dùng chọn lại */
async function resolveConflict() {
  const local: Snapshot = useBoard.getState().snapshot();
  const ep = epoch;
  const board = meta.board;
  try {
    const { revision, file } = await api.getBoard(board);
    if (!sameScope(ep, board)) return;

    // Gộp: giữ thay đổi của người dùng trên máy này, thêm thay đổi mới từ nơi khác (việc vừa kéo không bị nhảy lại)
    const parsed = file ? parseImport(file) : null;
    const now = Date.now();
    recentMerges = recentMerges.filter((x) => now - x < 60_000);
    // Gộp liên tục nhiều lần trong một phút nghĩa là có nơi khác đang lưu dồn dập: dừng gộp, lấy bản máy chủ cho yên
    const looping = recentMerges.length >= 4;
    if (looping) recentMerges = [];
    if (parsed?.ok && loadedFor === board && !looping) {
      const server: BoardSnap = { columns: parsed.data.columns, tasks: parsed.data.tasks, filters: parsed.data.filters ?? local.filters ?? [], reminders: parsed.data.reminders ?? local.reminders ?? [] };
      const merged = mergeBoards(base, snapOf(), server);
      if (merged) {
        withoutPush(() => useBoard.getState().applyImport(merged, true));
        // Chỉ báo khi bản máy chủ thật sự có thay đổi so với lần đồng bộ trước (không báo khi chỉ số revision nhảy), và không quá dày
        const hasIncoming = !base || JSON.stringify(server) !== JSON.stringify(base);
        recentMerges.push(now);
        base = server;
        own(board);
        saveMeta({ revision, dirty: true });
        localVersion++;
        set({ sync: 'pending' });
        schedule(0);
        if (hasIncoming && now - lastMergedToast > 20_000) {
          lastMergedToast = now;
          toast.info('sync.merged');
        }
        return;
      }
    }

    if (file) applyFile(file);
    own(board);
    saveMeta({ revision, dirty: false });
    set({ sync: 'saved' });
    notify({
      key: 'sync.conflict',
      actionKey: 'sync.keepLocal',
      onAction: () => {
        // Đã sang bảng khác thì bản giữ lại thuộc về bảng cũ: không được ghi vào bảng đang mở
        if (!sameScope(ep, board)) return;
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
  // Tab khác đổi bảng / đăng nhập / đăng xuất: tab này đang giữ dữ liệu của bảng cũ, tải lại để không gửi nhầm
  window.addEventListener('storage', (e) => {
    if (e.key !== META_KEY || e.storageArea !== localStorage) return;
    let m: { userId?: unknown; board?: unknown } | null = null;
    try {
      m = e.newValue ? JSON.parse(e.newValue) : null;
    } catch {
      return;
    }
    const board = m && typeof m.board === 'string' ? m.board : null;
    const userId = m && typeof m.userId === 'string' ? m.userId : null;
    if (userId === meta.userId && board === meta.board) return;
    reloadingForOtherTab = true;
    window.location.reload();
  });
  // Đóng tab: nhờ máy chủ sao lưu lần cuối (sendBeacon vẫn gửi được khi trang đang đóng)
  window.addEventListener('pagehide', () => {
    if (useSession.getState().status !== 'ready' || loadedFor !== meta.board) return;
    try {
      const body = new Blob([JSON.stringify({ ...(meta.board ? { board: meta.board } : {}), reason: 'close' })], { type: 'application/json' });
      navigator.sendBeacon('/api/backup', body);
    } catch {
      /* bỏ qua */
    }
  });
  // Chỉ khi người dùng có ý định rời đi (đóng tab, tải lại, đổi địa chỉ) mà chưa lưu lên máy chủ hoặc chưa sao lưu: chặn lại.
  // Hộp "Rời khỏi trang?" là của trình duyệt (app không đổi được chữ); cảnh báo đỏ của app hiện ngay lúc đó, thấy được khi chọn Ở lại.
  window.addEventListener('beforeunload', (e) => {
    if (reloadingForOtherTab) return;
    const { status, sync } = useSession.getState();
    if (status === 'ready' && (sync === 'saving' || sync === 'pending' || meta.dirty || unbacked)) {
      e.preventDefault();
      e.returnValue = '';
      warnNotBackedUp();
    }
  });
}

/* ---------- đăng nhập / mở app ---------- */

async function enter(user: AccountUser) {
  epoch++;
  reconcileOwner();
  const sameUser = meta.userId === user.id;
  saveMeta({ userId: user.id, email: user.email, name: user.name, ...(sameUser ? {} : { revision: 0, dirty: false, board: null }) });
  set({ user, bootError: null, board: meta.board });

  if (sameUser && meta.dirty) {
    // Còn thay đổi chưa gửi từ lần trước (mất mạng / tắt máy): gửi trước
    own(meta.board);
    set({ status: 'ready' });
    await push();
    return;
  }
  let board: { revision: number; file: ExportFile | null };
  try {
    board = await api.getBoard(meta.board);
  } catch (e) {
    // Dự án đã bị xoá hoặc mình không còn là thành viên: quay về bảng cá nhân
    if (!(e instanceof ApiError && e.status === 404 && meta.board)) throw e;
    saveMeta({ board: null, revision: 0, dirty: false });
    set({ board: null });
    resetLocal();
    board = await api.getBoard(null);
  }
  const { revision, file } = board;
  if (!sameUser) resetLocal();
  if (file) applyFile(file);
  own(meta.board);
  saveMeta({ revision, dirty: !file });
  set({ status: 'ready', sync: file ? 'saved' : 'pending' });
  // Tài khoản mới: lưu bảng trống (có các cột mặc định) lên máy chủ
  if (!file) await push();
  // Mở app: bảo đảm bản sao lưu khớp dữ liệu hiện tại (chỉ ghi nếu có thay đổi), để cảnh báo khi thoát chính xác
  setUnbacked(true);
  void runBackup();
}

export async function boot() {
  reconcileOwner();
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

/** Cập nhật thông tin người dùng đang đăng nhập (sau khi sửa hồ sơ) */
export function applyUser(user: AccountUser) {
  saveMeta({ email: user.email, name: user.name });
  set({ user });
}

export async function login(email: string, password: string) {
  const { user } = await api.login(email, password);
  await enter(user);
  useBoard.getState().setView('home');
  toast.success('toast.signedIn', { name: user.name || user.email });
}

export async function register(email: string, password: string, name: string) {
  const { user } = await api.register(email, password, name);
  await enter(user);
  useBoard.getState().setView('home');
  toast.success('toast.signedUp', { name: user.name || user.email });
}

/** Đăng xuất: gửi nốt thay đổi rồi xoá dữ liệu trên máy. Trả false nếu người dùng huỷ vì còn dữ liệu chưa lưu. */
export async function logout(confirmLoss: () => boolean | Promise<boolean>): Promise<boolean> {
  clearTimeout(timer);
  if (meta.dirty) await push();
  if (meta.dirty && !(await confirmLoss())) return false;
  try {
    await api.logout();
  } catch {
    /* vẫn đăng xuất ở máy */
  }
  epoch++;
  resetLocal();
  saveMeta({ userId: null, email: '', name: '', revision: 0, dirty: false, board: null });
  own(null);
  set({ status: 'anon', user: null, sync: 'saved', board: null });
  toast.success('toast.signedOut');
  return true;
}

/* ---------- chuyển bảng (cá nhân / dự án) ---------- */

/**
 * Mở bảng khác: gửi nốt thay đổi của bảng hiện tại, rồi tải bảng mới từ máy chủ.
 * Trả false nếu không chuyển được (mất mạng mà còn thay đổi chưa lưu và người dùng huỷ).
 */
export async function switchBoard(board: string | null, confirmLoss: () => boolean | Promise<boolean>): Promise<boolean> {
  if (board === meta.board) return true;
  clearTimeout(timer);
  // Chờ lần gửi đang dở xong rồi mới đổi bảng
  while (pushing) await new Promise((r) => setTimeout(r, 40));
  if (meta.dirty) await push();
  if (meta.dirty && !(await confirmLoss())) return false;
  const ep = ++epoch;
  set({ switching: true });
  try {
    const { revision, file } = await api.getBoard(board);
    // Có lần đổi bảng khác chen vào: bỏ kết quả này
    if (ep !== epoch) return false;
    saveMeta({ board, revision, dirty: false });
    resetLocal();
    if (file) applyFile(file);
    own(board);
    set({ board, sync: file ? 'saved' : 'pending' });
    if (!file) {
      // Bảng mới: lưu các cột mặc định lên máy chủ
      saveMeta({ dirty: true });
      await push();
    }
    setUnbacked(true);
    void runBackup();
    return true;
  } catch (e) {
    if (ep === epoch) await handlePushError(e);
    return false;
  } finally {
    if (ep === epoch) set({ switching: false });
  }
}

/** Bảng dự án có thể bị người khác sửa: định kỳ tải bản mới nếu máy này không có thay đổi chưa lưu */
async function pull() {
  const s = useSession.getState();
  if (s.status !== 'ready' || s.switching || pushing || meta.dirty) return;
  const ep = epoch;
  const board = meta.board;
  try {
    const { revision, file } = await quietly(() => api.getBoard(board));
    // Trong lúc chờ phản hồi đã đổi bảng / đang gửi / có thay đổi mới: bỏ, kẻo áp dữ liệu bảng này vào bảng kia
    if (!sameScope(ep, board) || useSession.getState().switching || pushing || meta.dirty) return;
    if (revision > meta.revision && file) {
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
