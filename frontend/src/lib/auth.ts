import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';
import { publicApi } from './api';

type CognitoConfig = {
  region: string;
  userPoolId: string;
  appClientId: string;
};

let pool: CognitoUserPool | null = null;
let poolInitPromise: Promise<void> | null = null;

async function ensurePoolInitialized(): Promise<CognitoUserPool> {
  if (pool) return pool;
  if (!poolInitPromise) {
    poolInitPromise = (async () => {
      const cfg: CognitoConfig = await publicApi.getCognitoConfig();
      // NOTE: region is not used by amazon-cognito-identity-js's user pool wrapper, but it is returned for completeness.
      pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.appClientId });
    })().catch((err) => {
      poolInitPromise = null;
      throw err;
    });
  }

  await poolInitPromise;
  if (!pool) throw new Error('Cognito is not configured.');
  return pool;
}

export type AuthSession = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  email: string | null;
  sub: string | null;
  emailVerified: boolean;
  expiresAtMs: number;
};

function sessionToAuthSession(s: CognitoUserSession): AuthSession {
  const idToken = s.getIdToken().getJwtToken();
  const accessToken = s.getAccessToken().getJwtToken();
  const refreshToken = s.getRefreshToken().getToken();
  const payload = s.getIdToken().payload as any;
  const exp = typeof payload?.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + 3600;
  return {
    idToken,
    accessToken,
    refreshToken,
    email: typeof payload?.email === 'string' ? payload.email : null,
    sub: typeof payload?.sub === 'string' ? payload.sub : null,
    emailVerified: payload?.email_verified === true || payload?.email_verified === 'true',
    expiresAtMs: exp * 1000
  };
}

export function getCurrentUser(): CognitoUser | null {
  return pool?.getCurrentUser() ?? null;
}

export async function getSession(): Promise<AuthSession | null> {
  await ensurePoolInitialized();
  const user = getCurrentUser();
  if (!user) return null;
  return new Promise((resolve, reject) => {
    user.getSession((err: any, session: CognitoUserSession | null) => {
      if (err) return reject(err);
      if (!session || !session.isValid()) return resolve(null);
      resolve(sessionToAuthSession(session));
    });
  });
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const userPool = await ensurePoolInitialized();
  const user = new CognitoUser({ Username: email.trim(), Pool: userPool });
  const authDetails = new AuthenticationDetails({ Username: email.trim(), Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(sessionToAuthSession(session)),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => reject(new Error('New password required.')),
      mfaRequired: () => reject(new Error('MFA required.')),
      totpRequired: () => reject(new Error('TOTP required.'))
    });
  });
}

export async function signUp(email: string, password: string): Promise<void> {
  const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email.trim() })];
  const userPool = await ensurePoolInitialized();
  return new Promise((resolve, reject) => {
    userPool.signUp(email.trim(), password, attrs, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const userPool = await ensurePoolInitialized();
  const user = new CognitoUser({ Username: email.trim(), Pool: userPool });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code.trim(), true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function forgotPassword(email: string): Promise<void> {
  const userPool = await ensurePoolInitialized();
  const user = new CognitoUser({ Username: email.trim(), Pool: userPool });
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
      inputVerificationCode: () => resolve()
    });
  });
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  const userPool = await ensurePoolInitialized();
  const user = new CognitoUser({ Username: email.trim(), Pool: userPool });
  return new Promise((resolve, reject) => {
    user.confirmPassword(code.trim(), newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err)
    });
  });
}

export function signOut(): void {
  // amazon-cognito-identity-js stores tokens in localStorage.
  // If we don't clear them, Cognito may appear "logged back in" after a redeploy.
  void (async () => {
    try {
      // Ensure we have access to the pool before attempting to sign out.
      // (If pool isn't initialized yet, pool?.getCurrentUser() would be null and signOut would be a no-op.)
      await ensurePoolInitialized();
      const user = pool?.getCurrentUser();
      user?.signOut();
    } catch {
      // best-effort
    } finally {
      try {
        for (const k of Object.keys(window.localStorage)) {
          if (k.startsWith('CognitoIdentityServiceProvider.')) {
            window.localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
      // Drop in-memory singleton so next call forces fresh init.
      pool = null;
      poolInitPromise = null;
    }
  })();
}

