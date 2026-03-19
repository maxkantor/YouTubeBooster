import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmSignUp, forgotPassword, signIn, signUp, confirmForgotPassword } from './lib/auth';
import { useAuth } from './AuthContext';
import { authApi } from './lib/api';

function readCachedEmail(): string {
  try {
    return window.localStorage.getItem('yb_last_email') ?? '';
  } catch {
    return '';
  }
}

function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

function countTrue(obj: Record<string, boolean>): number {
  return Object.values(obj).reduce((acc, v) => acc + (v ? 1 : 0), 0);
}

function useReturnTo() {
  const [sp] = useSearchParams();
  const rawReturnTo = sp.get('returnTo') || '/dashboard';
  const channel = sp.get('channel') || '';
  const plan = sp.get('plan') || 'premium';

  // Aggressive UX guard:
  // If we're being redirected back to checkout success without a session_id,
  // it's usually the "wrong screen" loop (common in mock checkout / missing query).
  // Send users to dashboard instead.
  let effectiveReturnTo = rawReturnTo;
  try {
    const url = new URL(rawReturnTo, window.location.origin);
    const isCheckoutSuccess = url.pathname === '/checkout/success';
    const sessionId = url.searchParams.get('session_id')?.trim() ?? '';
    if (isCheckoutSuccess && !sessionId) {
      effectiveReturnTo = '/dashboard';
    }
  } catch {
    // ignore parse errors
  }

  // Normalize trailing slashes to match client routes.
  effectiveReturnTo = effectiveReturnTo.replace(/\/+(?=[?#]|$)/g, '');
  return { returnTo: effectiveReturnTo, channel, plan };
}

export function SignInPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { returnTo } = useReturnTo();
  const [email, setEmail] = useState(() => readCachedEmail());
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedReturnTo = useMemo(() => {
    // Normalize URLs so `/dashboard/` doesn't accidentally miss a client route.
    const raw = (returnTo || '/dashboard').trim();
    return raw.replace(/\/+(?=[?#]|$)/g, '');
  }, [returnTo]);

  // Keep the last email typed so redirects/errors don't force users to retype.
  useEffect(() => {
    try {
      window.localStorage.setItem('yb_last_email', email);
    } catch {
      // ignore
    }
  }, [email]);

  const onEmailFocus = () => {
    // Defensive: if anything ever resets our controlled input to "", rehydrate from cache.
    if (!email.trim()) setEmail(readCachedEmail());
  };

  return (
    <div className="page narrow-page">
      <div className="surface">
        <div className="auth-header">
          <div className="auth-badge">Premium Access</div>
          <h1 className="auth-title">Sign in</h1>
          <p className="muted">Unlock across all devices. No device lock-in.</p>
        </div>

        <form
          className="input-stack auth-form"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (loading) return;

            const emailVal = emailInputRef.current?.value ?? email;
            const passwordVal = passwordInputRef.current?.value ?? password;
            const emailTrimmed = emailVal.trim();
            if (!emailTrimmed || !passwordVal) {
              setError('Enter your email and password.');
              return;
            }

            setLoading(true);
            setError('');
            try {
              // Keep controlled inputs in sync in case Chrome autofill mutated DOM values.
              setEmail(emailTrimmed);
              setPassword(passwordVal);

              const session = await signIn(emailTrimmed, passwordVal);
              await authApi.cognitoLogin(session.idToken);
              // Hard navigation to fully re-run route guards after backend sets cookies.
              // This prevents the SPA race where `/dashboard` renders before `/api/auth/session` confirms.
              window.location.replace(normalizedReturnTo);
            } catch (e) {
              const anyErr = e as any;
              const code = anyErr?.code ?? anyErr?.name;
              const msg = anyErr?.message as string | undefined;

              // Avoid account-enumeration style messaging (e.g. "User is not confirmed" / "User exists").
              if (
                code === 'UserNotConfirmedException' ||
                (code === 'NotAuthorizedException' && msg && /not\s*confirmed|unconfirmed/i.test(msg)) ||
                (msg && /not\s*confirmed|unconfirmed/i.test(msg))
              ) {
                setError('Sign in failed.');
              } else if (code === 'NotAuthorizedException') {
                setError('Invalid email or password.');
              } else if (e instanceof Error && e.message) {
                setError('Sign in failed.');
                // Keep the underlying details in DevTools without exposing them to users.
                console.warn('Sign in failed (suppressed message):', { code, message: e.message });
              } else {
                setError('Sign in failed.');
              }
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="field-block">
            <label className="field-label" htmlFor="auth-signin-email">
              Email
            </label>
            <input
              id="auth-signin-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              onFocus={onEmailFocus}
              placeholder="you@example.com"
              ref={emailInputRef}
            />
          </div>

          <div className="field-block">
            <label className="field-label" htmlFor="auth-signin-password">
              Password
            </label>
            <input
              id="auth-signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              placeholder="Your password"
              ref={passwordInputRef}
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="auth-links">
            <Link to={`/auth/forgot?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
              Forgot password?
            </Link>
            <Link to={`/auth/signup?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SignUpPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { returnTo } = useReturnTo();
  const [step, setStep] = useState<'signup' | 'confirm'>('signup');
  const [email, setEmail] = useState(() => readCachedEmail());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Ensure keyboard focus is moved to the top of the Sign Up view after redirect.
    window.scrollTo(0, 0);
    const t = window.setTimeout(() => {
      if (step === 'signup') {
        emailInputRef.current?.focus();
      } else {
        codeInputRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [step]);

  useEffect(() => {
    try {
      window.localStorage.setItem('yb_last_email', email);
    } catch {
      // ignore
    }
  }, [email]);

  useEffect(() => {
    // UX requirement: while verifying, prevent navigating away via global navbar links.
    if (step !== 'confirm') return;
    const globalNav = document.querySelector('nav.top-nav') as HTMLElement | null;
    if (!globalNav) return;

    const prev = globalNav.style.pointerEvents;
    globalNav.style.pointerEvents = 'none';

    return () => {
      globalNav.style.pointerEvents = prev;
    };
  }, [step]);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const checkCount = useMemo(() => countTrue(checks), [checks]);
  const passwordStrengthLabel = checkCount <= 2 ? 'Weak' : checkCount === 3 ? 'Good' : 'Strong';

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canCreateAccount = checkCount === 5 && passwordsMatch;

  const onEmailFocus = () => {
    if (!email.trim()) setEmail(readCachedEmail());
  };

  const help = useMemo(() => {
    if (step === 'confirm') return 'Check your email for the verification code.';
    return 'Create your account to unlock and save your report across devices.';
  }, [step]);

  return (
    <div className="page narrow-page">
      <div className="surface">
        <div className="auth-header">
          <div className="auth-badge">{step === 'signup' ? 'Create Account' : 'Verify Email'}</div>
          <h1 className="auth-title">{step === 'signup' ? 'Create account' : 'Verify email'}</h1>
          <p className="muted">{help}</p>
        </div>

        <div className="input-stack auth-form" style={{ marginTop: 16 }}>
          <div className="field-block">
            <label className="field-label" htmlFor="auth-signup-email">
              Email
            </label>
            <input
              id="auth-signup-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              ref={emailInputRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={onEmailFocus}
              placeholder="you@example.com"
              disabled={step === 'confirm'}
            />
          </div>

          {step === 'signup' ? (
            <>
              <div className="field-block">
                <label className="field-label" htmlFor="auth-signup-password">
                  Password
                </label>
                <input
                  id="auth-signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                />
              </div>

              <div className="field-block">
                <label className="field-label" htmlFor="auth-signup-password-confirm">
                  Confirm password
                </label>
                <input
                  id="auth-signup-password-confirm"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                />
              </div>

              <div className="auth-pass-meter">
                <div className="auth-pass-meter-top">
                  <span className="muted">Strength</span>
                  <span className={canCreateAccount ? 'auth-pass-strength-ok' : 'auth-pass-strength'}>{passwordStrengthLabel}</span>
                </div>
                <div className="auth-pass-bar" aria-label="Password strength">
                  <div className="auth-pass-bar-inner" style={{ width: `${Math.round((checkCount / 5) * 100)}%` }} />
                </div>
              </div>

              <div className="auth-validation-box" aria-live="polite">
                <div className="auth-validation-title">Requirements</div>
                <ul className="auth-validation-list">
                  <li className={checks.length ? 'ok' : 'no'}>
                    <span className="dot" /> 8+ characters
                  </li>
                  <li className={checks.lower ? 'ok' : 'no'}>
                    <span className="dot" /> Lowercase letter
                  </li>
                  <li className={checks.upper ? 'ok' : 'no'}>
                    <span className="dot" /> Uppercase letter
                  </li>
                  <li className={checks.number ? 'ok' : 'no'}>
                    <span className="dot" /> Number
                  </li>
                  <li className={checks.special ? 'ok' : 'no'}>
                    <span className="dot" /> Special character
                  </li>
                </ul>
                {!passwordsMatch && confirmPassword.length > 0 && <p className="error-text" style={{ marginTop: 10 }}>Passwords do not match.</p>}
              </div>
            </>
          ) : (
            <div className="field-block">
              <label className="field-label" htmlFor="auth-signup-code">
                Verification code
              </label>
              <input
                id="auth-signup-code"
                name="code"
                ref={codeInputRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
            </div>
          )}
          {error && <p className="error-text">{error}</p>}

          <button
            type="button"
            className="btn btn-primary"
            disabled={
              loading ||
              !email.trim() ||
              (step === 'signup' ? !canCreateAccount : !code.trim())
            }
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                if (step === 'signup') {
                  await signUp(email, password);
                  setStep('confirm');
                } else {
                  await confirmSignUp(email, code);
                  // Auto sign-in after verification
                  const session = await signIn(email, password);
                  // Best-effort backend session exchange.
                  // If it fails (e.g. transient 401), we still want the user to proceed.
                  try {
                    await authApi.cognitoLogin(session.idToken);
                  } catch (err) {
                    console.warn('cognitoLogin failed after verify (suppressed):', err);
                  }
                  await refresh();
                  nav(returnTo, { replace: true });
                }
              } catch (e) {
                const anyErr = e as any;
                const codeId = anyErr?.code ?? anyErr?.name;
                const msg = anyErr?.message as string | undefined;

                // Avoid leaking whether an account/email exists.
                if (codeId === 'UsernameExistsException' || (msg && /already exists|user exists/i.test(msg))) {
                  setError('An account with this email already exists. Please sign in (or reset your password).');
                } else {
                  setError('Could not continue.');
                  console.warn('Sign up flow failed (suppressed message):', { code: codeId, message: anyErr?.message });
                }
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Working…' : step === 'signup' ? 'Create account' : 'Verify & continue'}
          </button>

          {step === 'signup' ? (
            <div className="auth-links">
              <Link to={`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
                Already have an account?
              </Link>
            </div>
          ) : (
            <div className="auth-links" aria-hidden="true" style={{ opacity: 0.9 }}>
              <span className="muted">Verification in progress</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const { returnTo } = useReturnTo();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(() => readCachedEmail());
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      window.localStorage.setItem('yb_last_email', email);
    } catch {
      // ignore
    }
  }, [email]);

  const onEmailFocus = () => {
    if (!email.trim()) setEmail(readCachedEmail());
  };

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Reset password</h1>
        <p className="muted">{step === 'request' ? 'Send a reset code to your email.' : 'Enter your code and new password.'}</p>
        <div className="input-stack" style={{ marginTop: 14 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            autoComplete="email"
            name="email"
            inputMode="email"
            onFocus={onEmailFocus}
          />
          {step === 'reset' && (
            <>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Reset code" />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" type="password" />
            </>
          )}
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                if (step === 'request') {
                  await forgotPassword(email);
                  setStep('reset');
                } else {
                  await confirmForgotPassword(email, code, newPassword);
                  nav(`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not reset password.');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Working…' : step === 'request' ? 'Send reset code' : 'Set new password'}
          </button>
        </div>
      </div>
    </div>
  );
}

