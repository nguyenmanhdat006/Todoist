/** Pomodoro: đồng hồ, nhật ký tập trung, thử thách ngày. Lưu trên máy (localStorage). */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from '../toast';
import { todayISO } from '../utils';

export type Mode = 'focus' | 'short' | 'long';
export type Status = 'idle' | 'running' | 'paused';
export type AlarmSound = 'chime' | 'bell' | 'digital' | 'soft' | 'piano';
export type Effect = 'off' | 'motes' | 'stars' | 'rain' | 'bubbles' | 'snow';
export type Scene = 'fantasy' | 'aurora' | 'pastel' | 'lofi' | 'cyber';

/** Màu theo chế độ: tập trung dùng màu nhấn của người dùng, nghỉ ngắn xanh lá nhạt, nghỉ dài xanh lá đậm */
export const BREAK_COLORS = { short: '#4ade80', long: '#22a35a' } as const;

export const ACCENTS = ['#60a5fa', '#a78bfa', '#2dd4bf', '#a3e635', '#fb7185', '#fbbf24'] as const;

export interface FocusSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Sau bao nhiêu phiên tập trung thì nghỉ dài */
  longEvery: number;
  autoBreaks: boolean;
  autoFocus: boolean;
  alarm: boolean;
  sound: AlarmSound;
  volume: number;
  desktop: boolean;
  style: 'ring' | 'numbers';
  scene: Scene;
  accent: string;
  effect: Effect;
}

export const DEFAULT_SETTINGS: FocusSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoBreaks: false,
  autoFocus: false,
  alarm: true,
  sound: 'soft',
  volume: 0.8,
  desktop: false,
  style: 'ring',
  scene: 'fantasy',
  accent: ACCENTS[1],
  effect: 'off',
};

export interface FocusTask {
  /** boardId:taskId */
  key: string;
  id: string;
  boardId: string;
  title: string;
}

export interface DayLog {
  ms: number;
  sessions: number;
}

export interface Challenge {
  goalMin: number;
  done: boolean;
}

/** Sự kiện khi một phiên kết thúc (để nơi gọi phát chuông, báo...) */
export interface FinishEvent {
  finished: Mode;
  next: Mode;
  autoStarted: boolean;
}

interface FocusState {
  settings: FocusSettings;
  mode: Mode;
  status: Status;
  /** ms còn lại khi không chạy */
  remaining: number;
  /** thời điểm kết thúc khi đang chạy */
  endsAt: number;
  counts: Record<Mode, number>;
  task: FocusTask | null;
  days: Record<string, DayLog>;
  taskMs: Record<string, { ms: number; title: string }>;
  challenges: Record<string, Challenge>;
  links: string[];
  /** Tiêu đề video/bài lấy qua oEmbed, theo liên kết */
  linkTitles: Record<string, string>;

  durationOf: (m: Mode, s?: FocusSettings) => number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => FinishEvent | null;
  complete: () => FinishEvent | null;
  setMode: (m: Mode) => void;
  setSettings: (patch: Partial<FocusSettings>) => void;
  selectTask: (t: FocusTask | null) => void;
  acceptChallenge: (goalMin: number) => void;
  resetCounters: () => void;
  addLink: (url: string) => void;
  removeLink: (url: string) => void;
  setLinkTitle: (url: string, title: string) => void;
}

const minutes = (n: number) => n * 60_000;

function logFocus(state: FocusState, ms: number, sessions: number) {
  const day = todayISO();
  const prev = state.days[day] ?? { ms: 0, sessions: 0 };
  const days = { ...state.days, [day]: { ms: prev.ms + ms, sessions: prev.sessions + sessions } };
  let taskMs = state.taskMs;
  if (state.task && ms > 0) {
    const t = taskMs[state.task.key];
    taskMs = { ...taskMs, [state.task.key]: { ms: (t?.ms ?? 0) + ms, title: state.task.title } };
  }
  // Thử thách hôm nay đạt mục tiêu
  let challenges = state.challenges;
  const ch = challenges[day];
  if (ch && !ch.done && days[day].ms >= minutes(ch.goalMin)) {
    challenges = { ...challenges, [day]: { ...ch, done: true } };
    queueMicrotask(() => toast.success('focus.ch.done'));
  }
  return { days, taskMs, challenges };
}

export const useFocus = create<FocusState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      mode: 'focus',
      status: 'idle',
      remaining: minutes(DEFAULT_SETTINGS.focusMin),
      endsAt: 0,
      counts: { focus: 0, short: 0, long: 0 },
      task: null,
      days: {},
      taskMs: {},
      challenges: {},
      links: [],
      linkTitles: {},

      durationOf: (m, s = get().settings) => minutes(m === 'focus' ? s.focusMin : m === 'short' ? s.shortMin : s.longMin),

      start: () => {
        const s = get();
        if (s.status === 'running') return;
        set({ status: 'running', endsAt: Date.now() + s.remaining });
      },

      pause: () => {
        const s = get();
        if (s.status !== 'running') return;
        set({ status: 'paused', remaining: Math.max(0, s.endsAt - Date.now()) });
      },

      /** Dừng và đặt lại phiên hiện tại; thời gian tập trung đã qua (từ 1 phút) vẫn được ghi */
      reset: () => {
        const s = get();
        const total = s.durationOf(s.mode);
        const left = s.status === 'running' ? Math.max(0, s.endsAt - Date.now()) : s.remaining;
        const elapsed = total - left;
        const logged = s.mode === 'focus' && s.status !== 'idle' && elapsed >= 60_000 ? logFocus(s, elapsed, 0) : {};
        set({ ...logged, status: 'idle', remaining: total });
      },

      skip: () => {
        const s = get();
        const total = s.durationOf(s.mode);
        const left = s.status === 'running' ? Math.max(0, s.endsAt - Date.now()) : s.remaining;
        const elapsed = total - left;
        const logged = s.mode === 'focus' && s.status !== 'idle' && elapsed >= 60_000 ? logFocus(s, elapsed, 0) : {};
        set(logged);
        return advance(false);
      },

      complete: () => {
        const s = get();
        if (s.status !== 'running') return null;
        const logged = s.mode === 'focus' ? logFocus(s, s.durationOf('focus'), 1) : {};
        set(logged);
        return advance(true);
      },

      setMode: (m) => {
        const s = get();
        if (s.status === 'running' || s.mode === m) return;
        set({ mode: m, status: 'idle', remaining: s.durationOf(m) });
      },

      setSettings: (patch) => {
        const s = get();
        const settings = { ...s.settings, ...patch };
        // Đổi độ dài phiên (khi chưa chạy) thì áp ngay vào đồng hồ
        set({ settings, ...(s.status === 'idle' ? { remaining: s.durationOf(s.mode, settings) } : {}) });
      },

      selectTask: (task) => set({ task }),

      acceptChallenge: (goalMin) => {
        const day = todayISO();
        const s = get();
        const done = (s.days[day]?.ms ?? 0) >= minutes(goalMin);
        set({ challenges: { ...s.challenges, [day]: { goalMin, done } } });
      },

      resetCounters: () => set({ counts: { focus: 0, short: 0, long: 0 } }),

      addLink: (url) => set((s) => (s.links.includes(url) ? s : { links: [url, ...s.links].slice(0, 12) })),
      removeLink: (url) => set((s) => ({ links: s.links.filter((x) => x !== url) })),
      setLinkTitle: (url, title) => set((s) => (s.linkTitles[url] === title ? s : { linkTitles: { ...s.linkTitles, [url]: title } })),
    }),
    {
      name: 'tm-focus',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        settings: s.settings,
        mode: s.mode,
        status: s.status === 'running' ? 'paused' : s.status,
        remaining: s.status === 'running' ? Math.max(0, s.endsAt - Date.now()) : s.remaining,
        counts: s.counts,
        task: s.task,
        days: s.days,
        taskMs: s.taskMs,
        challenges: s.challenges,
        links: s.links,
        linkTitles: s.linkTitles,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FocusState>;
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
      },
    },
  ),
);

/** Sang phiên kế tiếp. `finished`: hết giờ tự nhiên (khác với bấm Bỏ qua) */
function advance(finished: boolean): FinishEvent {
  const s = useFocus.getState();
  const prev = s.mode;
  const counts = { ...s.counts, [prev]: s.counts[prev] + 1 };
  const next: Mode = prev === 'focus' ? (counts.focus % Math.max(1, s.settings.longEvery) === 0 ? 'long' : 'short') : 'focus';
  const auto = finished && (next === 'focus' ? s.settings.autoFocus : s.settings.autoBreaks);
  const remaining = s.durationOf(next);
  useFocus.setState({
    counts,
    mode: next,
    remaining,
    status: auto ? 'running' : 'idle',
    endsAt: auto ? Date.now() + remaining : 0,
  });
  return { finished: prev, next, autoStarted: auto };
}

/* ---------- thống kê ---------- */

/** Một ngày được tính vào chuỗi: có ít nhất 1 phiên hoặc 15 phút tập trung */
export const keepsStreak = (d?: DayLog) => !!d && (d.sessions >= 1 || d.ms >= minutes(15));

function shift(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function streaks(days: Record<string, DayLog>) {
  const today = todayISO();
  // Chuỗi hiện tại: tính lùi từ hôm nay (hôm nay chưa tập thì bắt đầu từ hôm qua)
  let cur = 0;
  let d = keepsStreak(days[today]) ? today : shift(today, -1);
  while (keepsStreak(days[d])) {
    cur++;
    d = shift(d, -1);
  }
  const keys = Object.keys(days).filter((k) => keepsStreak(days[k])).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of keys) {
    run = prev && shift(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return { current: cur, best };
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function fmtMinutes(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}`;
}
