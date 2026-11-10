/**
 * Kết bạn (tìm qua email) và dự án dùng chung:
 *  - FriendsButton: nút trên thanh trên cùng, mở danh sách bạn bè / lời mời
 *  - SidebarToggle: thanh bên kiểu Jira — kiểu xem, bảng của tôi, dự án và các bảng trong dự án
 *  - ProjectDialog: tạo dự án, đổi tên, thêm/bớt thành viên (host), rời / xoá dự án
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT, type TKey } from '../i18n';
import { api, ApiError, type ApiUser, type Member } from '../sync/api';
import {
  acceptFriend,
  addMember,
  createBoard,
  createProject,
  deleteBoard,
  deleteProject,
  projectOfBoard,
  readNotices,
  refreshPeople,
  removeFriend,
  removeMember,
  renameBoard,
  renameProject,
  requestFriend,
  usePeople,
} from '../sync/people';
import { useBoard } from '../store/board';
import { switchBoard, useSession } from '../sync/session';
import { Avatar } from './Avatar';
import '../social.css';

const ERRORS = [
  'user_not_found',
  'self_friend',
  'already_friends',
  'already_requested',
  'invalid_email',
  'invalid_name',
  'not_friend',
  'host_only',
  'host_cannot_leave',
  'project_not_found',
  'board_not_found',
  'last_board',
  'network',
] as const;
function errKey(e: unknown): TKey {
  const code = e instanceof ApiError ? e.code : 'network';
  return (ERRORS as readonly string[]).includes(code) ? (`social.err.${code}` as TKey) : 'err.server_error';
}

/** Popover đóng khi bấm ra ngoài hoặc nhấn Esc */
function usePopover(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function PersonRow({ user, children, badge }: { user: ApiUser; children?: ReactNode; badge?: ReactNode }) {
  return (
    <li className="person">
      <Avatar user={user} size={30} />
      <span className="person-id">
        <strong>
          {user.name || user.email.split('@')[0]}
          {badge}
        </strong>
        <span>{user.email}</span>
      </span>
      <span className="person-actions">{children}</span>
    </li>
  );
}

/* ---------------- bạn bè ---------------- */

export function FriendsButton() {
  const t = useT();
  const { friends, incoming, outgoing } = usePeople();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = usePopover(open, () => setOpen(false));

  useEffect(() => {
    if (open) void refreshPeople();
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await requestFriend(email);
      setMsg({ ok: true, text: t(r.status === 'accepted' ? 'social.nowFriends' : 'social.requestSent', { name: r.user.name || r.user.email }) });
      setEmail('');
    } catch (err) {
      setMsg({ ok: false, text: t(errKey(err)) });
    } finally {
      setBusy(false);
    }
  };

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      setMsg({ ok: false, text: t(errKey(err)) });
    }
  };

  return (
    <div className="settings friends" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={incoming.length ? `${t('social.friends')} (${incoming.length})` : t('social.friends')}
        title={t('social.friends')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7.5" cy="7" r="3" />
          <path d="M2 16.5c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5" />
          <path d="M13.5 4.2a3 3 0 0 1 0 5.6M15.5 12.3c1.3.6 2.2 2 2.5 4.2" />
        </svg>
        {incoming.length > 0 && <span className="notif-badge">{incoming.length}</span>}
      </button>
      {open && (
        <div className="popover social-menu" role="dialog" aria-label={t('social.friends')}>
          <form className="social-add" onSubmit={submit}>
            <label className="menu-label" htmlFor="friend-email">
              {t('social.addFriend')}
            </label>
            <div className="social-add-row">
              <input
                id="friend-email"
                type="email"
                placeholder={t('social.emailPh')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setMsg(null);
                }}
              />
              <button type="submit" className="btn primary sm" disabled={busy}>
                {t('social.send')}
              </button>
            </div>
            {msg && <p className={`social-msg${msg.ok ? ' is-ok' : ''}`}>{msg.text}</p>}
          </form>

          {incoming.length > 0 && (
            <section>
              <div className="menu-label">{t('social.incoming')}</div>
              <ul className="people">
                {incoming.map((u) => (
                  <PersonRow key={u.id} user={u}>
                    <button type="button" className="btn primary sm" onClick={act(() => acceptFriend(u.id))}>
                      {t('social.accept')}
                    </button>
                    <button type="button" className="btn ghost sm" onClick={act(() => removeFriend(u.id))}>
                      {t('social.decline')}
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="menu-label">
              {t('social.friendList')} · {friends.length}
            </div>
            {friends.length === 0 ? (
              <p className="social-empty">{t('social.noFriends')}</p>
            ) : (
              <ul className="people">
                {friends.map((u) => (
                  <PersonRow key={u.id} user={u}>
                    <button
                      type="button"
                      className="person-x"
                      title={t('social.unfriend')}
                      aria-label={`${t('social.unfriend')}: ${u.email}`}
                      onClick={act(async () => {
                        if (window.confirm(t('social.unfriendConfirm', { name: u.name || u.email }))) await removeFriend(u.id);
                      })}
                    >
                      ×
                    </button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </section>

          {outgoing.length > 0 && (
            <section>
              <div className="menu-label">{t('social.outgoing')}</div>
              <ul className="people">
                {outgoing.map((u) => (
                  <PersonRow key={u.id} user={u}>
                    <button type="button" className="btn ghost sm" onClick={act(() => removeFriend(u.id))}>
                      {t('social.cancel')}
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- thanh bên (kiểu Jira) ---------------- */

/**
 * Nút mở thanh bên + thanh bên: chọn kiểu xem (Bảng / Danh sách / Lịch), bảng cá nhân,
 * danh sách dự án và các bảng trong từng dự án, tạo dự án / tạo bảng / quản lý dự án.
 * Dự án vừa được thêm vào có chấm đỏ cho tới khi mở.
 */
export function SidebarToggle() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const notices = usePeople((s) => s.notices);
  const unread = notices.filter((n) => n.type === 'project_added' && !n.read).length;
  return (
    <>
      <button
        type="button"
        className="icon-btn sidebar-toggle"
        aria-label={t('side.open')}
        title={t('side.open')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2.5" y="3.5" width="15" height="13" />
          <path d="M7.5 3.5v13" />
          <path d="M12.5 8 10.5 10l2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && <span className="notif-badge">{unread}</span>}
      </button>
      {open && <Sidebar onClose={() => setOpen(false)} />}
    </>
  );
}

type DialogState =
  | { kind: 'createProject' }
  | { kind: 'createBoard'; projectId: string }
  | { kind: 'manage'; projectId: string }
  | null;

function Sidebar({ onClose }: { onClose: () => void }) {
  const t = useT();
  const board = useSession((s) => s.board);
  const view = useBoard((s) => s.view);
  const setView = useBoard((s) => s.setView);
  const { projects, notices } = usePeople();
  const current = projectOfBoard(board, projects);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(current ? [current.id] : []));
  const [dialog, setDialog] = useState<DialogState>(null);
  const unreadByProject = new Map<string, string[]>();
  for (const n of notices)
    if (n.type === 'project_added' && !n.read && n.data.projectId)
      unreadByProject.set(n.data.projectId, [...(unreadByProject.get(n.data.projectId) ?? []), n.id]);
  const unreadProjects = unreadByProject.size;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !dialog && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, dialog]);

  const open = async (id: string | null, v?: 'kanban' | 'list' | 'calendar') => {
    if (v) setView(v);
    const ok = await switchBoard(id, () => window.confirm(t('sync.logoutConfirm')));
    if (ok) {
      await refreshPeople();
      onClose();
    }
  };

  const toggleProject = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Mở dự án mới được thêm vào: đánh dấu thông báo đã xem
    const ids = unreadByProject.get(id);
    if (ids) void readNotices(ids);
  };

  const views: { v: 'kanban' | 'list' | 'calendar'; key: TKey; icon: ReactNode }[] = [
    {
      v: 'kanban',
      key: 'nav.board',
      icon: <path d="M3 3.5h4v13H3zM8 3.5h4v8H8zM13 3.5h4v10h-4z" />,
    },
    { v: 'list', key: 'nav.list', icon: <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" /> },
    {
      v: 'calendar',
      key: 'nav.calendar',
      icon: <path d="M3 5h14v12H3zM3 8.5h14M7 3v3.5M13 3v3.5" strokeLinecap="round" />,
    },
  ];

  return createPortal(
    <div className="side-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sidebar" role="dialog" aria-modal="true" aria-label={t('side.title')}>
        <header className="side-head">
          <span className="side-title">{t('app.name')}</span>
          <button type="button" className="icon-btn" aria-label={t('modal.close')} onClick={onClose}>
            ✕
          </button>
        </header>

        <nav className="side-section" aria-label={t('nav.label')}>
          <div className="side-label">{t('side.views')}</div>
          {views.map(({ v, key, icon }) => (
            <button key={v} type="button" className={`side-item${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
              <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                {icon}
              </svg>
              {t(key)}
            </button>
          ))}
        </nav>

        <div className="side-section">
          <button type="button" className={`side-item side-my${board === null ? ' on' : ''}`} onClick={() => void open(null, 'kanban')}>
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="10" cy="7" r="3" />
              <path d="M4 16.5c.7-2.8 3-4.5 6-4.5s5.3 1.7 6 4.5" strokeLinecap="round" />
            </svg>
            {t('side.myBoard')}
          </button>
        </div>

        <div className="side-section side-projects">
          <div className="side-label side-label-row">
            <span>
              {t('social.projects')}
              {unreadProjects > 0 && <span className="side-dot-count">{unreadProjects}</span>}
            </span>
            <button type="button" className="side-add" title={t('social.newProject')} aria-label={t('social.newProject')} onClick={() => setDialog({ kind: 'createProject' })}>
              +
            </button>
          </div>
          {projects.length === 0 && <p className="side-empty">{t('side.noProjects')}</p>}
          {projects.map((p) => {
            const isOpen = expanded.has(p.id);
            const isNew = unreadByProject.has(p.id);
            return (
              <div key={p.id} className={`side-project${p.id === current?.id ? ' is-current' : ''}`}>
                <button type="button" className="side-item side-project-head" aria-expanded={isOpen} onClick={() => toggleProject(p.id)}>
                  <svg className="side-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="side-project-name">{p.name}</span>
                  {isNew && <span className="side-new" aria-label={t('side.newProjectBadge')} title={t('side.newProjectBadge')} />}
                  <span className={`role-badge${p.role === 'host' ? ' is-host' : ''}`}>{p.role === 'host' ? t('social.host') : t('social.member')}</span>
                </button>
                {isOpen && (
                  <div className="side-boards">
                    {p.boards.map((b) => (
                      <button key={b.id} type="button" className={`side-item side-board${b.id === board ? ' on' : ''}`} onClick={() => void open(b.id)}>
                        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 3.5h4v13H3zM8 3.5h4v8H8zM13 3.5h4v10h-4z" />
                        </svg>
                        {b.name}
                      </button>
                    ))}
                    <button type="button" className="side-item side-sub" onClick={() => setDialog({ kind: 'createBoard', projectId: p.id })}>
                      ＋ {t('side.newBoard')}
                    </button>
                    <button type="button" className="side-item side-sub" onClick={() => setDialog({ kind: 'manage', projectId: p.id })}>
                      {t('social.manageProject')} · {p.memberCount}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {dialog?.kind === 'createProject' && (
          <NameDialog
            title={t('social.newProject')}
            label={t('social.projectName')}
            placeholder={t('social.projectNamePh')}
            hint={t('social.newProjectHint')}
            submitLabel={t('social.create')}
            onClose={() => setDialog(null)}
            onSubmit={async (name) => {
              const p = await createProject(name, t('side.firstBoard'));
              setDialog(null);
              setExpanded((s) => new Set(s).add(p.id));
              await open(p.boards[0]?.id ?? null);
            }}
          />
        )}
        {dialog?.kind === 'createBoard' && (
          <NameDialog
            title={t('side.newBoard')}
            label={t('side.boardName')}
            placeholder={t('side.boardNamePh')}
            submitLabel={t('side.createBoard')}
            onClose={() => setDialog(null)}
            onSubmit={async (name) => {
              const b = await createBoard(dialog.projectId, name);
              setDialog(null);
              await open(b.id);
            }}
          />
        )}
        {dialog?.kind === 'manage' && (
          <ManageProjectDialog
            projectId={dialog.projectId}
            onClose={() => setDialog(null)}
            onLeft={async () => {
              setDialog(null);
              if (current?.id === dialog.projectId || !board) await open(null);
              else await refreshPeople();
            }}
          />
        )}
      </aside>
    </div>,
    document.body,
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  // Gắn vào body: thanh trên cùng có backdrop-filter nên position: fixed bên trong nó sẽ bị giới hạn theo thanh
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal project-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('modal.close')}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Hộp thoại nhập một cái tên (tạo dự án, tạo bảng) */
function NameDialog({
  title,
  label,
  placeholder,
  hint,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  placeholder: string;
  hint?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(name);
    } catch (err) {
      setError(t(errKey(err)));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form className="project-form" onSubmit={submit}>
        <label className="field">
          <span>{label}</span>
          <input id="name-dialog-input" autoFocus maxLength={80} value={name} placeholder={placeholder} onChange={(e) => setName(e.target.value)} />
        </label>
        {hint && <p className="hint">{hint}</p>}
        {error && <small className="error">{error}</small>}
        <footer className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function ManageProjectDialog({ projectId, onClose, onLeft }: { projectId: string; onClose: () => void; onLeft: () => void }) {
  const t = useT();
  const me = useSession((s) => s.user);
  const { friends, projects } = usePeople();
  const project = projects.find((p) => p.id === projectId);
  const isHost = project?.role === 'host';
  const [name, setName] = useState(project?.name ?? '');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  // Thành viên của dự án đang quản lý (có thể khác dự án của bảng đang mở)
  useEffect(() => {
    api
      .project(projectId)
      .then((r) => setMembers(r.members))
      .catch((err) => setError(t(errKey(err))));
  }, [projectId, t]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(t(errKey(err)));
    }
  };
  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id));

  return (
    <Dialog title={t('social.manageProject')} onClose={onClose}>
      <div className="project-form">
        <label className="field">
          <span>{t('social.projectName')}</span>
          <div className="social-add-row">
            <input id="project-rename" value={name} disabled={!isHost} maxLength={80} onChange={(e) => setName(e.target.value)} />
            {isHost && (
              <button
                type="button"
                className="btn ghost sm"
                disabled={!name.trim() || name.trim() === project?.name}
                onClick={() => void run(() => renameProject(projectId, name))}
              >
                {t('modal.save')}
              </button>
            )}
          </div>
        </label>

        <div className="field">
          <span>
            {t('social.members')} · {members.length}
          </span>
          <ul className="people">
            {members.map((m) => (
              <PersonRow
                key={m.id}
                user={m}
                badge={<span className={`role-badge${m.role === 'host' ? ' is-host' : ''}`}>{m.role === 'host' ? t('social.host') : t('social.member')}</span>}
              >
                {isHost && m.role !== 'host' && (
                  <button
                    type="button"
                    className="person-x"
                    title={t('social.removeMember')}
                    aria-label={`${t('social.removeMember')}: ${m.email}`}
                    onClick={() => void run(async () => setMembers(await removeMember(projectId, m.id)))}
                  >
                    ×
                  </button>
                )}
              </PersonRow>
            ))}
          </ul>
        </div>

        {project && (
          <div className="field">
            <span>
              {t('side.boards')} · {project.boards.length}
            </span>
            <ul className="people">
              {project.boards.map((b) => (
                <li key={b.id} className="person">
                  <span className="person-id">
                    <strong>{b.name}</strong>
                  </span>
                  {isHost && (
                    <span className="person-actions">
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() =>
                          void run(async () => {
                            const n = window.prompt(t('side.boardName'), b.name);
                            if (n && n.trim() && n.trim() !== b.name) await renameBoard(b.id, n);
                          })
                        }
                      >
                        {t('side.rename')}
                      </button>
                      {project.boards.length > 1 && (
                        <button
                          type="button"
                          className="person-x"
                          title={t('side.deleteBoard')}
                          aria-label={`${t('side.deleteBoard')}: ${b.name}`}
                          onClick={() =>
                            void run(async () => {
                              if (window.confirm(t('side.deleteBoardConfirm', { name: b.name }))) await deleteBoard(b.id);
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isHost && (
          <div className="field">
            <span>{t('social.addMember')}</span>
            {candidates.length === 0 ? (
              <p className="hint">{t('social.noCandidates')}</p>
            ) : (
              <div className="social-add-row">
                <select id="project-add-member" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t('social.pickFriend')}</option>
                  {candidates.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name ? `${f.name} · ${f.email}` : f.email}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={!pick}
                  onClick={() =>
                    void run(async () => {
                      setMembers(await addMember(projectId, pick));
                      setPick('');
                    })
                  }
                >
                  {t('social.add')}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <small className="error">{error}</small>}

        <footer className="modal-foot">
          {isHost ? (
            <button
              type="button"
              className="btn danger-ghost"
              onClick={() =>
                void run(async () => {
                  if (!window.confirm(t('social.deleteConfirm', { name: project?.name ?? '' }))) return;
                  await deleteProject(projectId);
                  onClose();
                  onLeft();
                })
              }
            >
              {t('social.deleteProject')}
            </button>
          ) : (
            <button
              type="button"
              className="btn danger-ghost"
              onClick={() =>
                void run(async () => {
                  if (!me || !window.confirm(t('social.leaveConfirm', { name: project?.name ?? '' }))) return;
                  await removeMember(projectId, me.id);
                  onClose();
                  onLeft();
                })
              }
            >
              {t('social.leave')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('data.close')}
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
