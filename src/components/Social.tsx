/**
 * Kết bạn (tìm qua email) và dự án dùng chung:
 *  - FriendsButton: nút trên thanh trên cùng, mở danh sách bạn bè / lời mời
 *  - ProjectSwitcher: chọn bảng cá nhân hoặc một dự án, tạo / quản lý dự án
 *  - ProjectDialog: tạo dự án, đổi tên, thêm/bớt thành viên (host), rời / xoá dự án
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT, type TKey } from '../i18n';
import { ApiError, type ApiUser } from '../sync/api';
import {
  acceptFriend,
  addMember,
  createProject,
  deleteProject,
  loadMembers,
  refreshPeople,
  removeFriend,
  removeMember,
  renameProject,
  requestFriend,
  usePeople,
} from '../sync/people';
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

/* ---------------- chọn bảng / dự án ---------------- */

export function ProjectSwitcher() {
  const t = useT();
  const project = useSession((s) => s.project);
  const switching = useSession((s) => s.switching);
  const projects = usePeople((s) => s.projects);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'manage' | null>(null);
  const ref = usePopover(open, () => setOpen(false));
  const current = projects.find((p) => p.id === project);

  const go = async (id: string | null) => {
    setOpen(false);
    const ok = await switchBoard(id, () => window.confirm(t('sync.logoutConfirm')));
    if (ok) await refreshPeople();
  };

  return (
    <div className="settings project-switch" ref={ref}>
      <button type="button" className="project-btn" aria-expanded={open} disabled={switching} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          {project ? <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" /> : <circle cx="8" cy="6" r="2.6" />}
          {!project && <path d="M3.2 13.5c.6-2.2 2.5-3.5 4.8-3.5s4.2 1.3 4.8 3.5" strokeLinecap="round" />}
        </svg>
        <span className="project-name">{current ? current.name : t('social.personal')}</span>
        {current?.role === 'host' && <span className="role-badge is-host">{t('social.host')}</span>}
        <svg className="project-caret" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="popover project-menu" role="menu">
          <button type="button" role="menuitem" className={`menu-item${project === null ? ' is-current' : ''}`} onClick={() => void go(null)}>
            {t('social.personal')}
          </button>
          {projects.length > 0 && <div className="menu-label">{t('social.projects')}</div>}
          {projects.map((p) => (
            <button key={p.id} type="button" role="menuitem" className={`menu-item${p.id === project ? ' is-current' : ''}`} onClick={() => void go(p.id)}>
              <span className="project-item-name">{p.name}</span>
              <span className={`role-badge${p.role === 'host' ? ' is-host' : ''}`}>{p.role === 'host' ? t('social.host') : t('social.member')}</span>
              <span className="project-count">{p.memberCount}</span>
            </button>
          ))}
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              setDialog('create');
            }}
          >
            ＋ {t('social.newProject')}
          </button>
          {current && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                setDialog('manage');
              }}
            >
              {t('social.manageProject')}
            </button>
          )}
        </div>
      )}
      {dialog === 'create' && (
        <CreateProjectDialog
          onClose={() => setDialog(null)}
          onCreated={async (id) => {
            setDialog(null);
            await go(id);
          }}
        />
      )}
      {dialog === 'manage' && current && <ManageProjectDialog projectId={current.id} onClose={() => setDialog(null)} onLeft={() => go(null)} />}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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

function CreateProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const p = await createProject(name);
      onCreated(p.id);
    } catch (err) {
      setError(t(errKey(err)));
      setBusy(false);
    }
  };
  return (
    <Dialog title={t('social.newProject')} onClose={onClose}>
      <form className="project-form" onSubmit={submit}>
        <label className="field">
          <span>{t('social.projectName')}</span>
          <input id="project-name" autoFocus maxLength={80} value={name} placeholder={t('social.projectNamePh')} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="hint">{t('social.newProjectHint')}</p>
        {error && <small className="error">{error}</small>}
        <footer className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('modal.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            {t('social.create')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function ManageProjectDialog({ projectId, onClose, onLeft }: { projectId: string; onClose: () => void; onLeft: () => void }) {
  const t = useT();
  const me = useSession((s) => s.user);
  const { members, friends, projects } = usePeople();
  const project = projects.find((p) => p.id === projectId);
  const isHost = project?.role === 'host';
  const [name, setName] = useState(project?.name ?? '');
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMembers(projectId);
  }, [projectId]);

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
                    onClick={() => void run(() => removeMember(projectId, m.id))}
                  >
                    ×
                  </button>
                )}
              </PersonRow>
            ))}
          </ul>
        </div>

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
                      await addMember(projectId, pick);
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
