import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ActivityComment, type ActivityEvent, type ApiUser } from '../sync/api';
import { useSession } from '../sync/session';
import { userDirectory, usePeople } from '../sync/people';
import { useT, type T, type TKey } from '../i18n';
import { toast } from '../toast';
import { askConfirm } from '../confirm';
import { Avatar } from './Avatar';

type Tab = 'all' | 'comments' | 'history';

const UNKNOWN: ApiUser = { id: '', name: '?', email: '?' };

/** "2 giờ trước", "1 week ago" */
function ago(iso: string, t: T) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(t.locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 45) return rtf.format(0, 'second');
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
    ['month', 2_592_000],
    ['year', 31_536_000],
  ];
  let best: [Intl.RelativeTimeFormatUnit, number] = units[0];
  for (const u of units) if (abs >= u[1]) best = u;
  return rtf.format(Math.round(diff / best[1]), best[0]);
}

const FIELD_KEY: Record<string, TKey> = {
  status: 'act.f.status',
  priority: 'act.f.priority',
  title: 'act.f.title',
  description: 'act.f.description',
  due: 'act.f.due',
  time: 'act.f.time',
  assignee: 'act.f.assignee',
  labels: 'act.f.labels',
  progress: 'act.f.progress',
};

/** Hoạt động của việc: Tất cả / Bình luận / Lịch sử */
export function TaskActivity({ taskId, createdAt, creatorId }: { taskId: string; createdAt?: string; creatorId?: string | null }) {
  const t = useT();
  const people = usePeople();
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  const [tab, setTab] = useState<Tab>('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [users, setUsers] = useState<Map<string, ApiUser>>(new Map());
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const r = await api.taskActivity(taskId, board);
      setEvents(r.events);
      setComments(r.comments);
      setUsers(new Map(r.users.map((u) => [u.id, u])));
      setState('ok');
    } catch {
      setState('error');
    }
  }, [taskId, board]);

  useEffect(() => {
    setState('loading');
    void load();
  }, [load]);

  const dir = userDirectory(me, people);
  const who = (id: string | null | undefined) => (id ? (users.get(id) ?? dir.get(id) ?? (id === me?.id ? me : null)) : null) ?? UNKNOWN;

  const items = useMemo(() => {
    const list: ({ kind: 'event'; at: string; e: ActivityEvent } | { kind: 'comment'; at: string; c: ActivityComment })[] = [];
    if (tab !== 'comments') {
      for (const e of events) list.push({ kind: 'event', at: e.createdAt, e });
      // Việc tạo trước khi có lịch sử thì chưa có dòng "đã tạo việc": lấy từ ngày tạo và người tạo của chính việc
      if (createdAt && !events.some((e) => e.type === 'created'))
        list.push({ kind: 'event', at: createdAt, e: { id: 'created-synth', actorId: creatorId ?? null, type: 'created', data: {}, createdAt } });
    }
    if (tab !== 'history') for (const c of comments) list.push({ kind: 'comment', at: c.createdAt, c });
    list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return newestFirst ? list : list.reverse();
  }, [tab, events, comments, newestFirst, createdAt, creatorId]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: t('act.all') },
    { id: 'comments', label: t('act.comments') },
    { id: 'history', label: t('act.history') },
  ];

  const empty = tab === 'comments' ? t('act.empty.comments') : tab === 'history' ? t('act.empty.history') : t('act.empty.all');

  return (
    <section className="tm-activity" aria-label={t('act.title')}>
      <h3>{t('act.title')}</h3>
      <div className="tm-act-bar">
        <div className="tm-tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <button type="button" className="tm-sort" onClick={() => setNewestFirst((v) => !v)} title={t('act.sort')} aria-label={t('act.sort')}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: newestFirst ? 'none' : 'scaleY(-1)' }}>
            <path d="M3 4.5h10M3 8h7M3 11.5h4M12.5 9v4.5M10.5 11.5l2 2 2-2" />
          </svg>
        </button>
      </div>

      {tab !== 'history' && (
        <Composer
          me={me}
          onSend={async (body) => {
            try {
              const { comment } = await api.addComment(taskId, board, body);
              setComments((c) => [comment, ...c]);
              if (me) setUsers((u) => new Map(u).set(me.id, me));
              return true;
            } catch {
              toast.error('act.postFailed');
              return false;
            }
          }}
        />
      )}

      {state === 'loading' && <p className="tm-act-note">…</p>}
      {state === 'error' && (
        <p className="tm-act-note">
          {t('act.loadFailed')}{' '}
          <button type="button" className="tm-link" onClick={() => void load()}>
            {t('act.retry')}
          </button>
        </p>
      )}
      {state === 'ok' && items.length === 0 && <p className="tm-act-note">{empty}</p>}

      <ol className="tm-feed">
        {items.map((it) =>
          it.kind === 'comment' ? (
            <li key={`c${it.c.id}`} className="tm-item">
              <Avatar user={who(it.c.authorId)} size={32} />
              <div className="tm-item-body">
                <div className="tm-item-head">
                  <strong>{who(it.c.authorId).name || who(it.c.authorId).email}</strong>
                  <time title={new Date(it.c.createdAt).toLocaleString(t.locale)}>{ago(it.c.createdAt, t)}</time>
                </div>
                <CommentBody
                  c={it.c}
                  mine={!!me && it.c.authorId === me.id}
                  onEdit={async (body) => {
                    try {
                      const { comment } = await api.editComment(it.c.id, board, body);
                      setComments((list) => list.map((x) => (x.id === comment.id ? comment : x)));
                      return true;
                    } catch {
                      toast.error('act.postFailed');
                      return false;
                    }
                  }}
                  onDelete={async () => {
                    if (!(await askConfirm({ message: t('act.deleteConfirm'), confirmLabel: t('act.delete'), danger: true }))) return;
                    try {
                      await api.deleteComment(it.c.id, board);
                      setComments((list) => list.filter((x) => x.id !== it.c.id));
                      toast.success('act.deleted');
                    } catch {
                      toast.error('act.postFailed');
                    }
                  }}
                />
              </div>
            </li>
          ) : (
            <li key={`e${it.e.id}`} className="tm-item">
              <Avatar user={who(it.e.actorId)} size={32} />
              <div className="tm-item-body">
                <div className="tm-item-head">
                  <span>
                    <strong>{who(it.e.actorId).name || who(it.e.actorId).email}</strong> {eventText(it.e, t)}
                  </span>
                  <time title={new Date(it.e.createdAt).toLocaleString(t.locale)}>{ago(it.e.createdAt, t)}</time>
                </div>
                <EventChange e={it.e} t={t} who={who} />
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function eventText(e: ActivityEvent, t: T) {
  if (e.type === 'created') return t('act.created');
  const f = t(FIELD_KEY[e.type] ?? 'act.f.title');
  return e.type === 'description' ? t('act.updated', { field: f }) : t('act.changed', { field: f });
}

function EventChange({ e, t, who }: { e: ActivityEvent; t: T; who: (id: string | null | undefined) => ApiUser }) {
  if (e.type === 'created' || e.type === 'description') return null;
  const fmt = (v: string | null | undefined) => {
    if (v == null || v === '') return t('act.none');
    if (e.type === 'priority') return t(`prio.${v}` as TKey);
    if (e.type === 'progress') return `${v}%`;
    if (e.type === 'assignee') return who(v).name || who(v).email;
    if (e.type === 'due') return new Date(`${v}T00:00:00`).toLocaleDateString(t.locale);
    return v.replace('-', ' → ');
  };
  return (
    <div className="tm-change">
      <span className="tm-chip">{fmt(e.data.from)}</span>
      <span aria-hidden="true">→</span>
      <span className="tm-chip to">{fmt(e.data.to)}</span>
    </div>
  );
}

function Composer({ me, onSend }: { me: ApiUser | null; onSend: (body: string) => Promise<boolean> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await onSend(body);
    setBusy(false);
    if (ok) {
      setText('');
      setOpen(false);
    }
  };

  return (
    <div className="tm-composer">
      {me && <Avatar user={me} size={32} />}
      <div className="tm-composer-box">
        {open ? (
          <>
            <textarea
              ref={ref}
              rows={3}
              value={text}
              maxLength={5000}
              placeholder={t('act.placeholder')}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Không để Enter / Escape của ô này đóng hoặc gửi cả hộp thoại việc
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  e.stopPropagation();
                  void send();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  setOpen(false);
                }
              }}
            />
            <div className="tm-composer-actions">
              <button type="button" className="btn primary sm" disabled={!text.trim() || busy} onClick={() => void send()}>
                {t('act.save')}
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setOpen(false);
                  setText('');
                }}
              >
                {t('act.cancel')}
              </button>
              <small>{t('act.tip')}</small>
            </div>
          </>
        ) : (
          <button type="button" className="tm-composer-fake" onClick={() => setOpen(true)}>
            {t('act.placeholder')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Nội dung bình luận kèm hàng nút: sửa (của mình) và menu "…" (sao chép, xoá) */
function CommentBody({ c, mine, onEdit, onDelete }: { c: ActivityComment; mine: boolean; onEdit: (body: string) => Promise<boolean>; onDelete: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.stopImmediatePropagation();
        setMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  if (editing) {
    const save = async () => {
      const body = text.trim();
      if (!body || busy) return;
      setBusy(true);
      const ok = await onEdit(body);
      setBusy(false);
      if (ok) setEditing(false);
    };
    return (
      <div className="tm-composer-box">
        <textarea
          rows={3}
          value={text}
          maxLength={5000}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              e.stopPropagation();
              void save();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              setEditing(false);
              setText(c.body);
            }
          }}
        />
        <div className="tm-composer-actions">
          <button type="button" className="btn primary sm" disabled={!text.trim() || busy} onClick={() => void save()}>
            {t('act.save')}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditing(false);
              setText(c.body);
            }}
          >
            {t('act.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="tm-comment">
        {c.body}
        {c.editedAt && <small className="tm-edited"> {t('act.edited')}</small>}
      </p>
      <div className="tm-actions" ref={wrap}>
        {mine && (
          <button type="button" className="tm-act-btn" title={t('act.edit')} aria-label={t('act.edit')} onClick={() => setEditing(true)}>
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 13.5l.7-3L11 2.7a1.4 1.4 0 012 2L5.2 12.8zM9.8 3.9l2.3 2.3" />
            </svg>
          </button>
        )}
        <button type="button" className={`tm-act-btn${menu ? ' on' : ''}`} title={t('act.more')} aria-label={t('act.more')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" />
            <circle cx="8" cy="8" r="1.3" />
            <circle cx="12.5" cy="8" r="1.3" />
          </svg>
        </button>
        {menu && (
          <div className="tm-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void navigator.clipboard?.writeText(c.body).then(() => toast.success('act.copied'));
              }}
            >
              <span>{t('act.copy')}</span>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
                <path d="M10.5 3.5v-.6A1.4 1.4 0 009.1 1.5H3.9a1.4 1.4 0 00-1.4 1.4v5.2a1.4 1.4 0 001.4 1.4h.6" />
              </svg>
            </button>
            {mine && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenu(false);
                  onDelete();
                }}
              >
                <span>{t('act.delete')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
