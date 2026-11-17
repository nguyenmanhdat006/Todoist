import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useT } from '../i18n';
import { useBoard } from '../store/board';
import { askConfirm } from '../confirm';
import { Avatar } from './Avatar';
import { loadOverview, useAllEntries, useOverviewUsers, type Entry } from '../sync/overview';
import { refreshPeople, userDirectory, usePeople } from '../sync/people';
import { switchBoard, useSession } from '../sync/session';
import type { ProjectInfo } from '../sync/api';
import { fold, ticketLabel } from '../utils';
import '../search.css';

interface Props {
  /** boardId: bảng chứa việc; khác bảng đang mở thì app chuyển bảng trước khi mở */
  onOpenTask: (id: string, boardId?: string) => void;
}

type Section = 'viewed' | 'updated' | 'result';
type Item = { kind: 'project'; project: ProjectInfo; score: number } | { kind: 'ticket'; entry: Entry; label: string | null; score: number; section: Section };

const MAX_PROJECTS = 4;
const MAX_TICKETS = 8;
const MAX_VIEWED = 4;
const RECENT_KEY = 'tm-recent';
const GOTO = [
  ['kanban', 'nav.board'],
  ['list', 'nav.list'],
  ['calendar', 'nav.calendar'],
  ['timeline', 'space.tab.timeline'],
] as const;

type When = 'any' | 'today' | 'yesterday' | 'd7' | 'd30' | 'y1';
const WHEN: When[] = ['any', 'today', 'yesterday', 'd7', 'd30', 'y1'];

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}
function pushRecent(key: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 20)));
  } catch {
    /* bỏ qua */
  }
}

/** Việc có được sửa lần cuối trong khoảng thời gian đã chọn không */
function inWindow(iso: string, when: When): boolean {
  if (when === 'any') return true;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  switch (when) {
    case 'today':
      return at >= midnight.getTime();
    case 'yesterday':
      return at >= midnight.getTime() - day && at < midnight.getTime();
    case 'd7':
      return at >= now - 7 * day;
    case 'd30':
      return at >= now - 30 * day;
    default:
      return at >= now - 365 * day;
  }
}

/** Tô đậm phần khớp (không phân biệt hoa thường và dấu) */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const folded = fold(text);
  // fold giữ nguyên độ dài với chữ Latin có dấu dựng sẵn; nếu lệch thì không tô để tránh cắt sai
  if (folded.length !== text.length) return <>{text}</>;
  const marks: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const i = folded.indexOf(term, from);
      if (i < 0) break;
      marks.push([i, i + term.length]);
      from = i + term.length;
    }
  }
  if (!marks.length) return <>{text}</>;
  marks.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1]);
    else merged.push([...m]);
  }
  const out: JSX.Element[] = [];
  let pos = 0;
  merged.forEach(([s, e], i) => {
    if (s > pos) out.push(<span key={`t${i}`}>{text.slice(pos, s)}</span>);
    out.push(<mark key={`m${i}`}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  if (pos < text.length) out.push(<span key="end">{text.slice(pos)}</span>);
  return <>{out}</>;
}

export function GlobalSearch({ onOpenTask }: Props) {
  const t = useT();
  const entries = useAllEntries();
  const projects = usePeople((s) => s.projects);
  const people = usePeople();
  const me = useSession((s) => s.user);
  const overviewUsers = useOverviewUsers();
  const dir = userDirectory(me, people);
  const setView = useBoard((s) => s.setView);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Bộ lọc bên phải (chỉ lọc việc; dự án chỉ lọc theo "Theo dự án")
  const [when, setWhen] = useState<When>('any');
  const [fProjects, setFProjects] = useState<Set<string>>(new Set());
  const [fAssignees, setFAssignees] = useState<Set<string>>(new Set());
  const [fTags, setFTags] = useState<Set<string>>(new Set());
  const [mine, setMine] = useState(false);
  const [fStatus, setFStatus] = useState<Set<'open' | 'done'>>(new Set());
  const [more, setMore] = useState<{ p?: boolean; a?: boolean; g?: boolean }>({});
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const taskFilters = when !== 'any' || fAssignees.size > 0 || fTags.size > 0 || mine || fStatus.size > 0;
  const anyFilter = taskFilters || fProjects.size > 0;
  const toggle = <T,>(set: Set<T>, v: T, put: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    put(n);
  };
  const clearFilters = () => {
    setWhen('any');
    setFProjects(new Set());
    setFAssignees(new Set());
    setFTags(new Set());
    setMine(false);
    setFStatus(new Set());
  };
  const passes = (e: Entry) => {
    if (fProjects.size && !fProjects.has(e.projectId)) return false;
    if (!inWindow(e.task.updatedAt ?? e.task.createdAt, when)) return false;
    if (fAssignees.size && !(e.task.assigneeId && fAssignees.has(e.task.assigneeId))) return false;
    if (mine && e.task.creatorId !== me?.id) return false;
    if (fStatus.size && !fStatus.has(e.col.isDone ? 'done' : 'open')) return false;
    if (fTags.size && !e.task.tags.some((g) => fTags.has(g))) return false;
    return true;
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mở: tải việc của mọi bảng (chạy nền, không hiện thanh tiến trình)
  useEffect(() => {
    if (open) void loadOverview(true);
  }, [open]);

  // Ctrl/⌘ + K mở ô tìm kiếm từ bất kỳ đâu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Bấm ra ngoài thì đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const { items, terms } = useMemo(() => {
    const q = fold(query.trim());
    const out: Item[] = [];
    const termList = q.split(/\s+/).filter(Boolean);
    const byUpdated = (a: Entry, b: Entry) => (b.task.updatedAt ?? b.task.createdAt).localeCompare(a.task.updatedAt ?? a.task.createdAt);
    const projectList = fProjects.size ? projects.filter((p) => fProjects.has(p.id)) : projects;

    if (!q) {
      if (taskFilters) {
        // Có bộ lọc: liệt kê việc khớp, mới sửa trước
        [...entries]
          .filter(passes)
          .sort(byUpdated)
          .slice(0, MAX_TICKETS + 4)
          .forEach((e, i) => out.push({ kind: 'ticket', entry: e, label: ticketLabel(e.task, e.projectKey), score: 50 - i, section: 'result' }));
        return { items: out, terms: [] as string[] };
      }
      // Chưa gõ gì: việc đã xem gần đây, dự án của bạn, việc mới sửa
      const byKey = new Map(entries.map((e) => [e.key, e]));
      const viewed = recent.map((k) => byKey.get(k)).filter((e): e is Entry => !!e && passes(e)).slice(0, MAX_VIEWED);
      viewed.forEach((e, i) => out.push({ kind: 'ticket', entry: e, label: ticketLabel(e.task, e.projectKey), score: 150 - i, section: 'viewed' }));
      projectList.slice(0, MAX_PROJECTS).forEach((p, i) => out.push({ kind: 'project', project: p, score: 100 - i }));
      const seen = new Set(viewed.map((e) => e.key));
      [...entries]
        .filter((e) => !seen.has(e.key) && passes(e))
        .sort(byUpdated)
        .slice(0, MAX_TICKETS - viewed.length)
        .forEach((e, i) => out.push({ kind: 'ticket', entry: e, label: ticketLabel(e.task, e.projectKey), score: 50 - i, section: 'updated' }));
      return { items: out, terms: [] as string[] };
    }

    // "stu-12", "stu 12", "STU12": mã ticket đầy đủ hoặc đang gõ dở
    const keyed = q.replace(/\s+/g, '').match(/^([a-z][a-z0-9]{0,5}?)-?(\d+)$/);
    const numeric = /^\d+$/.test(q) ? q : null;

    if (!taskFilters) {
      for (const p of projectList) {
        const name = fold(p.name);
        const key = fold(p.key);
        let score = 0;
        if (key === q) score = 90;
        else if (name === q) score = 85;
        else if (name.startsWith(q) || key.startsWith(q)) score = 70;
        else if (termList.every((w) => name.includes(w) || key.includes(w))) score = 40;
        if (score) out.push({ kind: 'project', project: p, score });
      }
    }

    for (const e of entries) {
      if (!passes(e)) continue;
      const label = ticketLabel(e.task, e.projectKey);
      const lab = label ? fold(label) : '';
      const title = fold(e.task.title);
      let score = 0;
      if (lab && keyed) {
        const want = `${keyed[1]}-${keyed[2]}`;
        if (lab === want) score = 200;
        else if (lab.startsWith(want)) score = 120;
      }
      if (!score && numeric && e.task.number != null && String(e.task.number).startsWith(numeric)) score = 80;
      if (!score) {
        const hay = [title, fold(e.task.note), fold(e.task.tags.join(' ')), fold(e.projectName), fold(e.boardName), lab].join(' ');
        const assignee = e.task.assigneeId ? fold((dir.get(e.task.assigneeId) ?? overviewUsers.get(e.task.assigneeId))?.name ?? '') : '';
        if (termList.every((w) => hay.includes(w) || assignee.includes(w))) {
          score = title === q ? 100 : title.startsWith(q) ? 60 : title.split(/\s+/).some((w) => w.startsWith(termList[0])) ? 50 : title.includes(q) ? 40 : 20;
          if (lab && lab.includes(q.replace(/\s+/g, '-'))) score = Math.max(score, 90);
        }
      }
      if (score) out.push({ kind: 'ticket', entry: e, label, score, section: 'result' });
    }

    const projectsOut = out.filter((x) => x.kind === 'project').sort((a, b) => b.score - a.score).slice(0, MAX_PROJECTS);
    const ticketsOut = out
      .filter((x) => x.kind === 'ticket')
      .sort((a, b) => b.score - a.score || ((a as { entry: Entry }).entry.task.number ?? 0) - ((b as { entry: Entry }).entry.task.number ?? 0))
      .slice(0, MAX_TICKETS);
    return { items: [...projectsOut, ...ticketsOut] as Item[], terms: termList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, entries, projects, dir, overviewUsers, when, fProjects, fAssignees, fTags, mine, fStatus, recent, me?.id]);

  useEffect(() => setActive(0), [query, open]);
  // Giữ mục đang chọn trong vùng nhìn thấy
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, items]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const pick = async (item: Item) => {
    close();
    if (item.kind === 'ticket') {
      pushRecent(item.entry.key);
      setRecent(readRecent());
      onOpenTask(item.entry.task.id, item.entry.boardId);
      return;
    }
    const first = item.project.boards[0];
    if (!first) return;
    setView('kanban');
    const ok = await switchBoard(first.id, () => askConfirm({ message: t('sync.logoutConfirm'), danger: true }));
    if (ok) await refreshPeople();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (items[active]) {
        e.preventDefault();
        void pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else close();
    }
  };

  // Dữ liệu cho cột bộ lọc bên phải
  const assignees = useMemo(() => {
    const ids = new Set<string>();
    for (const e of entries) if (e.task.assigneeId) ids.add(e.task.assigneeId);
    return [...ids].map((id) => dir.get(id) ?? overviewUsers.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, people.friends, people.members, overviewUsers, me]);
  const tagList = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of entries) for (const g of e.task.tags) n.set(g, (n.get(g) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [entries]);

  const projectItems = items.filter((x): x is Extract<Item, { kind: 'project' }> => x.kind === 'project');
  const ticketItems = items.filter((x): x is Extract<Item, { kind: 'ticket' }> => x.kind === 'ticket');
  const indexOf = (item: Item) => items.indexOf(item);
  const listId = 'gsearch-list';

  const renderTickets = (section: Section, title: string) => {
    const list = ticketItems.filter((x) => x.section === section);
    if (list.length === 0) return null;
    return (
      <div className="gs-group">
        <div className="gs-label">
          <span>{title}</span>
        </div>
        {list.map((it) => {
          const i = indexOf(it);
          const { entry: e, label } = it;
          const assignee = e.task.assigneeId ? (dir.get(e.task.assigneeId) ?? overviewUsers.get(e.task.assigneeId)) : undefined;
          return (
            <button
              key={e.key}
              id={`gs-opt-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className={`gs-item${e.col.isDone ? ' is-done' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(it)}
            >
              <span className="gs-tile is-ticket" style={{ '--c': e.col.color } as React.CSSProperties} aria-hidden="true">
                {e.col.isDone ? (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2.5" y="3" width="11" height="10" rx="2" />
                    <path d="M5.5 6.5h5M5.5 9.5h3" />
                  </svg>
                )}
              </span>
              <span className="gs-main">
                <span className="gs-title">
                  <Highlight text={e.task.title} terms={terms} />
                </span>
                <span className="gs-sub">
                  <span className={`gs-key${label ? '' : ' is-pending'}`}>
                    <Highlight text={label ?? `${e.projectKey || '—'}-…`} terms={terms} />
                  </span>
                  <span className="gs-where">
                    {e.projectName}
                    {e.boardName && ` · ${e.boardName}`}
                  </span>
                </span>
              </span>
              <span className="gs-right">
                <span className="gs-stage" style={{ '--c': e.col.color } as React.CSSProperties}>
                  {e.col.title}
                </span>
                {assignee && <Avatar user={assignee} size={22} />}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`gsearch${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="icon-btn gs-icon"
        aria-label={t('gsearch.open')}
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      </button>
      <div className="gs-field">
        <svg className="gs-lens" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `gs-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={t('gsearch.placeholder')}
          aria-label={t('gsearch.label')}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="gs-kbd" aria-hidden="true">Ctrl K</kbd>
        <button type="button" className="gs-close" aria-label={t('modal.close')} onClick={close}>
          ✕
        </button>
      </div>

      {open && (
        <div className="gs-panel">
          <div className="gs-body">
            <div className="gs-list" id={listId} role="listbox" ref={listRef}>
              {items.length === 0 ? (
                <p className="gs-empty">{query.trim() ? t('gsearch.empty', { q: query.trim() }) : t('gsearch.emptyFilter')}</p>
              ) : (
                <>
                  {renderTickets('viewed', t('gsearch.viewed'))}
                  {projectItems.length > 0 && (
                    <div className="gs-group">
                      <div className="gs-label">
                        <span>{query.trim() ? t('gsearch.projects') : t('gsearch.yourProjects')}</span>
                      </div>
                      {projectItems.map((it) => {
                        const i = indexOf(it);
                        const p = it.project;
                        return (
                          <button
                            key={p.id}
                            id={`gs-opt-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === active}
                            data-active={i === active}
                            className="gs-item"
                            onMouseEnter={() => setActive(i)}
                            onClick={() => void pick(it)}
                          >
                            <span className="gs-tile" aria-hidden="true">
                              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2.5 5.5h5l1.6 1.8h8.4v8.2h-15z" />
                              </svg>
                            </span>
                            <span className="gs-main">
                              <span className="gs-title">
                                <Highlight text={p.name} terms={terms} />
                              </span>
                              <span className="gs-sub">
                                {t(p.kind === 'personal' ? 'gsearch.personal' : 'gsearch.team')} · {t('gsearch.boards', { n: p.boards.length })}
                              </span>
                            </span>
                            <span className="gs-key-badge">
                              <Highlight text={p.key} terms={terms} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {renderTickets('updated', t('gsearch.recent'))}
                  {renderTickets('result', taskFilters && !query.trim() ? t('gsearch.results') : t('gsearch.tickets'))}
                </>
              )}
            </div>

            <aside className="gs-filters" aria-label={t('gsearch.filters')}>
              <div className="gs-fgroup">
                <h3>{t('gsearch.fWhen')}</h3>
                <div className="gs-chips">
                  {WHEN.map((w) => (
                    <button key={w} type="button" className={`gs-chip${when === w ? ' on' : ''}`} aria-pressed={when === w} onClick={() => setWhen(w)}>
                      {t(`gsearch.when.${w}`)}
                    </button>
                  ))}
                </div>
              </div>

              {projects.length > 0 && (
                <div className="gs-fgroup">
                  <h3>{t('gsearch.fProject')}</h3>
                  {(more.p ? projects : projects.slice(0, 3)).map((p) => (
                    <label key={p.id} className="gs-check">
                      <input type="checkbox" checked={fProjects.has(p.id)} onChange={() => toggle(fProjects, p.id, setFProjects)} />
                      <span className="gs-check-ico" aria-hidden="true">
                        {p.key.slice(0, 2)}
                      </span>
                      <span className="gs-check-text">{p.name}</span>
                    </label>
                  ))}
                  {projects.length > 3 && (
                    <button type="button" className="gs-more" onClick={() => setMore((m) => ({ ...m, p: !m.p }))}>
                      {t(more.p ? 'gsearch.less' : 'gsearch.more')}
                    </button>
                  )}
                </div>
              )}

              {assignees.length > 0 && (
                <div className="gs-fgroup">
                  <h3>{t('gsearch.fAssignee')}</h3>
                  {(more.a ? assignees : assignees.slice(0, 3)).map((u) => (
                    <label key={u.id} className="gs-check">
                      <input type="checkbox" checked={fAssignees.has(u.id)} onChange={() => toggle(fAssignees, u.id, setFAssignees)} />
                      <Avatar user={u} size={22} />
                      <span className="gs-check-text">{u.name || u.email.split('@')[0]}</span>
                    </label>
                  ))}
                  {assignees.length > 3 && (
                    <button type="button" className="gs-more" onClick={() => setMore((m) => ({ ...m, a: !m.a }))}>
                      {t(more.a ? 'gsearch.less' : 'gsearch.more')}
                    </button>
                  )}
                </div>
              )}

              <div className="gs-fgroup">
                <h3>{t('gsearch.fReporter')}</h3>
                <label className="gs-check">
                  <input type="checkbox" checked={mine} onChange={() => setMine((v) => !v)} />
                  <span className="gs-check-text">{t('gsearch.mine')}</span>
                </label>
              </div>

              <div className="gs-fgroup">
                <h3>{t('gsearch.fStatus')}</h3>
                <div className="gs-checks">
                  {(['open', 'done'] as const).map((st) => (
                    <label key={st} className="gs-check">
                      <input type="checkbox" checked={fStatus.has(st)} onChange={() => toggle(fStatus, st, setFStatus)} />
                      <span className="gs-check-text">{t(st === 'open' ? 'gsearch.stOpen' : 'gsearch.stDone')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {tagList.length > 0 && (
                <div className="gs-fgroup">
                  <h3>{t('gsearch.fTag')}</h3>
                  {(more.g ? tagList : tagList.slice(0, 4)).map((g) => (
                    <label key={g} className="gs-check">
                      <input type="checkbox" checked={fTags.has(g)} onChange={() => toggle(fTags, g, setFTags)} />
                      <span className="gs-check-text">{g}</span>
                    </label>
                  ))}
                  {tagList.length > 4 && (
                    <button type="button" className="gs-more" onClick={() => setMore((m) => ({ ...m, g: !m.g }))}>
                      {t(more.g ? 'gsearch.less' : 'gsearch.more')}
                    </button>
                  )}
                </div>
              )}

              {anyFilter && (
                <button type="button" className="gs-clear" onClick={clearFilters}>
                  {t('gsearch.clear')}
                </button>
              )}
            </aside>
          </div>

          <div className="gs-goto">
            <span>{t('gsearch.goAll')}</span>
            {GOTO.map(([v, k]) => (
              <button
                key={v}
                type="button"
                className="gs-chip"
                onClick={() => {
                  setView(v);
                  close();
                }}
              >
                {t(k)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="gs-all"
            onClick={() => {
              setView('list');
              close();
            }}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
            <span>{t('gsearch.viewAll')}</span>
            <span className="gs-hints" aria-hidden="true">
              <kbd>↑</kbd>
              <kbd>↓</kbd> {t('gsearch.hintMove')} · <kbd>Enter</kbd> {t('gsearch.hintOpen')} · <kbd>Esc</kbd> {t('gsearch.hintClose')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
