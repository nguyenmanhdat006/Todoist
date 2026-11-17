/** Tab Tóm tắt: số liệu 7 ngày, biểu đồ theo trạng thái / ưu tiên / nhãn / người phụ trách, tiến độ từng bảng và hoạt động gần đây */
import { useMemo } from 'react';
import { Avatar } from '../components/Avatar';
import { useT, type T, type TKey } from '../i18n';
import { userDirectory, usePeople } from '../sync/people';
import { useOverviewUsers, useScopedEntries, type Entry } from '../sync/overview';
import { useSession } from '../sync/session';
import { PRIORITIES, type Priority } from '../types';
import { parseISO, ticketLabel, todayISO } from '../utils';

const DAY = 86_400_000;
const PRIO_COLOR: Record<Priority, string> = { high: '#ef4444', normal: '#f59e0b', low: '#3b82f6' };

function Card({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`sp-card ${className}`}>
      <h2>{title}</h2>
      {hint && <p className="sp-card-hint">{hint}</p>}
      {children}
    </section>
  );
}

function Stat({ icon, n, label, sub }: { icon: React.ReactNode; n: number; label: string; sub: string }) {
  return (
    <div className="sp-stat">
      <span className="sp-stat-ico" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div>
        <div className="sp-stat-n">
          {n} <span>{label}</span>
        </div>
        <div className="sp-stat-sub">{sub}</div>
      </div>
    </div>
  );
}

function Donut({ parts, total, label }: { parts: { key: string; label: string; n: number; color: string }[]; total: number; label: string }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="sp-donut-wrap">
      <div className="sp-donut-box">
      <svg className="sp-donut" viewBox="0 0 120 120" role="img" aria-label={`${label}: ${total}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="15" />
        {total > 0 &&
          parts.map((p) => {
            const len = (p.n / total) * C;
            const el = (
              <circle
                key={p.key}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={p.color}
                strokeWidth="15"
                strokeDasharray={`${Math.max(len - (parts.length > 1 ? 1.5 : 0), 0.01)} ${C}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="sp-donut-center">
        <b>{total}</b>
        <span>{label}</span>
      </div>
      </div>
      <ul className="sp-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} />
            {p.label}: {p.n}
          </li>
        ))}
      </ul>
    </div>
  );
}

function groupLabel(d: Date, t: T) {
  const today = parseISO(todayISO()).getTime();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((today - day) / DAY);
  if (diff === 0) return t('space.today');
  if (diff === 1) return t('space.yesterday');
  return new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function ago(d: Date, t: T) {
  const rtf = new Intl.RelativeTimeFormat(t.locale, { numeric: 'auto' });
  const s = (d.getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

type Kind = 'created' | 'updated' | 'completed';
interface Act {
  e: Entry;
  kind: Kind;
  at: Date;
}

export function Summary({ onOpenTask }: { onOpenTask: (id: string, boardId?: string) => void }) {
  const t = useT();
  const entries = useScopedEntries();
  const me = useSession((s) => s.user);
  const people = usePeople();
  const others = useOverviewUsers();
  const dir = userDirectory(me, people);
  const who = (id?: string | null) => (id ? (dir.get(id) ?? others.get(id)) : undefined);

  const d = useMemo(() => {
    const now = Date.now();
    const week = now - 7 * DAY;
    const today = parseISO(todayISO()).getTime();
    let completed = 0;
    let updated = 0;
    let created = 0;
    let due = 0;
    const status = new Map<string, { label: string; n: number; color: string }>();
    const prio: Record<Priority, number> = { high: 0, normal: 0, low: 0 };
    const tags = new Map<string, number>();
    const load = new Map<string, number>();
    const boards = new Map<string, { name: string; project: string; total: number; done: number }>();
    const acts: Act[] = [];
    for (const e of entries) {
      const { task, col } = e;
      const done = col.isDone;
      const c = Date.parse(task.createdAt);
      if (c >= week) created++;
      const u = task.updatedAt ? Date.parse(task.updatedAt) : NaN;
      if (u >= week) updated++;
      const f = task.completedAt ? Date.parse(task.completedAt) : NaN;
      if (done && f >= week) completed++;
      if (task.dueDate && !done) {
        const dd = parseISO(task.dueDate).getTime();
        if (dd >= today && dd <= today + 7 * DAY) due++;
      }
      const sk = col.builtin ?? col.title.toLowerCase();
      const s = status.get(sk) ?? { label: col.title, n: 0, color: col.color };
      s.n++;
      status.set(sk, s);
      prio[task.priority]++;
      if (task.tags.length === 0) tags.set('', (tags.get('') ?? 0) + 1);
      for (const g of task.tags) tags.set(g, (tags.get(g) ?? 0) + 1);
      const who = task.assigneeId ?? '';
      load.set(who, (load.get(who) ?? 0) + 1);
      const b = boards.get(e.boardId) ?? { name: e.boardName, project: e.projectName, total: 0, done: 0 };
      b.total++;
      if (done) b.done++;
      boards.set(e.boardId, b);
      if (!Number.isNaN(c)) acts.push({ e, kind: 'created', at: new Date(c) });
      if (done && !Number.isNaN(f)) acts.push({ e, kind: 'completed', at: new Date(f) });
      if (!Number.isNaN(u) && Math.abs(u - c) > 60_000 && !(done && Math.abs(u - f) < 60_000)) acts.push({ e, kind: 'updated', at: new Date(u) });
    }
    acts.sort((a, b) => b.at.getTime() - a.at.getTime());
    return { completed, updated, created, due, status, prio, tags, load, boards, acts: acts.slice(0, 40) };
  }, [entries]);

  const total = entries.length;
  const statusParts = [...d.status.entries()].map(([key, v]) => ({ key, label: v.label, n: v.n, color: v.color }));
  const prioMax = Math.max(2, ...PRIORITIES.map((p) => d.prio[p]));
  const prioTop = prioMax % 2 ? prioMax + 1 : prioMax;
  const tagRows = [...d.tags.entries()].sort((a, b) => b[1] - a[1]);
  const loadRows = [...d.load.entries()].sort((a, b) => b[1] - a[1]);

  const groups: { label: string; items: Act[] }[] = [];
  for (const a of d.acts) {
    const label = groupLabel(a.at, t);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(a);
    else groups.push({ label, items: [a] });
  }
  const verb: Record<Kind, TKey> = { created: 'space.act.created', updated: 'space.act.updated', completed: 'space.act.completed' };

  return (
    <div className="sp-summary">
      <div className="sp-stats">
        <Stat icon={<><circle cx="10" cy="10" r="7" /><path d="M6.8 10.2l2.2 2.2 4.4-4.6" /></>} n={d.completed} label={t('space.stat.completed')} sub={t('space.stat.last7')} />
        <Stat icon={<path d="M3 15l.8-3.4L13 2.6l3.4 3.4-9.2 9.2zM11.2 4.4l3.4 3.4" />} n={d.updated} label={t('space.stat.updated')} sub={t('space.stat.last7')} />
        <Stat icon={<><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M10 7v6M7 10h6" /></>} n={d.created} label={t('space.stat.created')} sub={t('space.stat.last7')} />
        <Stat icon={<path d="M3 5h14v12H3zM3 8.5h14M7 3v3.5M13 3v3.5" />} n={d.due} label={t('space.stat.due')} sub={t('space.stat.next7')} />
      </div>

      <div className="sp-grid">
        <Card title={t('space.status.title')} hint={t('space.status.hint')}>
          {total === 0 ? <p className="sp-empty">{t('space.empty')}</p> : <Donut parts={statusParts} total={total} label={t('space.status.total')} />}
        </Card>

        <Card title={t('space.recent.title')} hint={t('space.recent.hint')} className="sp-recent">
          {groups.length === 0 ? (
            <p className="sp-empty">{t('space.empty')}</p>
          ) : (
            <div className="sp-feed">
              {groups.map((g) => (
                <div key={g.label}>
                  <h3>{g.label}</h3>
                  <ul>
                    {g.items.map((a) => {
                      const person = who(a.kind === 'created' ? a.e.task.creatorId : (a.e.task.assigneeId ?? a.e.task.creatorId));
                      const tk = ticketLabel(a.e.task, a.e.projectKey);
                      return (
                        <li key={`${a.e.key}:${a.kind}`}>
                          {person ? <Avatar user={person} size={26} /> : <span className="sp-feed-dot" aria-hidden="true" />}
                          <div className="sp-feed-main">
                            <div className="sp-feed-line">
                              <span className={`sp-pill is-${a.kind}`}>{t(verb[a.kind])}</span>
                              {tk && <span className="ticket-key">{tk}</span>}
                              <button type="button" className="sp-link" onClick={() => onOpenTask(a.e.task.id, a.e.boardId)}>
                                {a.e.task.title}
                              </button>
                              <span className="sp-chip" style={{ '--c': a.e.col.color } as React.CSSProperties}>
                                {a.e.col.title}
                              </span>
                            </div>
                            <div className="sp-feed-time">
                              {person ? `${person.name || person.email.split('@')[0]} · ` : ''}
                              {ago(a.at, t)}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('space.prio.title')} hint={t('space.prio.hint')}>
          <div className="sp-bars" role="img" aria-label={t('space.prio.title')}>
            <div className="sp-bars-grid">
              {[prioTop, prioTop / 2, 0].map((v) => (
                <div key={v} className="sp-bars-line">
                  <span>{v}</span>
                </div>
              ))}
            </div>
            <div className="sp-bars-cols">
              {PRIORITIES.map((p) => (
                <div key={p} className="sp-bar-col">
                  <div className="sp-bar-slot">
                    <i style={{ height: `${(d.prio[p] / prioTop) * 100}%`, background: PRIO_COLOR[p] }} title={`${t(`prio.${p}`)}: ${d.prio[p]}`}>
                      {d.prio[p] > 0 && <b>{d.prio[p]}</b>}
                    </i>
                  </div>
                  <span>{t(`prio.${p}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title={t('space.tags.title')} hint={t('space.tags.hint')}>
          <div className="sp-dist-head">
            <span>{t('space.tags.col')}</span>
            <span>{t('space.dist')}</span>
          </div>
          {tagRows.length === 0 ? (
            <p className="sp-empty">{t('space.empty')}</p>
          ) : (
            <ul className="sp-dist">
              {tagRows.map(([tag, n]) => (
                <li key={tag || '—'}>
                  <span className="sp-dist-name">{tag || t('space.tags.none')}</span>
                  <span className="sp-dist-bar">
                    <i style={{ width: `${(n / Math.max(total, 1)) * 100}%` }} />
                    <b>{Math.round((n / Math.max(total, 1)) * 100)}%</b>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('space.load.title')} hint={t('space.load.hint')}>
          <div className="sp-dist-head">
            <span>{t('space.load.col')}</span>
            <span>{t('space.load.dist')}</span>
          </div>
          {loadRows.length === 0 ? (
            <p className="sp-empty">{t('space.empty')}</p>
          ) : (
            <ul className="sp-dist">
              {loadRows.map(([id, n]) => {
                const u = who(id);
                return (
                  <li key={id || '—'}>
                    <span className="sp-dist-name sp-who">
                      {u ? <Avatar user={u} size={22} /> : <span className="sp-anon" aria-hidden="true" />}
                      {id ? (u?.name || u?.email.split('@')[0] || '?') : t('space.load.none')}
                    </span>
                    <span className="sp-dist-bar">
                      <i style={{ width: `${(n / Math.max(total, 1)) * 100}%` }} />
                      <b>{Math.round((n / Math.max(total, 1)) * 100)}%</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={t('space.boards.title')} hint={t('space.boards.hint')}>
          {d.boards.size === 0 ? (
            <p className="sp-empty">{t('space.empty')}</p>
          ) : (
            <ul className="sp-dist sp-boards">
              {[...d.boards.entries()].map(([id, b]) => {
                const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
                return (
                  <li key={id}>
                    <span className="sp-dist-name">
                      {b.name || b.project}
                      <small>{b.name ? b.project : ''}</small>
                    </span>
                    <span className="sp-dist-bar is-green">
                      <i style={{ width: `${pct}%` }} />
                      <b>
                        {b.done}/{b.total}
                      </b>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
