import { create } from 'zustand';

export interface ConfirmOptions {
  message: string;
  title?: string;
  /** Chữ trên nút đồng ý */
  confirmLabel?: string;
  /** Hành động nguy hiểm (xoá, khoá...): nút đồng ý màu đỏ, nút Huỷ được chọn sẵn */
  danger?: boolean;
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

export const useConfirm = create<ConfirmState>(() => ({ current: null }));

/** Hỏi xác nhận bằng hộp thoại của app (thay cho window.confirm). Trả true nếu người dùng đồng ý. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  // Đang có hộp hỏi khác thì coi như huỷ hộp cũ
  useConfirm.getState().current?.resolve(false);
  return new Promise<boolean>((resolve) => {
    useConfirm.setState({ current: { ...options, resolve } });
  });
}

export function answerConfirm(ok: boolean) {
  const c = useConfirm.getState().current;
  if (!c) return;
  useConfirm.setState({ current: null });
  c.resolve(ok);
}
