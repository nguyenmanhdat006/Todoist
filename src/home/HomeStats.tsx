/** Thống kê trang chủ: số liệu theo khoảng thời gian và dự án, biểu đồ cột, trạng thái, tiến độ dự án, bản đồ nhiệt hoạt động */
import { useMemo, useState } from 'react';
import { ScopeSelect } from '../components/Social';
import { fmtMinutes, streaks, useFocus } from '../focus/store';
import { useT } from '../i18n';
import { useScopedEntries } from '../sync/overview';
import { Donut } from '../space/Summary';
import { toISODate } from '../utils';

const DAY = 86_400_000;
type Range = 7 | 30 | 90;
const RANGES: Range[] = [7, 30, 90];
const WEEKS = 18;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function HomeStats() {
  const t = useT();
  const entries = useScopedEntries();
  const focusDays = useFocus((s) => s.days);
  const [range, setRange] = useState<Range>(30);

  const d = useMemo(() => {
    const today = startOfDay(Date.now());
    const start = today - (range - 1) * DAY;
    const prevStart = start - range * DAY;

    // Việc đã hoàn thành: theo ngày (khóa YYYY-MM-DD)
    const perDay = new Map<string, number>();
    let completed = 0;
    let prev = 0;
    const status = new Map<string, { label: string; n: number; color: string }>();
    const projects = new Map<string, { name: string; total: number; done: number }>();
    for (const e of entries) {
      const done = e.col.isDone;
      const sk = e.col.builtin ?? e.col.title.toLowerCase();
      const s = status.get(sk) ?? { label: e.col.title, n: 0, color: e.col.color };
      s.n++;
      status.set(sk, s);
      const p = projects.get(e.projectId) ?? { name: e.projectName, total: 0, done: 0 };
      p.total++;
      if (done) p.done++;
      projects.set(e.projectId, p);
      if (!done || !e.task.completedAt) continue;
      const ts = Date.parse(e.task.completedAt);
      if (Number.isNaN(ts)) continue;
      const k = toISODate(new Date(ts));
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
      if (ts >= start) completed++;
      else if (ts >= prevStart) prev++;
    }

    // Cột: mỗi ngày (7, 30 ngày) hoặc mỗi tuần (quý)
    const size = range === 90 ? 7 : 1;
    const n = range === 90 ? 13 : range;
    const series = new Array<number>(n).fill(0);
    for (let i = 0; i < n * size; i++) {
      const day = today - i * DAY;
      const c = perDay.get(toISODate(new Date(day))) ?? 0;
      series[n - 1 - Math.floor(i / size)] += c;
    }

    // Tập trung (Pomodoro): không gắn theo dự án
    let ms = 0;
    let sessions = 0;
    for (let i = 0; i < range; i++) {
      const f = focusDays[toISODate(new Date(today - i * DAY))];
      if (f) {
        ms += f.ms;
        sessions += f.sessions;
      }
    }
    const week = Array.from({ length: 7 }, (_, i) => focusDays[toISODate(new Date(today - (6 - i) * DAY))]?.ms ?? 0);

    // Bản đồ nhiệt: 18 tuần, mỗi cột một tuần (thứ Hai ở trên), tính việc xong và phiên tập trung
    const dow = (new Date(today).getDay() + 6) % 7;
    const cells = (WEEKS - 1) * 7 + dow + 1;
    const heat = Array.from({ length: cells }, (_, i) => {
      const day = today - (cells - 1 - i) * DAY;
      const k = toISODate(new Date(day));
      return (perDay.get(k) ?? 0) + (focusDays[k]?.sessions ?? 0);
    });

    return { completed, prev, series, ms, sessions, week, heat, status, projects: [...projects.values()].sort((a, b) => b.total - a.total).slice(0, 6) };
  }, [entries, focusDays, range]);

  const streak = useMemo(() => streaks(focusDays), [focusDays]);
  const total = entries.length;
  const statusParts = [...d.status.entries()].map(([key, v]) => ({ key, label: v.label, n: v.n, color: v.color }));
  const delta = d.completed - d.prev;

  const max = Math.max(1, ...d.series);
  const wmax = Math.max(1, ...d.week);
  const spark = d.series.length > 1 ? d.series.map((v, i) => `${(2 + (i / (d.series.length - 1)) * 60).toFixed(1)},${(22 - (v / max) * 18).toFixed(1)}`).join(' ') : '';
  const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);
  const dayLabel = (i: number) => {
    const day = startOfDay(Date.now()) - (d.series.length - 1 - i) * DAY;
    return new Intl.DateTimeFormat(t.locale, { weekday: 'short' }).format(new Date(day));
  };

  return (
    <section className="hs" aria-label={t('hs.title')}>
      <div className="hs-head">
        <h2 className="home-title">{t('hs.title')}</h2>
        <div className="hs-filters">
          <ScopeSelect />
          <div className="hs-seg" role="group" aria-label={t('hs.range')}>
            {RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? 'on' : ''} aria-pressed={range === r} onClick={() => setRange(r)}>
                {t(`hs.range.${r}` as 'hs.range.7')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hs-kpis">
        <div className="hs-k is-green">
          <small>{t('hs.done')}</small>
          <b>
            {d.completed}
            {delta !== 0 && <em className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</em>}
          </b>
          {spark && (
            <svg width="64" height="26" viewBox="0 0 64 26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points={spark} />
            </svg>
          )}
        </div>
        <div className="hs-k is-blue" title={t('hs.focusHint')}>
          <small>{t('hs.focus')}</small>
          <b>{fmtMinutes(d.ms)}</b>
          <svg width="64" height="26" viewBox="0 0 64 26" fill="currentColor" aria-hidden="true">
            {d.week.slice(2).map((v, i) => {
              const h = Math.max(3, (v / wmax) * 22);
              return <rect key={i} x={2 + i * 12} y={24 - h} width="7" height={h} rx="2" />;
            })}
          </svg>
        </div>
        <div className="hs-k is-red" title={t('hs.focusHint')}>
          <small>{t('hs.sessions')}</small>
          <b>{d.sessions}</b>
        </div>
        <div className="hs-k is-amber">
          <small>{t('hs.streak')}</small>
          <b>
            {streak.current}
            <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 2.5c.4 3-2.8 4.4-2.8 7.6a2.8 2.8 0 005.6 0c0-1-.4-1.7-.9-2.4 2.4.9 3.9 3 3.9 5A5.8 5.8 0 0110 18.5a5.8 5.8 0 01-5.8-5.8c0-4.4 4.6-6.2 5.8-10.2z" />
            </svg>
          </b>
          <span>{t('hs.best', { n: streak.best })}</span>
        </div>
      </div>

      <div className="hs-row is-a">
        <div className="sp-card">
          <h2>{t('hs.perDay')}</h2>
          <p className="sp-card-hint">{range === 90 ? t('hs.perWeek') : t('hs.perDayHint', { n: range })}</p>
          <div className={`hs-bars${d.series.length > 14 ? ' is-dense' : ''}`} role="img" aria-label={t('hs.perDay')}>
            {d.series.map((v, i) => (
              <div key={i} title={String(v)}>
                <i style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 100)}%` }} />
                {range === 7 && <span>{dayLabel(i)}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="sp-card">
          <h2>{t('space.status.title')}</h2>
          <p className="sp-card-hint">{t('space.status.hint')}</p>
          {total === 0 ? <p className="sp-empty">{t('space.empty')}</p> : <Donut parts={statusParts} total={total} label={t('space.status.total')} />}
        </div>
      </div>

      <div className="hs-row is-b">
        <div className="sp-card">
          <h2>{t('hs.byProject')}</h2>
          <p className="sp-card-hint">{t('hs.byProjectHint')}</p>
          {d.projects.length === 0 ? (
            <p className="sp-empty">{t('space.empty')}</p>
          ) : (
            <ul className="sp-dist sp-boards">
              {d.projects.map((p) => (
                <li key={p.name}>
                  <span className="sp-dist-name">{p.name}</span>
                  <span className="sp-dist-bar is-green">
                    <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                    <b>
                      {p.done}/{p.total}
                    </b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="sp-card">
          <h2>{t('hs.activity', { n: WEEKS })}</h2>
          <p className="sp-card-hint">{t('hs.activityHint')}</p>
          <div className="hs-heat" role="img" aria-label={t('hs.activity', { n: WEEKS })}>
            {d.heat.map((n, i) => (
              <i key={i} className={`l${level(n)}`} title={String(n)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
