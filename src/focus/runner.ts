import { useEffect } from 'react';
import { makeT } from '../i18n';
import { useBoard } from '../store/board';
import { toast } from '../toast';
import { playAlarm } from './sound';
import { fmtClock, useFocus, type FinishEvent, type Mode } from './store';

const MODE_KEY = { focus: 'focus.mode.focus', short: 'focus.mode.short', long: 'focus.mode.long' } as const;
const baseTitle = typeof document !== 'undefined' ? document.title : '';

function announce(ev: FinishEvent) {
  const s = useFocus.getState();
  const t = makeT(useBoard.getState().lang);
  const msg = ev.finished === 'focus' ? t('focus.focusDone') : t('focus.breakDone');
  if (s.settings.alarm) playAlarm(s.settings.sound, s.settings.volume);
  toast.info(ev.finished === 'focus' ? 'focus.focusDone' : 'focus.breakDone');
  if (s.settings.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(t(MODE_KEY[ev.finished as Mode]), { body: msg, icon: '/icon.svg', tag: 'tm-focus' });
    } catch {
      /* một số trình duyệt di động không cho tạo Notification trực tiếp */
    }
  }
}

/** Một nhịp của đồng hồ: hết giờ thì kết thúc phiên và báo; còn giờ thì cập nhật tiêu đề tab */
export function tickFocus() {
  const s = useFocus.getState();
  if (s.status !== 'running') return;
  const left = s.endsAt - Date.now();
  if (left <= 0) {
    const ev = s.complete();
    if (ev) announce(ev);
    return;
  }
  const t = makeT(useBoard.getState().lang);
  document.title = `${fmtClock(left)} · ${t(MODE_KEY[s.mode])}`;
}

/** Chạy đồng hồ Pomodoro ở mọi trang: kết thúc phiên, phát chuông, đổi tiêu đề tab */
export function useFocusRunner() {
  const status = useFocus((s) => s.status);

  useEffect(() => {
    if (status !== 'running') {
      document.title = baseTitle;
      return;
    }
    const tick = tickFocus;
    tick();
    const id = setInterval(tick, 250);
    return () => {
      clearInterval(id);
      document.title = baseTitle;
    };
  }, [status]);
}
