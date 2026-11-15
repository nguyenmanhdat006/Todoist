import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT, type T, type TKey } from '../i18n';
import { useBoard } from '../store/board';
import { useAllEntries } from '../sync/overview';
import { toast } from '../toast';
import { fold, ticketLabel, todayISO } from '../utils';
import { Effects } from './Effects';
import {
  ACCENTS,
  fmtClock,
  fmtMinutes,
  keepsStreak,
  streaks,
  useFocus,
  type AlarmSound,
  type Effect,
  type Mode,
  type Scene,
} from './store';
import { playAlarm, playNoise, playingNoise, setNoiseVolume, stopNoise, unlockAudio, type Noise } from './sound';
import './focus.css';

type PanelId = 'challenge' | 'stats' | 'look' | 'settings' | 'music' | 'tasks';

const MODES: Mode[] = ['focus', 'short', 'long'];
const SCENES: Scene[] = ['fantasy', 'pastel', 'lofi', 'cyber', 'aurora'];
const EFFECTS: Effect[] = ['off', 'motes', 'stars', 'rain', 'bubbles', 'snow'];
const SOUNDS: AlarmSound[] = ['chime', 'bell', 'digital', 'soft', 'piano'];

const QUOTES: Record<'vi' | 'en', string[]> = {
  vi: [
    'Động lực giúp bạn bắt đầu, thói quen giúp bạn đi tiếp.',
    'Mỗi phiên tập trung là một viên gạch cho việc lớn.',
    'Làm từng việc một, và làm cho trọn vẹn.',
    'Bắt đầu nhỏ, đều đặn, rồi bạn sẽ ngạc nhiên về quãng đường đã đi.',
    'Tập trung không phải là làm nhiều hơn, mà là làm đúng việc.',
    'Hôm nay chỉ cần 25 phút trọn vẹn.',
  ],
  en: [
    'Motivation gets you going, but habit keeps you going.',
    'Every focus session is one brick toward something big.',
    'Do one thing at a time, and do it fully.',
    'Start small, stay steady, and be surprised by how far you have come.',
    'Focus is not doing more. It is doing the right thing.',
    'Today, just 25 whole minutes.',
  ],
};

/** Đồng hồ cập nhật mượt khi đang chạy */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const Icon = ({ children, size = 18, fill = 'none' }: { children: ReactNode; size?: number; fill?: string }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill={fill} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export function FocusPage() {
  const t = useT();
  const setView = useBoard((s) => s.setView);
  const lang = useBoard((s) => s.lang);
  const s = useFocus();
  const [panel, setPanel] = useState<PanelId | null>(null);
  const running = s.status === 'running';
  const now = useNow(running);
  const left = running ? Math.max(0, s.endsAt - now) : s.remaining;
  const total = s.durationOf(s.mode);
  const progress = total ? 1 - left / total : 0;
  const quote = QUOTES[lang][new Date().getDate() % QUOTES[lang].length];
  const today = s.days[todayISO()];
  const st = useMemo(() => streaks(s.days), [s.days]);
  const ch = s.challenges[todayISO()];
  const toggle = (p: PanelId) => setPanel((cur) => (cur === p ? null : p));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (panel) setPanel(null);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === ' ' && !panel) {
        e.preventDefault();
        unlockAudio();
        const f = useFocus.getState();
        if (f.status === 'running') f.pause();
        else f.start();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);

  const onStart = () => {
    unlockAudio();
    if (running) s.pause();
    else s.start();
  };

  const startLabel = running ? t('focus.pause') : s.status === 'paused' ? t('focus.resume') : t('focus.start');
  const modeLabel = t(`focus.session.${s.mode}` as TKey);
  const mm = fmtClock(left);

  return createPortal(
    <div className={`fp scene-${s.settings.scene}`} style={{ ['--fa' as string]: s.settings.accent }} role="main" aria-label={t('focus.title')}>
      <div className="fp-scene" aria-hidden="true" />
      <Effects kind={s.settings.effect} color={s.settings.accent} />

      <header className="fp-top">
        <button type="button" className="fp-back" onClick={() => setView('kanban')}>
          <Icon size={16}>
            <path d="M12 4l-6 6 6 6" />
          </Icon>
          {t('focus.back')}
        </button>
        <span className="fp-brand">{t('focus.title')}</span>
      </header>

      <nav className="fp-rail" aria-label={t('focus.title')}>
        <button type="button" className={panel === 'challenge' ? 'on' : ''} onClick={() => toggle('challenge')} title={t('focus.rail.challenge')} aria-label={t('focus.rail.challenge')}>
          <Icon>
            <path d="M6 3.5h8v3.2a4 4 0 01-8 0zM6 5H3.5c0 2 1 3.2 2.7 3.6M14 5h2.5c0 2-1 3.2-2.7 3.6M10 10.7V14M7 16.5h6M8 14h4" />
          </Icon>
          {ch?.done && <i className="fp-dot ok" />}
        </button>
        <button type="button" className={`fp-streak${panel === 'stats' ? ' on' : ''}`} onClick={() => toggle('stats')} title={t('focus.rail.stats')} aria-label={t('focus.rail.stats')}>
          <Icon>
            <path d="M10 17c3 0 5-2 5-4.6 0-2.2-1.4-3.2-2.4-5C11.8 5.8 11.6 4.2 11 3c-.6 2.4-3.6 3.7-4.6 6.2C5.4 11.7 5 12.5 5 13.2 5 15.3 6.8 17 10 17z" />
          </Icon>
          <span>{st.current}</span>
        </button>
        <hr />
        <button type="button" className={panel === 'look' ? 'on' : ''} onClick={() => toggle('look')} title={t('focus.rail.look')} aria-label={t('focus.rail.look')}>
          <Icon>
            <path d="M10 3a7 7 0 100 14c1.2 0 1.7-.8 1.4-1.7-.3-1 .3-1.8 1.3-1.8H14a3 3 0 003-3c0-4-3.1-7.5-7-7.5zM6.5 9.5h.01M9 6.7h.01M12.5 7.2h.01" />
          </Icon>
        </button>
        <button type="button" className={panel === 'settings' ? 'on' : ''} onClick={() => toggle('settings')} title={t('focus.rail.settings')} aria-label={t('focus.rail.settings')}>
          <Icon>
            <circle cx="10" cy="10" r="2.4" />
            <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
          </Icon>
        </button>
      </nav>

      <section className="fp-center">
        <div className="fp-tabs" role="tablist">
          {MODES.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={s.mode === m} className={s.mode === m ? 'on' : ''} disabled={running && s.mode !== m} onClick={() => s.setMode(m)}>
              {t(`focus.mode.${m}` as TKey)}
              <b>{s.counts[m]}</b>
            </button>
          ))}
        </div>

        <button type="button" className={`fp-task${s.task ? ' has' : ''}`} onClick={() => setPanel('tasks')}>
          {s.task ? (
            <>
              <small>{t('focus.task.on')}</small>
              <strong>{s.task.title}</strong>
            </>
          ) : (
            <>
              <Icon size={15}>
                <path d="M4 5.5h12M4 10h12M4 14.5h7" />
              </Icon>
              {t('focus.task.pick')}
            </>
          )}
        </button>

        <div className={`fp-timer style-${s.settings.style}${running ? ' is-running' : ''}`} aria-live="off">
          {s.settings.style === 'ring' && (
            <svg className="fp-ring" viewBox="0 0 200 200" aria-hidden="true">
              <circle className="track" cx="100" cy="100" r="92" />
              <circle className="bar" cx="100" cy="100" r="92" pathLength={100} strokeDasharray={100} strokeDashoffset={100 - progress * 100} />
            </svg>
          )}
          <div className="fp-time" role="timer" aria-label={`${modeLabel} ${mm}`}>
            <span>{mm.slice(0, 2)}</span>
            <i>:</i>
            <span>{mm.slice(3)}</span>
          </div>
          <div className="fp-pill">
            <i />
            {modeLabel}
          </div>
        </div>

        {ch && (
          <button type="button" className="fp-goal" onClick={() => setPanel('challenge')} title={t('focus.rail.challenge')}>
            <span className="fp-goal-bar">
              <i style={{ width: `${Math.min(100, ((today?.ms ?? 0) / (ch.goalMin * 60_000)) * 100)}%` }} />
            </span>
            <span>{ch.done ? t('focus.ch.completedBadge') : t('focus.ch.progress', { done: fmtMinutes(today?.ms ?? 0), goal: fmtMinutes(ch.goalMin * 60_000) })}</span>
          </button>
        )}

        <p className="fp-quote">“{quote}”</p>
      </section>

      <footer className="fp-dock">
        <button type="button" className={`fp-dock-btn${panel === 'music' ? ' on' : ''}`} onClick={() => toggle('music')}>
          <Icon>
            <path d="M8 14.5V5l8-1.7v9.2M8 14.5a2 2 0 11-4 0 2 2 0 014 0zM16 12.5a2 2 0 11-4 0 2 2 0 014 0z" />
          </Icon>
          {t('focus.music')}
        </button>
        <button type="button" className="fp-dock-btn icon" onClick={s.reset} disabled={s.status === 'idle'} title={t('focus.reset')} aria-label={t('focus.reset')}>
          <Icon>
            <rect x="5" y="5" width="10" height="10" rx="1.5" />
          </Icon>
        </button>
        <button type="button" className="fp-start" onClick={onStart}>
          {startLabel}
        </button>
        <button
          type="button"
          className="fp-dock-btn icon"
          onClick={() => {
            const ev = s.skip();
            if (ev) toast.info(`focus.session.${ev.next}` as TKey);
          }}
          title={t('focus.skip')}
          aria-label={t('focus.skip')}
        >
          <Icon>
            <path d="M5 4.5l7 5.5-7 5.5zM15 4.5v11" />
          </Icon>
        </button>
        <button type="button" className={`fp-dock-btn${panel === 'tasks' ? ' on' : ''}`} onClick={() => toggle('tasks')}>
          <Icon>
            <path d="M3.5 5.5l1.5 1.5 2.5-3M3.5 12l1.5 1.5 2.5-3M10.5 6h6M10.5 12.5h6" />
          </Icon>
          {t('focus.tasks')}
        </button>
      </footer>

      {panel === 'challenge' && <ChallengePanel t={t} onClose={() => setPanel(null)} />}
      {panel === 'stats' && <StatsPanel t={t} onClose={() => setPanel(null)} />}
      {panel === 'look' && <LookPanel t={t} onClose={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel t={t} onClose={() => setPanel(null)} />}
      {panel === 'tasks' && <TasksPanel t={t} onClose={() => setPanel(null)} />}
      <MusicPanel t={t} open={panel === 'music'} onClose={() => setPanel(null)} />
    </div>,
    document.body,
  );
}

/* ---------- khung chung ---------- */

function Panel({ title, onClose, side = 'left', compact = false, children, t }: { title: string; onClose: () => void; side?: 'left' | 'right'; compact?: boolean; children: ReactNode; t: T }) {
  return (
    <aside className={`fp-panel side-${side}${compact ? ' compact' : ''}`} role="dialog" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" className="fp-x" onClick={onClose} aria-label={t('focus.close')}>
          ✕
        </button>
      </header>
      <div className="fp-panel-body">{children}</div>
    </aside>
  );
}

function Stepper({ value, label, onDec, onInc, pad = false, disabled = false }: { value: number; label: string; onDec: () => void; onInc: () => void; pad?: boolean; disabled?: boolean }) {
  return (
    <div className={`fp-step${disabled ? ' is-locked' : ''}`}>
      <button type="button" onClick={onDec} disabled={disabled} aria-label={`− ${label}`}>
        −
      </button>
      <div>
        <b>{pad ? String(value).padStart(2, '0') : value}</b>
        <small>{label}</small>
      </div>
      <button type="button" onClick={onInc} disabled={disabled} aria-label={`+ ${label}`}>
        +
      </button>
    </div>
  );
}

/* ---------- thử thách ---------- */

function ChallengePanel({ t, onClose }: { t: T; onClose: () => void }) {
  const ch = useFocus((s) => s.challenges[todayISO()]);
  const accept = useFocus((s) => s.acceptChallenge);
  const [total, setTotal] = useState(ch?.goalMin ?? 120);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const set = (v: number) => setTotal(Math.max(5, Math.min(12 * 60, v)));
  const day = new Intl.DateTimeFormat(t.locale, { weekday: 'long' }).format(new Date());
  return (
    <Panel title={t('focus.ch.title')} onClose={onClose} compact t={t}>
      <p className="fp-lead">
        {t('focus.ch.lead')} <small>({day})</small>
      </p>
      <div className="fp-steps">
        <Stepper value={h} label={t('focus.ch.hours')} onDec={() => set(total - 60)} onInc={() => set(total + 60)} />
        <Stepper value={m} label={t('focus.ch.minutes')} pad onDec={() => set(total - 5)} onInc={() => set(total + 5)} />
      </div>
      <p className="fp-note">{t('focus.ch.note')}</p>
      <button
        type="button"
        className="fp-cta"
        onClick={() => {
          accept(total);
          toast.success('focus.ch.accepted', { goal: fmtMinutes(total * 60_000) });
          onClose();
        }}
      >
        {ch ? t('focus.ch.update') : t('focus.ch.accept')}
      </button>
    </Panel>
  );
}

/* ---------- thống kê ---------- */

function StatsPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const days = useFocus((s) => s.days);
  const challenges = useFocus((s) => s.challenges);
  const taskMs = useFocus((s) => s.taskMs);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const st = useMemo(() => streaks(days), [days]);
  const prefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-`;
  const dim = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7;
  const monthMs = Object.entries(days).reduce((a, [k, v]) => (k.startsWith(prefix) ? a + v.ms : a), 0);
  const chs = Object.entries(challenges).filter(([k]) => k.startsWith(prefix));
  const today = todayISO();
  const label = new Intl.DateTimeFormat(t.locale, { month: 'long', year: 'numeric' }).format(new Date(cursor.y, cursor.m, 1));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(t.locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
  const shift = (n: number) => setCursor((c) => ({ y: c.y + Math.floor((c.m + n) / 12), m: (((c.m + n) % 12) + 12) % 12 }));
  const top = Object.values(taskMs).sort((a, b) => b.ms - a.ms).slice(0, 4);
  const max = Math.max(1, ...Object.entries(days).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v.ms));
  const n = (v: number) => t('focus.stats.days', { n: v });
  return (
    <Panel title={t('focus.stats.title')} onClose={onClose} t={t}>
      <div className="fp-month">
        <button type="button" onClick={() => shift(-1)} aria-label="‹">
          ‹
        </button>
        <strong>{label}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="›">
          ›
        </button>
      </div>
      <p className="fp-total">
        <b>{fmtMinutes(monthMs)}</b> <small>{t('focus.stats.total')}</small>
      </p>
      <div className="fp-cal">
        {weekdays.map((w) => (
          <span key={w} className="wd">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const key = prefix + String(i + 1).padStart(2, '0');
          const d = days[key];
          const isToday = key === today;
          return (
            <div key={key} className={`day${isToday ? ' today' : ''}${keepsStreak(d) ? ' hit' : ''}`} title={d ? fmtMinutes(d.ms) : ''}>
              <span>{isToday ? t('focus.stats.today') : i + 1}</span>
              <em>{d && d.ms >= 30_000 ? fmtMinutes(d.ms) : '–'}</em>
              <i style={{ width: `${d ? Math.max(6, (d.ms / max) * 100) : 0}%` }} />
            </div>
          );
        })}
      </div>
      <div className="fp-sums">
        <div>
          <small>{t('focus.stats.streak')}</small>
          <b>🔥 {n(st.current)}</b>
        </div>
        <div>
          <small>{t('focus.stats.best')}</small>
          <b>{n(st.best)}</b>
        </div>
        <div>
          <small>{t('focus.stats.challenges')}</small>
          <b>
            {chs.length} <em>{t('focus.stats.accepted')}</em> {chs.filter(([, c]) => c.done).length} <em>{t('focus.stats.completed')}</em>
          </b>
        </div>
      </div>
      {top.length > 0 && (
        <div className="fp-top-tasks">
          <small>{t('focus.stats.topTasks')}</small>
          {top.map((x, i) => (
            <div key={i}>
              <span>{x.title}</span>
              <b>{fmtMinutes(x.ms)}</b>
            </div>
          ))}
        </div>
      )}
      <p className="fp-note">{t('focus.stats.hint')}</p>
    </Panel>
  );
}

/* ---------- giao diện ---------- */

function LookPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const settings = useFocus((s) => s.settings);
  const set = useFocus((s) => s.setSettings);
  return (
    <Panel title={t('focus.look.title')} onClose={onClose} t={t}>
      <h3>{t('focus.look.timer')}</h3>
      <div className="fp-grid2">
        {(['ring', 'numbers'] as const).map((k) => (
          <button key={k} type="button" className={`fp-card${settings.style === k ? ' on' : ''}`} onClick={() => set({ style: k })}>
            <span className={`fp-card-pre style-${k}`}>
              <i>25:00</i>
            </span>
            <span className="fp-card-name">{t(k === 'ring' ? 'focus.look.ring' : 'focus.look.numbers')}</span>
          </button>
        ))}
      </div>
      <h3>{t('focus.look.bg')}</h3>
      <div className="fp-grid2">
        {SCENES.map((k) => (
          <button key={k} type="button" className={`fp-card${settings.scene === k ? ' on' : ''}`} onClick={() => set({ scene: k })}>
            <span className={`fp-card-pre scene-${k}`}>
              <span className="fp-scene" />
            </span>
            <span className="fp-card-name">{t(`focus.scene.${k}` as TKey)}</span>
          </button>
        ))}
      </div>
      <h3>{t('focus.look.accent')}</h3>
      <div className="fp-accents">
        {ACCENTS.map((c) => (
          <button key={c} type="button" className={settings.accent === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ accent: c })} aria-label={c} aria-pressed={settings.accent === c} />
        ))}
      </div>
      <h3>{t('focus.look.effect')}</h3>
      <div className="fp-chips">
        {EFFECTS.map((k) => (
          <button key={k} type="button" className={settings.effect === k ? 'on' : ''} onClick={() => set({ effect: k })}>
            {settings.effect === k && '✓ '}
            {t(`focus.fx.${k}` as TKey)}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/* ---------- cài đặt ---------- */

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`fp-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function SettingsPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const settings = useFocus((s) => s.settings);
  const status = useFocus((s) => s.status);
  const set = useFocus((s) => s.setSettings);
  const resetCounters = useFocus((s) => s.resetCounters);
  const lang = useBoard((s) => s.lang);
  const setLang = useBoard((s) => s.setLang);
  const locked = status !== 'idle';
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  const toggleDesktop = async (v: boolean) => {
    if (!v) return set({ desktop: false });
    if (typeof Notification === 'undefined') return;
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    set({ desktop: p === 'granted' });
  };

  return (
    <Panel title={t('focus.set.title')} onClose={onClose} t={t}>
      <div className="fp-row">
        <span>{t('focus.set.language')}</span>
        <div className="fp-chips tight">
          {(['vi', 'en'] as const).map((l) => (
            <button key={l} type="button" className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l === 'vi' ? 'Tiếng Việt' : 'English'}
            </button>
          ))}
        </div>
      </div>
      <h3>{t('focus.set.lengths')}</h3>
      <div className="fp-steps three">
        <Stepper value={settings.focusMin} label={`${t('focus.mode.focus')} · ${t('focus.set.min')}`} disabled={locked} onDec={() => set({ focusMin: clamp(settings.focusMin - 5, 5, 120) })} onInc={() => set({ focusMin: clamp(settings.focusMin + 5, 5, 120) })} />
        <Stepper value={settings.shortMin} label={`${t('focus.mode.short')} · ${t('focus.set.min')}`} disabled={locked} onDec={() => set({ shortMin: clamp(settings.shortMin - 1, 1, 30) })} onInc={() => set({ shortMin: clamp(settings.shortMin + 1, 1, 30) })} />
        <Stepper value={settings.longMin} label={`${t('focus.mode.long')} · ${t('focus.set.min')}`} disabled={locked} onDec={() => set({ longMin: clamp(settings.longMin - 5, 5, 60) })} onInc={() => set({ longMin: clamp(settings.longMin + 5, 5, 60) })} />
      </div>
      {locked && <p className="fp-note lock">🔒 {t('focus.set.locked')}</p>}
      <div className="fp-row">
        <span>
          {t('focus.set.longEvery')} <b>{settings.longEvery}</b> {t('focus.set.sessions')}
        </span>
        <div className="fp-mini">
          <button type="button" onClick={() => set({ longEvery: clamp(settings.longEvery - 1, 2, 8) })} aria-label="−">
            −
          </button>
          <button type="button" onClick={() => set({ longEvery: clamp(settings.longEvery + 1, 2, 8) })} aria-label="+">
            +
          </button>
        </div>
      </div>
      <button type="button" className="fp-ghost" onClick={resetCounters}>
        ↺ {t('focus.set.resetCounters')}
      </button>

      <h3>{t('focus.set.auto')}</h3>
      <div className="fp-row">
        <span>{t('focus.set.autoBreaks')}</span>
        <Toggle on={settings.autoBreaks} onChange={(v) => set({ autoBreaks: v })} label={t('focus.set.autoBreaks')} />
      </div>
      <div className="fp-row">
        <span>{t('focus.set.autoFocus')}</span>
        <Toggle on={settings.autoFocus} onChange={(v) => set({ autoFocus: v })} label={t('focus.set.autoFocus')} />
      </div>

      <div className="fp-row sep">
        <span>{t('focus.set.alarm')}</span>
        <Toggle on={settings.alarm} onChange={(v) => set({ alarm: v })} label={t('focus.set.alarm')} />
      </div>
      <div className="fp-chips">
        {SOUNDS.map((k) => (
          <button
            key={k}
            type="button"
            className={settings.sound === k ? 'on' : ''}
            onClick={() => {
              set({ sound: k });
              playAlarm(k, settings.volume);
            }}
          >
            {settings.sound === k && '✓ '}
            {t(`focus.sound.${k}` as TKey)}
          </button>
        ))}
      </div>
      <div className="fp-row">
        <span>{t('focus.set.volume')}</span>
        <label className="fp-range">
          <input type="range" min={0} max={100} value={Math.round(settings.volume * 100)} onChange={(e) => set({ volume: Number(e.target.value) / 100 })} onMouseUp={() => playAlarm(settings.sound, settings.volume)} />
          <em>{Math.round(settings.volume * 100)}%</em>
        </label>
      </div>
      <div className="fp-row sep">
        <span>{t('focus.set.desktop')}</span>
        <Toggle on={settings.desktop && perm === 'granted'} onChange={(v) => void toggleDesktop(v)} label={t('focus.set.desktop')} />
      </div>
      {perm === 'denied' && <p className="fp-note">{t('focus.set.desktopBlocked')}</p>}
    </Panel>
  );
}

/* ---------- chọn việc ---------- */

function TasksPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const entries = useAllEntries();
  const task = useFocus((s) => s.task);
  const select = useFocus((s) => s.selectTask);
  const taskMs = useFocus((s) => s.taskMs);
  const [q, setQ] = useState('');
  const open = useMemo(() => entries.filter((e) => !e.col.isDone), [entries]);
  const list = useMemo(() => {
    const f = fold(q.trim());
    return f ? open.filter((e) => fold(`${e.task.title} ${e.projectName} ${e.boardName}`).includes(f)) : open;
  }, [open, q]);
  return (
    <Panel title={t('focus.task.listTitle')} onClose={onClose} side="right" t={t}>
      <input className="fp-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('focus.task.search')} autoFocus />
      <div className="fp-tasks">
        <button
          type="button"
          className={`fp-trow free${!task ? ' on' : ''}`}
          onClick={() => {
            select(null);
            onClose();
          }}
        >
          <span>{t('focus.task.none')}</span>
        </button>
        {list.length === 0 && <p className="fp-note">{open.length === 0 ? t('focus.task.empty') : t('focus.task.noMatch')}</p>}
        {list.map((e) => {
          const spent = taskMs[e.key]?.ms ?? 0;
          const code = ticketLabel(e.task, e.projectKey);
          return (
            <button
              key={e.key}
              type="button"
              className={`fp-trow${task?.key === e.key ? ' on' : ''}`}
              onClick={() => {
                select({ key: e.key, id: e.task.id, boardId: e.boardId, title: e.task.title });
                toast.info('focus.task.picked', { title: e.task.title });
                onClose();
              }}
            >
              <span className="fp-trow-main">
                {code && <em>{code}</em>}
                {e.task.title}
              </span>
              <small>
                {[e.projectName, e.boardName, e.col.title].filter(Boolean).join(' · ')}
                {spent >= 60_000 && ` · ${t('focus.task.spent', { time: fmtMinutes(spent) })}`}
              </small>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------- nhạc ---------- */

function embedOf(url: string): { src: string; kind: 'youtube' | 'spotify'; label: string } | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`, kind: 'youtube', label: 'YouTube' } : null;
    }
    if (host.endsWith('youtube.com') || host === 'music.youtube.com') {
      const list = u.searchParams.get('list');
      const v = u.searchParams.get('v');
      if (v) return { src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}?autoplay=1${list ? `&list=${encodeURIComponent(list)}` : ''}`, kind: 'youtube', label: 'YouTube' };
      if (list) return { src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1`, kind: 'youtube', label: 'YouTube' };
      return null;
    }
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/\/(track|playlist|album|episode|show|artist)\/([A-Za-z0-9]+)/);
      return m ? { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: 'spotify', label: 'Spotify' } : null;
    }
  } catch {
    /* không phải URL */
  }
  return null;
}

/** Lấy tiêu đề video/bài qua oEmbed (có CORS); lỗi thì để nguyên tiêu đề mặc định */
async function fetchTitle(url: string): Promise<string | null> {
  const e = embedOf(url);
  if (!e) return null;
  const api = e.kind === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url=' : 'https://open.spotify.com/oembed?url=';
  try {
    const r = await fetch(api + encodeURIComponent(url.trim()));
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: unknown };
    return typeof j.title === 'string' && j.title.trim() ? j.title.trim() : null;
  } catch {
    return null;
  }
}

function MusicPanel({ t, open, onClose }: { t: T; open: boolean; onClose: () => void }) {
  const links = useFocus((s) => s.links);
  const titles = useFocus((s) => s.linkTitles);
  const addLink = useFocus((s) => s.addLink);
  const removeLink = useFocus((s) => s.removeLink);
  const setLinkTitle = useFocus((s) => s.setLinkTitle);
  const [noise, setNoise] = useState<Noise | null>(playingNoise());
  const [vol, setVol] = useState(0.6);
  const [playing, setPlaying] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState(false);
  const emb = playing ? embedOf(playing) : null;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return;
      const el = e.target as HTMLElement;
      if (!el.closest('.fp-music') && !el.closest('.fp-dock-btn')) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose]);

  // Liên kết chưa có tiêu đề thì lấy về (một lần cho mỗi liên kết)
  useEffect(() => {
    let alive = true;
    for (const l of links) {
      if (titles[l]) continue;
      void fetchTitle(l).then((title) => alive && title && setLinkTitle(l, title));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  const stations: { k: Noise; name: TKey; sub: TKey }[] = [
    { k: 'rain', name: 'focus.music.rain', sub: 'focus.music.rainSub' },
    { k: 'brown', name: 'focus.music.brown', sub: 'focus.music.brownSub' },
    { k: 'white', name: 'focus.music.white', sub: 'focus.music.whiteSub' },
  ];

  const toggleNoise = (k: Noise) => {
    if (noise === k) {
      stopNoise();
      setNoise(null);
      return;
    }
    setPlaying(null);
    playNoise(k, vol);
    setNoise(k);
  };

  const play = (l: string | null) => {
    if (l) {
      stopNoise();
      setNoise(null);
    }
    setPlaying(l);
  };

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    if (!embedOf(v)) return setErr(true);
    setErr(false);
    addLink(v);
    setDraft('');
    play(v);
  };

  const nameOf = (l: string) => titles[l] ?? t(embedOf(l)?.kind === 'spotify' ? 'focus.music.untitledSp' : 'focus.music.untitledYt');
  const next = () => {
    if (!links.length) return;
    const i = playing ? links.indexOf(playing) : -1;
    play(links[(i + 1) % links.length]);
  };

  return (
    <>
      <div className={`fp-music${open ? ' open' : ''}`} role="dialog" aria-label={t('focus.music.title')} aria-hidden={!open}>
        <h4>{t('focus.music.stations')}</h4>
        {stations.map((s) => (
          <button key={s.k} type="button" className={`fp-station${noise === s.k ? ' on' : ''}`} onClick={() => toggleNoise(s.k)}>
            <span className="play">{noise === s.k ? '❚❚' : '▶'}</span>
            <span>
              <b>{t(s.name)}</b>
              <small>{t(s.sub)}</small>
            </span>
          </button>
        ))}
        <h4>{t('focus.music.links')}</h4>
        {links.map((l) => (
          <div key={l} className={`fp-link${playing === l ? ' on' : ''}`}>
            <button type="button" onClick={() => play(playing === l ? null : l)} title={l}>
              <span className="play">{playing === l ? '❚❚' : '▶'}</span>
              <span>
                <b>{nameOf(l)}</b>
                <small>{l.replace(/^https?:\/\/(www\.)?/, '')}</small>
              </span>
            </button>
            <button
              type="button"
              className="del"
              onClick={() => {
                if (playing === l) setPlaying(null);
                removeLink(l);
              }}
              aria-label={t('focus.music.remove')}
            >
              ✕
            </button>
          </div>
        ))}
        <div className="fp-add">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setErr(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('focus.music.paste')}
          />
          <button type="button" onClick={submit} aria-label={t('focus.music.add')}>
            +
          </button>
        </div>
        {err && <p className="fp-err">{t('focus.music.invalid')}</p>}
        <label className="fp-vol">
          <span>🔊</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(vol * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setVol(v);
              setNoiseVolume(v);
            }}
            aria-label={t('focus.set.volume')}
          />
        </label>
        <p className="fp-note">{t('focus.music.hint')}</p>
      </div>

      {emb && playing && (
        <div className={`fp-player ${emb.kind}`} role="region" aria-label={nameOf(playing)}>
          <div className="fp-player-bar">
            <span className="fp-player-ico" aria-hidden="true">
              {emb.kind === 'youtube' ? '▶' : '♪'}
            </span>
            <span className="fp-player-title" title={nameOf(playing)}>
              {nameOf(playing)}
            </span>
            {links.length > 1 && (
              <button type="button" onClick={next} title={t('focus.music.next')} aria-label={t('focus.music.next')}>
                ⏭
              </button>
            )}
            <button type="button" onClick={() => window.open(playing, '_blank', 'noopener,noreferrer')} title={t('focus.music.openOrig')} aria-label={t('focus.music.openOrig')}>
              ⤢
            </button>
            <button type="button" onClick={() => play(null)} title={t('focus.music.closePlayer')} aria-label={t('focus.music.closePlayer')}>
              ✕
            </button>
          </div>
          <iframe key={emb.src} src={emb.src} title={nameOf(playing)} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
        </div>
      )}
    </>
  );
}
