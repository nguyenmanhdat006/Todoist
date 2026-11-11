import { useEffect, useState } from 'react';

/** true khi `active` kéo dài quá `ms` mili giây (ví dụ máy chủ miễn phí đang khởi động) */
export function useSlow(active: boolean, ms = 3000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return slow;
}
