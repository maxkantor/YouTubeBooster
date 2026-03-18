import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmSignUp, forgotPassword, signIn, signUp, confirmForgotPassword } from './lib/auth';
import { useAuth } from './AuthContext';

function useReturnTo() {
  const [sp] = useSearchParams();
  const returnTo = sp.get('returnTo') || '/dashboard';
  const channel = sp.get('channel') || '';
  const plan = sp.get('plan') || 'premium';
  return { returnTo, channel, plan };
}

export function SignInPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { returnTo } = useReturnTo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Sign in</h1>
        <p className="muted">Access your premium unlocks across all devices.</p>
        <div className="input-stack" style={{ marginTop: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          {error && <p className="error-text">{error}</p>}
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                await signIn(email, password);
                await refresh();
                nav(returnTo, { replace: true });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Sign in failed.');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <Link to={`/auth/forgot?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
              Forgot password?
            </Link>
            <Link to={`/auth/signup?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SignUpPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const { returnTo } = useReturnTo();
  const [step, setStep] = useState<'signup' | 'confirm'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const help = useMemo(() => {
    if (step === 'confirm') return 'Check your email for the verification code.';
    return 'Create your account to unlock and save your report across devices.';
  }, [step]);

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>{step === 'signup' ? 'Create account' : 'Verify email'}</h1>
        <p className="muted">{help}</p>
        <div className="input-stack" style={{ marginTop: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" disabled={step === 'confirm'} />
          {step === 'signup' ? (
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
          ) : (
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Verification code" />
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
                if (step === 'signup') {
                  await signUp(email, password);
                  setStep('confirm');
                } else {
                  await confirmSignUp(email, code);
                  // Auto sign-in after verification
                  await signIn(email, password);
                  await refresh();
                  nav(returnTo, { replace: true });
                }
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not continue.');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Working…' : step === 'signup' ? 'Create account' : 'Verify & continue'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <Link to={`/auth/signin?returnTo=${encodeURIComponent(returnTo)}`} className="muted" style={{ textDecoration: 'none' }}>
              Already have an account?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const { returnTo } = useReturnTo();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>Reset password</h1>
        <p className="muted">{step === 'request' ? 'Send a reset code to your email.' : 'Enter your code and new password.'}</p>
        <div className="input-stack" style={{ marginTop: 14 }}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
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

