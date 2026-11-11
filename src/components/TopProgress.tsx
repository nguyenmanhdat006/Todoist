import { useEffect, useState } from 'react';
import { useActivity } from '../sync/activity';

/** Thanh mảnh trên cùng: hiện khi có yêu cầu mạng chạy quá ~0,25 giây, chạy dần rồi chạy nốt khi xong */
export function TopProgress() {
  const pending = useActivity((s) => s.pending);
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle');

  useEffect(() => {
    if (pending > 0) {
      const id = setTimeout(() => setPhase('run'), 250);
      return () => clearTimeout(id);
    }
    if (phase !== 'run') {
      setPhase('idle');
      return;
    }
    setPhase('done');
    const id = setTimeout(() => setPhase('idle'), 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (phase === 'idle') return null;
  return <div className={`top-progress is-${phase}`} role="progressbar" aria-hidden="true" />;
}
