import { create } from 'zustand';
import { todayISO } from '../utils';

/** Trạng thái giao diện dùng chung giữa các phần (không lưu lại khi tải trang) */
interface UiState {
  /** Ngày đang xem trên trang Lịch */
  calAnchor: string;
  setCalAnchor: (v: string | ((prev: string) => string)) => void;
}

export const useUi = create<UiState>((set) => ({
  calAnchor: todayISO(),
  setCalAnchor: (v) => set((s) => ({ calAnchor: typeof v === 'function' ? v(s.calAnchor) : v })),
}));
