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

type Item = { kind: 'project'; project: ProjectInfo; score: number } | { kind: 'ticket'; entry: Entry; label: string | null; score: number };

const MAX_PROJECTS = 4;
const MAX_TICKETS = 8;

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

    if (!q) {
      // Chưa gõ gì: dự án và vài việc mới sửa gần đây
      projects.slice(0, MAX_PROJECTS).forEach((p, i) => out.push({ kind: 'project', project: p, score: 100 - i }));
      [...entries]
        .sort((a, b) => (b.task.updatedAt ?? b.task.createdAt).localeCompare(a.task.updatedAt ?? a.task.createdAt))
        .slice(0, MAX_TICKETS)
        .forEach((e, i) => out.push({ kind: 'ticket', entry: e, label: ticketLabel(e.task, e.projectKey), score: 50 - i }));
      return { items: out, terms: [] as string[] };
    }

    // "stu-12", "stu 12", "STU12": mã ticket đầy đủ hoặc đang gõ dở
    const keyed = q.replace(/\s+/g, '').match(/^([a-z][a-z0-9]{0,5}?)-?(\d+)$/);
    const numeric = /^\d+$/.test(q) ? q : null;

    for (const p of projects) {
      const name = fold(p.name);
      const key = fold(p.key);
      let score = 0;
      if (key === q) score = 90;
      else if (name === q) score = 85;
      else if (name.startsWith(q) || key.startsWith(q)) score = 70;
      else if (termList.every((w) => name.includes(w) || key.includes(w))) score = 40;
      if (score) out.push({ kind: 'project', project: p, score });
    }

    for (const e of entries) {
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
      if (score) out.push({ kind: 'ticket', entry: e, label, score });
    }

    const projectsOut = out.filter((x) => x.kind === 'project').sort((a, b) => b.score - a.score).slice(0, MAX_PROJECTS);
    const ticketsOut = out
      .filter((x) => x.kind === 'ticket')
      .sort((a, b) => b.score - a.score || ((a as { entry: Entry }).entry.task.number ?? 0) - ((b as { entry: Entry }).entry.task.number ?? 0))
      .slice(0, MAX_TICKETS);
    return { items: [...projectsOut, ...ticketsOut] as Item[], terms: termList };
  }, [query, entries, projects, dir, overviewUsers]);

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

  const projectItems = items.filter((x): x is Extract<Item, { kind: 'project' }> => x.kind === 'project');
  const ticketItems = items.filter((x): x is Extract<Item, { kind: 'ticket' }> => x.kind === 'ticket');
  const indexOf = (item: Item) => items.indexOf(item);
  const listId = 'gsearch-list';

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
        <div className="gs-panel" id={listId} role="listbox" ref={listRef}>
          {items.length === 0 ? (
            <p className="gs-empty">{t('gsearch.empty', { q: query.trim() })}</p>
          ) : (
            <>
              {projectItems.length > 0 && (
                <div className="gs-group">
                  <div className="gs-label">{query.trim() ? t('gsearch.projects') : t('gsearch.yourProjects')}</div>
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
                        <span className="gs-ico" aria-hidden="true">
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
                        <span className="ticket-key">{p.key}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {ticketItems.length > 0 && (
                <div className="gs-group">
                  <div className="gs-label">{query.trim() ? t('gsearch.tickets') : t('gsearch.recent')}</div>
                  {ticketItems.map((it) => {
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
                        <span className={`ticket-key${label ? '' : ' is-pending'}`}>
                          <Highlight text={label ?? `${e.projectKey || '—'}-…`} terms={terms} />
                        </span>
                        <span className="gs-main">
                          <span className="gs-title">
                            <Highlight text={e.task.title} terms={terms} />
                          </span>
                          <span className="gs-sub">
                            {e.projectName}
                            {e.boardName && ` · ${e.boardName}`}
                            <span className="gs-stage" style={{ '--c': e.col.color } as React.CSSProperties}>
                              {e.col.title}
                            </span>
                          </span>
                        </span>
                        {assignee && <Avatar user={assignee} size={22} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          <div className="gs-foot" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> {t('gsearch.hintMove')}</span>
            <span><kbd>Enter</kbd> {t('gsearch.hintOpen')}</span>
            <span><kbd>Esc</kbd> {t('gsearch.hintClose')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
