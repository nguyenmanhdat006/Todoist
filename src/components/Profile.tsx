import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useT, type TKey } from '../i18n';
import { api, ApiError, type AdminUser, type Role } from '../sync/api';
import { applyUser, useSession } from '../sync/session';
import { toast } from '../toast';
import { Avatar } from './Avatar';
import { Dialog } from './Social';
import '../profile.css';

const PROFILE_ERRORS = [
  'invalid_name',
  'wrong_password',
  'weak_password',
  'invalid_password',
  'too_many_attempts',
  'forbidden',
  'self_change',
  'not_found',
] as const;

function errKey(e: unknown): TKey {
  const code = e instanceof ApiError ? e.code : 'network';
  if ((PROFILE_ERRORS as readonly string[]).includes(code)) return `profile.err.${code}` as TKey;
  return code === 'network' ? 'err.network' : 'err.server_error';
}

export function RoleBadge({ role }: { role: Role | undefined }) {
  const t = useT();
  if (!role) return null;
  return <span className={`role-chip is-${role}`}>{t(role === 'admin' ? 'profile.roleAdmin' : 'profile.roleUser')}</span>;
}

/* ---------------- sửa hồ sơ của chính mình ---------------- */

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const user = useSession((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  if (!user) return null;
  const nameDirty = name.trim() !== user.name && name.trim().length > 0;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameDirty || nameBusy) return;
    setNameBusy(true);
    setNameError(null);
    try {
      const { user: updated } = await api.updateProfile(name.trim());
      applyUser({ ...user, ...updated });
      setName(updated.name);
      toast.success('profile.saved');
    } catch (err) {
      setNameError(t(errKey(err)));
    } finally {
      setNameBusy(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    if (next !== again) {
      setPwError(t('profile.mismatch'));
      return;
    }
    setPwBusy(true);
    setPwError(null);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      toast.success('profile.passwordSaved');
    } catch (err) {
      setPwError(t(errKey(err)));
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Dialog title={t('profile.title')} onClose={onClose}>
      <div className="profile-hero">
        <Avatar user={user} size={56} title="" />
        <span className="profile-hero-id">
          <strong>{user.name || user.email.split('@')[0]}</strong>
          <span>{user.email}</span>
        </span>
        <RoleBadge role={user.role} />
      </div>

      <form className="project-form" onSubmit={saveName}>
        <div className="field dlg-section">
          <span>{t('profile.name')}</span>
          <div className="social-add-row">
            <input
              id="profile-name"
              value={name}
              maxLength={80}
              autoComplete="name"
              aria-label={t('profile.name')}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn primary sm" disabled={!nameDirty || nameBusy}>
              {t('profile.save')}
            </button>
          </div>
          {nameError && <small className="error">{nameError}</small>}
        </div>
        <div className="field dlg-section">
          <span>{t('profile.email')}</span>
          <input value={user.email} readOnly disabled aria-label={t('profile.email')} />
          <p className="hint">{t('profile.emailHint')}</p>
        </div>
      </form>

      <form className="project-form profile-password" onSubmit={savePassword}>
        <div className="field dlg-section">
          <span>{t('profile.passwordTitle')}</span>
          <input
            type="password"
            value={current}
            autoComplete="current-password"
            placeholder={t('profile.current')}
            aria-label={t('profile.current')}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <input
            type="password"
            value={next}
            autoComplete="new-password"
            placeholder={t('profile.new')}
            aria-label={t('profile.new')}
            onChange={(e) => setNext(e.target.value)}
          />
          <input
            type="password"
            value={again}
            autoComplete="new-password"
            placeholder={t('profile.confirm')}
            aria-label={t('profile.confirm')}
            onChange={(e) => setAgain(e.target.value)}
          />
          {pwError && <small className="error">{pwError}</small>}
        </div>
        <footer className="modal-foot">
          <button type="submit" className="btn primary" disabled={pwBusy || !current || !next || !again}>
            {t('profile.changePassword')}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('data.close')}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

/* ---------------- quản lý người dùng (admin) ---------------- */

export function AdminDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useSession((s) => s.user);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminUsers()
      .then((r) => setUsers(r.users))
      .catch((err) => setError(t(errKey(err))));
  }, [t]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q));
  }, [users, query]);

  const update = async (u: AdminUser, patch: { role?: Role; disabled?: boolean }) => {
    setBusy(u.id);
    setError(null);
    try {
      const { user } = await api.adminUpdateUser(u.id, patch);
      setUsers((list) => (list ?? []).map((x) => (x.id === user.id ? user : x)));
      const who = user.name || user.email;
      if (patch.role) toast.success('admin.roleChanged', { name: who, role: t(patch.role === 'admin' ? 'profile.roleAdmin' : 'profile.roleUser') });
      else toast.success(patch.disabled ? 'admin.locked' : 'admin.unlocked', { name: who });
    } catch (err) {
      setError(t(errKey(err)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog title={t('admin.title')} onClose={onClose}>
      <div className="admin-bar">
        <input
          className="admin-search"
          value={query}
          placeholder={t('admin.search')}
          aria-label={t('admin.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {users && <span className="admin-count">{t('admin.count', { n: users.length })}</span>}
      </div>
      {error && <small className="error">{error}</small>}
      <ul className="admin-list">
        {users && shown.length === 0 && <li className="admin-empty">{t('admin.empty')}</li>}
        {shown.map((u) => {
          const self = u.id === me?.id;
          const who = u.name || u.email;
          return (
            <li key={u.id} className={`admin-row${u.disabled ? ' is-disabled' : ''}`}>
              <Avatar user={u} size={34} />
              <span className="admin-id">
                <strong>
                  {who}
                  {self && <span className="admin-you">{t('admin.you')}</span>}
                  {u.disabled && <span className="admin-locked">{t('admin.disabled')}</span>}
                </strong>
                <span>
                  {u.email} · {t('admin.joined', { date: new Date(u.createdAt).toLocaleDateString(t.locale) })}
                </span>
              </span>
              <select
                className="admin-role"
                value={u.role}
                disabled={self || busy === u.id}
                aria-label={t('profile.role')}
                onChange={(e) => void update(u, { role: e.target.value as Role })}
              >
                <option value="user">{t('profile.roleUser')}</option>
                <option value="admin">{t('profile.roleAdmin')}</option>
              </select>
              <button
                type="button"
                className={`btn sm ${u.disabled ? 'ghost' : 'danger-ghost'}`}
                disabled={self || busy === u.id}
                onClick={() => {
                  if (!u.disabled && !window.confirm(t('admin.lockConfirm', { name: who }))) return;
                  void update(u, { disabled: !u.disabled });
                }}
              >
                {t(u.disabled ? 'admin.unlock' : 'admin.lock')}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="modal-foot">
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('data.close')}
        </button>
      </footer>
    </Dialog>
  );
}
