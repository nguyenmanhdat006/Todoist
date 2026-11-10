/**
 * Kết bạn (tìm qua email) và dự án dùng chung:
 *  - FriendsButton: nút trên thanh trên cùng, mở danh sách bạn bè / lời mời
 *  - SidebarToggle: thanh bên kiểu Jira — kiểu xem, bảng của tôi, dự án và các bảng trong dự án
 *  - ProjectDialog: tạo dự án, đổi tên, thêm/bớt thành viên (host), rời / xoá dự án
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT, type TKey } from '../i18n';
import { api, ApiError, type ApiUser, type Member, type ProjectInfo } from '../sync/api';
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
import { useOverview } from '../sync/overview';
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
  'personal_project',
  'board_not_found',
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
    </svg>
  );
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
  | { kind: 'createProject'; projectKind: 'personal' | 'team' }
  | { kind: 'createBoard'; projectId: string }
  | { kind: 'manage'; projectId: string }
  | null;

function Sidebar({ onClose: closeNow }: { onClose: () => void }) {
  const t = useT();
  // Thu về có hiệu ứng trượt ra rồi mới gỡ khỏi trang
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const onClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(closeNow, 240);
  }, [closeNow]);
  const board = useSession((s) => s.board);
  const me = useSession((s) => s.user);
  const view = useBoard((s) => s.view);
  const setView = useBoard((s) => s.setView);
  const { projects, notices } = usePeople();
  const current = projectOfBoard(board ?? me?.id ?? null, projects);
  const [dialog, setDialog] = useState<DialogState>(null);
  // Danh sách bảng xổ xuống dưới nút Board
  const [boardMenu, setBoardMenu] = useState(false);
  const activeBoardId = board ?? me?.id ?? '';
  const activeBoardName = projects.flatMap((p) => p.boards).find((b) => b.id === activeBoardId)?.name;
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
    // Thanh bên giữ nguyên: chỉ đóng khi bấm vùng trống, nút ✕ hoặc Esc
    if (ok) await refreshPeople();
  };

  // Bấm tên dự án: xổ / thu danh sách bảng của dự án, và đánh dấu đã xem thông báo "được thêm vào dự án"
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(current ? [current.id] : []));
  const toggleProject = (p: ProjectInfo) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    const ids = unreadByProject.get(p.id);
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
    <div className={`side-backdrop${closing ? ' is-closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`sidebar${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={t('side.title')}>
        <header className="side-head">
          <span className="side-brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 20 20" width="16" height="16">
                <rect x="2.5" y="3" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="8" y="3" width="4" height="9" rx="1.2" fill="currentColor" opacity=".8" />
                <rect x="13.5" y="3" width="4" height="11.5" rx="1.2" fill="currentColor" opacity=".6" />
              </svg>
            </span>
            <span className="side-title">{t('app.name')}</span>
          </span>
          <button type="button" className="icon-btn" aria-label={t('modal.close')} onClick={onClose}>
            ✕
          </button>
        </header>

        <nav className="side-section" aria-label={t('nav.label')}>
          <div className="side-label">{t('side.views')}</div>
          {views.map(({ v, key, icon }) =>
            v === 'kanban' ? (
              <div key={v} className="side-dropdown">
                <button
                  type="button"
                  className={`side-item${view === v ? ' on' : ''}`}
                  aria-expanded={boardMenu}
                  aria-haspopup="listbox"
                  onClick={() => {
                    setView('kanban');
                    setBoardMenu((o) => !o);
                  }}
                >
                  <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                    {icon}
                  </svg>
                  <span className="side-item-text">{t(key)}</span>
                  {activeBoardName && <span className="side-current">{activeBoardName}</span>}
                  <svg className="side-caret" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {boardMenu && (
                  <div className="side-board-menu" role="listbox" aria-label={t('side.pickBoard')}>
                    {projects.every((p) => p.boards.length === 0) && <p className="side-empty">{t('side.noBoardsAny')}</p>}
                    {(['personal', 'team'] as const).map((kind) =>
                      projects
                        .filter((p) => (p.kind ?? 'team') === kind && p.boards.length > 0)
                        .map((p) => (
                          <div key={p.id} className="side-board-group">
                            <div className="side-board-group-name">
                              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                {kind === 'personal' ? (
                                  <>
                                    <circle cx="8" cy="5.5" r="2.4" />
                                    <path d="M3.2 13c.6-2 2.3-3.2 4.8-3.2s4.2 1.2 4.8 3.2" />
                                  </>
                                ) : (
                                  <>
                                    <circle cx="5.8" cy="6" r="2.1" />
                                    <circle cx="11" cy="6.6" r="1.7" />
                                    <path d="M1.8 13c.5-1.8 2-2.8 4-2.8s3.5 1 4 2.8M10.4 10.4c1.6 0 2.9.8 3.4 2.4" />
                                  </>
                                )}
                              </svg>
                              <span className="side-board-group-text">{p.name}</span>
                            </div>
                            {p.boards.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                role="option"
                                aria-selected={b.id === activeBoardId}
                                className={`side-item side-board${b.id === activeBoardId ? ' on' : ''}`}
                                onClick={() => void open(b.id, 'kanban')}
                              >
                                <span className="side-board-name">{b.name}</span>
                                {b.id === activeBoardId && (
                                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </div>
                        )),
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button key={v} type="button" className={`side-item${view === v ? ' on' : ''}`} onClick={() => setView(v)}>
                <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {icon}
                </svg>
                {t(key)}
              </button>
            ),
          )}
        </nav>

        {(['personal', 'team'] as const).map((kind) => {
          const list = projects.filter((p) => (p.kind ?? 'team') === kind);
          const unread = kind === 'team' ? unreadProjects : 0;
          return (
            <div key={kind} className={`side-section side-projects is-${kind}`}>
              <div className="side-label side-label-row">
                <span>
                  {t(kind === 'personal' ? 'side.personalProjects' : 'side.teamProjects')}
                  {unread > 0 && <span className="side-dot-count">{unread}</span>}
                </span>
                <button
                  type="button"
                  className="side-add"
                  title={t(kind === 'personal' ? 'side.newPersonal' : 'social.newProject')}
                  aria-label={t(kind === 'personal' ? 'side.newPersonal' : 'social.newProject')}
                  onClick={() => setDialog({ kind: 'createProject', projectKind: kind })}
                >
                  +
                </button>
              </div>
              {list.length === 0 && <p className="side-empty">{t(kind === 'personal' ? 'side.noPersonal' : 'side.noProjects')}</p>}
              {list.map((p) => {
                const isNew = unreadByProject.has(p.id);
                const isOpen = expanded.has(p.id);
                return (
                  <div key={p.id} className="side-project">
                    <div className={`side-prow${p.id === current?.id ? ' is-current' : ''}`}>
                      <button type="button" className="side-prow-main" aria-expanded={isOpen} onClick={() => toggleProject(p)} title={p.name}>
                        <svg className="side-chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2.5 5.5h5l1.6 1.8h8.4v8.2h-15z" />
                        </svg>
                        <span className="side-project-name">{p.name}</span>
                        {isNew && <span className="side-new" aria-label={t('side.newProjectBadge')} title={t('side.newProjectBadge')} />}
                        {kind === 'team' && (
                          <span className={`role-badge${p.role === 'host' ? ' is-host' : ''}`}>{p.role === 'host' ? t('social.host') : t('social.member')}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="side-icon"
                        title={kind === 'team' ? t('social.manageProject') : t('side.manageProject')}
                        aria-label={`${kind === 'team' ? t('social.manageProject') : t('side.manageProject')}: ${p.name}`}
                        onClick={() => setDialog({ kind: 'manage', projectId: p.id })}
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                          <circle cx="8" cy="8" r="2.2" />
                          <path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2" />
                        </svg>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="side-board-menu side-project-boards" role="listbox" aria-label={p.name}>
                        {p.boards.length === 0 && <p className="side-empty">{t('side.noBoards')}</p>}
                        {p.boards.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            role="option"
                            aria-selected={b.id === activeBoardId}
                            className={`side-item side-board${b.id === activeBoardId ? ' on' : ''}`}
                            onClick={() => void open(b.id, 'kanban')}
                          >
                            <span className="side-board-name">{b.name}</span>
                            {b.id === activeBoardId && (
                              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        ))}
                        <button type="button" className="side-item side-board side-newboard" onClick={() => setDialog({ kind: 'createBoard', projectId: p.id })}>
                          <span className="side-board-name">＋ {t('side.newBoard')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {dialog?.kind === 'createProject' && (
          <NameDialog
            title={t(dialog.projectKind === 'personal' ? 'side.newPersonal' : 'social.newProject')}
            label={t('social.projectName')}
            placeholder={t(dialog.projectKind === 'personal' ? 'side.personalNamePh' : 'social.projectNamePh')}
            hint={t(dialog.projectKind === 'personal' ? 'side.newPersonalHint' : 'social.newProjectHint')}
            submitLabel={t('social.create')}
            onClose={() => setDialog(null)}
            onSubmit={async (name) => {
              const p = await createProject(name, dialog.projectKind);
              setExpanded((prev) => new Set(prev).add(p.id));
              setDialog({ kind: 'createBoard', projectId: p.id });
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
    <div className="backdrop over-side" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
  const isPersonal = project?.kind === 'personal';
  const [name, setName] = useState(project?.name ?? '');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Đang đổi tên bảng ngay trên dòng (thay cho hộp nhập của trình duyệt)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

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
    <Dialog title={t(isPersonal ? 'side.manageProject' : 'social.manageProject')} onClose={onClose}>
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

        {!isPersonal && (
        <div className="field dlg-section">
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
                    <TrashIcon />
                  </button>
                )}
              </PersonRow>
            ))}
          </ul>
        </div>
        )}

        {project && (
          <div className="field dlg-section">
            <span>
              {t('side.boards')} · {project.boards.length}
            </span>
            <ul className="people">
              {project.boards.map((b) => (
                <li key={b.id} className="person board-row">
                  <span className="board-ico" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 3.5h4v13H3zM8 3.5h4v8H8zM13 3.5h4v10h-4z" />
                    </svg>
                  </span>
                  {editing?.id === b.id ? (
                    <form
                      className="board-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const n = editing.name.trim();
                        setEditing(null);
                        if (n && n !== b.name) void run(() => renameBoard(b.id, n));
                      }}
                    >
                      <input
                        autoFocus
                        value={editing.name}
                        maxLength={80}
                        aria-label={t('side.boardName')}
                        onChange={(e) => setEditing({ id: b.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                      <button type="submit" className="btn primary sm" disabled={!editing.name.trim()}>
                        {t('modal.save')}
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>
                        {t('modal.cancel')}
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="person-id">
                        <strong>{b.name}</strong>
                      </span>
                      {isHost && (
                        <span className="person-actions">
                          <button type="button" className="btn ghost sm" onClick={() => setEditing({ id: b.id, name: b.name })}>
                            {t('side.rename')}
                          </button>
                          <button
                            type="button"
                            className="person-x"
                            title={t('side.deleteBoard')}
                            aria-label={`${t('side.deleteBoard')}: ${b.name}`}
                            onClick={() =>
                              void run(async () => {
                                if (!window.confirm(t('side.deleteBoardConfirm', { name: b.name }))) return;
                                if (useSession.getState().board === b.id) await switchBoard(null, () => true);
                                await deleteBoard(b.id);
                              })
                            }
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isHost && !isPersonal && (
          <div className="field dlg-section">
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

/* ---------------- chọn phạm vi cho Danh sách / Lịch ---------------- */

/** Chọn xem việc của tất cả bảng, một dự án, hoặc một bảng */
export function ScopeSelect() {
  const t = useT();
  const projects = usePeople((s) => s.projects);
  const scope = useOverview((s) => s.scope);
  const setScope = useOverview((s) => s.setScope);
  return (
    <label className="scope-select">
      <span className="sr-only">{t('scope.label')}</span>
      <select value={scope} aria-label={t('scope.label')} onChange={(e) => setScope(e.target.value)}>
        <option value="all">{t('scope.all')}</option>
        {projects.map((p) => (
          <optgroup key={p.id} label={p.name}>
            <option value={`p:${p.id}`}>{t('scope.allProject', { name: p.name })}</option>
            {p.boards.map((b) => (
              <option key={b.id} value={`b:${b.id}`}>
                {p.name} · {b.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
