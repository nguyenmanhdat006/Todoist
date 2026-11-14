import { useSlow } from '../useSlow';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useT, type TKey } from '../i18n';
import { api, ApiError } from '../sync/api';
import { toast } from '../toast';
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
  'invalid_token',
  'mail_not_configured',
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
  const slow = useSlow(true);
  return (
    <Shell>
      <p className="auth-checking" role="status">
        <span className="auth-spinner" aria-hidden="true" />
        {t('auth.checking')}
      </p>
      {slow && <p className="auth-slow">{t('auth.waking')}</p>}
    </Shell>
  );
}

/** Token đặt lại mật khẩu trong liên kết email (?reset=...) */
function readResetToken(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('reset');
  } catch {
    return null;
  }
}

function clearResetParam() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* bỏ qua */
  }
}

export function AuthScreen() {
  const t = useT();
  const bootError = useSession((s) => s.bootError);
  const [view, setView] = useState<'main' | 'forgot' | 'reset'>(() => (readResetToken() ? 'reset' : 'main'));
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(bootError);
  const slow = useSlow(busy);

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

  if (view === 'forgot') {
    return (
      <Shell>
        <ForgotForm
          initialEmail={email}
          onBack={() => {
            setView('main');
            setMode('login');
          }}
          onEmail={setEmail}
        />
      </Shell>
    );
  }
  if (view === 'reset') {
    return (
      <Shell>
        <ResetForm
          token={readResetToken() ?? ''}
          onDone={(mail) => {
            clearResetParam();
            if (mail) setEmail(mail);
            setPassword('');
            setMode('login');
            setView('main');
            toast.success('auth.resetDone');
          }}
          onRequestNew={() => {
            clearResetParam();
            setView('forgot');
          }}
          onBack={() => {
            clearResetParam();
            setMode('login');
            setView('main');
          }}
        />
      </Shell>
    );
  }

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
          {mode === 'login' && (
            <button type="button" className="auth-link auth-forgot" onClick={() => setView('forgot')}>
              {t('auth.forgot')}
            </button>
          )}
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

        <button type="submit" className={`btn primary auth-submit${busy ? ' is-busy' : ''}`} disabled={busy} aria-busy={busy}>
          {busy && <span className="btn-spinner" aria-hidden="true" />}
          {busy ? t('auth.working') : t(mode === 'login' ? 'auth.submitLogin' : 'auth.submitRegister')}
        </button>
        {busy && slow && <p className="auth-slow" role="status">{t('auth.waking')}</p>}
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

/* ---------------- quên mật khẩu ---------------- */

function ForgotForm({ initialEmail, onBack, onEmail }: { initialEmail: string; onBack: () => void; onEmail: (v: string) => void }) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useSlow(busy);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim(), t.lang);
      onEmail(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'server_error');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <div className="auth-sent" role="status">
          <span className="auth-sent-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="4.5" width="15" height="11" />
              <path d="M3 5.5l7 5.5 7-5.5" />
            </svg>
          </span>
          <h1 className="auth-title">{t('auth.sentTitle')}</h1>
          <p className="auth-tagline">{t('auth.sentBody', { email: email.trim() })}</p>
          <p className="hint">{t('auth.sentHint')}</p>
        </div>
        <button type="button" className="btn primary auth-submit" onClick={onBack}>
          {t('auth.backToLogin')}
        </button>
        <p className="auth-switch">
          <button type="button" className="auth-link" onClick={() => setSent(false)}>
            {t('auth.resend')}
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">{t('auth.forgotTitle')}</h1>
      <p className="auth-tagline">{t('auth.forgotIntro')}</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>{t('auth.email')}</span>
          <input id="forgot-email" type="email" autoComplete="email" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && (
          <div className="auth-error" role="alert">
            {t(errorKey(error))}
          </div>
        )}
        <button type="submit" className={`btn primary auth-submit${busy ? ' is-busy' : ''}`} disabled={busy || !email.trim()} aria-busy={busy}>
          {busy && <span className="btn-spinner" aria-hidden="true" />}
          {busy ? t('auth.working') : t('auth.sendLink')}
        </button>
        {busy && slow && <p className="auth-slow" role="status">{t('auth.waking')}</p>}
      </form>
      <p className="auth-switch">
        <button type="button" className="auth-link" onClick={onBack}>
          ← {t('auth.backToLogin')}
        </button>
      </p>
    </>
  );
}

/* ---------------- đặt lại mật khẩu từ liên kết trong email ---------------- */

function ResetForm({ token, onDone, onRequestNew, onBack }: { token: string; onDone: (email: string | null) => void; onRequestNew: () => void; onBack: () => void }) {
  const t = useT();
  const [state, setState] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .resetCheck(token)
      .then((r) => {
        if (!alive) return;
        setEmail(r.email);
        setState('ok');
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.code === 'invalid_token') setState('invalid');
        else {
          setError(err instanceof ApiError ? err.code : 'server_error');
          setState('invalid');
        }
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== again) {
      setError('mismatch');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      onDone(email);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server_error';
      if (code === 'invalid_token') setState('invalid');
      else setError(code);
      setBusy(false);
    }
  };

  if (state === 'checking') {
    return (
      <p className="auth-checking" role="status">
        <span className="auth-spinner" aria-hidden="true" />
        {t('auth.resetChecking')}
      </p>
    );
  }

  if (state === 'invalid') {
    return (
      <>
        <h1 className="auth-title">{t('auth.invalidLinkTitle')}</h1>
        <p className="auth-tagline">{error && error !== 'invalid_token' ? t(errorKey(error)) : t('auth.invalidLinkBody')}</p>
        <button type="button" className="btn primary auth-submit" onClick={onRequestNew}>
          {t('auth.requestNew')}
        </button>
        <p className="auth-switch">
          <button type="button" className="auth-link" onClick={onBack}>
            ← {t('auth.backToLogin')}
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">{t('auth.resetTitle')}</h1>
      <p className="auth-tagline">{t('auth.resetIntro', { email: email ?? '' })}</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>{t('auth.newPassword')}</span>
          <div className="auth-password">
            <input id="reset-password" type={show ? 'text' : 'password'} autoComplete="new-password" required autoFocus minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="auth-eye" aria-label={show ? t('auth.hide') : t('auth.show')} title={show ? t('auth.hide') : t('auth.show')} onClick={() => setShow((v) => !v)}>
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
                <circle cx="8" cy="8" r="2.2" />
                {show && <path d="M2.5 2.5l11 11" />}
              </svg>
            </button>
          </div>
          <small className="hint">{t('auth.passwordHint')}</small>
        </label>
        <label className="field">
          <span>{t('auth.confirmPassword')}</span>
          <input id="reset-again" type={show ? 'text' : 'password'} autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {error && (
          <div className="auth-error" role="alert">
            {error === 'mismatch' ? t('auth.mismatch') : t(errorKey(error))}
          </div>
        )}
        <button type="submit" className={`btn primary auth-submit${busy ? ' is-busy' : ''}`} disabled={busy || !password || !again} aria-busy={busy}>
          {busy && <span className="btn-spinner" aria-hidden="true" />}
          {busy ? t('auth.working') : t('auth.resetSubmit')}
        </button>
      </form>
    </>
  );
}
