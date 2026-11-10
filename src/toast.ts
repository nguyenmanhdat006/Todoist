import { create } from 'zustand';
import { makeT, type TKey } from './i18n';
import { useBoard } from './store/board';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Thời gian hiện (ms) */
  duration: number;
  leaving?: boolean;
}

interface ToastState {
  items: ToastItem[];
}

export const useToasts = create<ToastState>(() => ({ items: [] }));

const MAX = 4;
let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  useToasts.setState((s) => ({ items: s.items.map((x) => (x.id === id ? { ...x, leaving: true } : x)) }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((x) => x.id !== id) })), 220);
}

export interface ToastOptions {
  kind?: ToastKind;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

/** Hiện thông báo bằng chữ đã dịch sẵn */
export function showToast(message: string, o: ToastOptions = {}) {
  const kind = o.kind ?? 'success';
  const duration = o.duration ?? (o.onAction ? 6500 : kind === 'error' ? 6000 : 3800);
  // Cùng nội dung đang hiện thì không chồng thêm
  const dup = useToasts.getState().items.find((x) => !x.leaving && x.message === message && x.kind === kind);
  if (dup) dismissToast(dup.id);
  const id = ++seq;
  const item: ToastItem = {
    id,
    kind,
    message,
    duration,
    ...(o.actionLabel ? { actionLabel: o.actionLabel } : {}),
    ...(o.onAction ? { onAction: o.onAction } : {}),
  };
  useToasts.setState((s) => ({ items: [...s.items, item].slice(-MAX) }));
  timers.set(id, setTimeout(() => dismissToast(id), duration));
  return id;
}

const tr = () => makeT(useBoard.getState().lang);

export const toast = {
  success: (key: TKey, vars?: Record<string, string | number>, o?: ToastOptions) => showToast(tr()(key, vars), { ...o, kind: 'success' }),
  error: (key: TKey, vars?: Record<string, string | number>, o?: ToastOptions) => showToast(tr()(key, vars), { ...o, kind: 'error' }),
  info: (key: TKey, vars?: Record<string, string | number>, o?: ToastOptions) => showToast(tr()(key, vars), { ...o, kind: 'info' }),
};
