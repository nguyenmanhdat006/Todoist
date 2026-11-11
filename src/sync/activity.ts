import { create } from 'zustand';

/** Số yêu cầu mạng đang chạy (không tính việc chạy nền như tự lưu, làm mới định kỳ) */
export const useActivity = create<{ pending: number }>(() => ({ pending: 0 }));

let quietDepth = 0;

/** Chạy việc nền: không hiện thanh tiến trình */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  quietDepth++;
  try {
    return await fn();
  } finally {
    quietDepth--;
  }
}

export function trackStart(): () => void {
  if (quietDepth > 0) return () => {};
  useActivity.setState((s) => ({ pending: s.pending + 1 }));
  let done = false;
  return () => {
    if (done) return;
    done = true;
    useActivity.setState((s) => ({ pending: Math.max(0, s.pending - 1) }));
  };
}
