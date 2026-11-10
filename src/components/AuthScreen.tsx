import { useState, type FormEvent, type ReactNode } from 'react';
import { useT, type TKey } from '../i18n';
import { ApiError } from '../sync/api';
import { boot, login, register, useSession } from '../sync/session';
import { LangSwitch, ThemeSwitch } from './TopbarWidgets';
import '../auth.css';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="16" height="16">
        <rect x="2.5" y="3" width="4" height="14" rx="1.2" fill="currentColor" />
        <rect x="8" y="3" width="4" height="9" rx="1.2" fill="currentColor" opacity=".8" />
        <rect x="13.5" y="3" width="4" height="11.5" rx="1.2" fill="currentColor" opacity=".6" />
      </svg>
    </span>
  );
}

const KNOWN_ERRORS = [
  'account_disabled',
  'invalid_email',
  'weak_password',
  'invalid_password',
  'email_taken',
  'wrong_credentials',
  'too_many_attempts',
  'network',
  'no_database',
] as const;

export function errorKey(code: string | null | undefined): TKey {
  return (KNOWN_ERRORS as readonly string[]).includes(code ?? '') ? (`err.${code}` as TKey) : 'err.server_error';
}

function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth-page">
      <div className="auth-tools">
        <LangSwitch />
        <ThemeSwitch />
      </div>
      <main className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <span className="brand-name">{t('app.name')}</span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function SplashScreen() {
  const t = useT();
  return (
    <Shell>
      <p className="auth-checking" role="status">
        <span className="auth-spinner" aria-hidden="true" />
        {t('auth.checking')}
      </p>
    </Shell>
  );
}

export function AuthScreen() {
  const t = useT();
  const bootError = useSession((s) => s.bootError);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(bootError);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
      setBusy(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
  };

  return (
    <Shell>
      <p className="auth-tagline">{t('auth.tagline')}</p>
      <div className="auth-tabs" role="tablist">
        {(['login', 'register'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => switchMode(m)}>
            {t(m === 'login' ? 'auth.login' : 'auth.register')}
          </button>
        ))}
      </div>

      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>{t('auth.email')}</span>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode === 'register' && (
          <label className="field">
            <span>
              {t('auth.name')} <em className="auth-optional">({t('auth.optional')})</em>
            </span>
            <input id="auth-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>{t('auth.password')}</span>
          <div className="auth-password">
            <input
              id="auth-password"
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="auth-eye" aria-label={show ? t('auth.hide') : t('auth.show')} title={show ? t('auth.hide') : t('auth.show')} onClick={() => setShow((v) => !v)}>
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
                <circle cx="8" cy="8" r="2.2" />
                {show && <path d="M2.5 2.5l11 11" />}
              </svg>
            </button>
          </div>
          {mode === 'register' && <small className="hint">{t('auth.passwordHint')}</small>}
        </label>

        {error && (
          <div className="auth-error" role="alert">
            {t(errorKey(error))}
            {error === 'network' && (
              <button type="button" className="auth-link" onClick={() => void boot()}>
                {t('auth.retry')}
              </button>
            )}
          </div>
        )}

        <button type="submit" className="btn primary auth-submit" disabled={busy}>
          {busy ? t('auth.working') : t(mode === 'login' ? 'auth.submitLogin' : 'auth.submitRegister')}
        </button>
      </form>

      <p className="auth-switch">
        {t(mode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
        <button type="button" className="auth-link" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
          {t(mode === 'login' ? 'auth.register' : 'auth.login')}
        </button>
      </p>
    </Shell>
  );
}
