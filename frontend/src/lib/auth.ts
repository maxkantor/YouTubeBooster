import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
  CognitoUserAttribute
} from 'amazon-cognito-identity-js';

type CognitoConfig = {
  region: string;
  userPoolId: string;
  appClientId: string;
};

function getConfig(): CognitoConfig {
  const region = import.meta.env.VITE_COGNITO_REGION as string | undefined;
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
  const appClientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID as string | undefined;
  if (!region || !userPoolId || !appClientId) {
    throw new Error('Cognito is not configured (missing VITE_COGNITO_* env vars).');
  }
  return { region, userPoolId, appClientId };
}

const pool = (() => {
  try {
    const cfg = getConfig();
    return new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.appClientId });
  } catch {
    return null;
  }
})();

function requirePool(): CognitoUserPool {
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
  return requirePool().getCurrentUser();
}

export function getSession(): Promise<AuthSession | null> {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    user.getSession((err: any, session: CognitoUserSession | null) => {
      if (err) return reject(err);
      if (!session || !session.isValid()) return resolve(null);
      resolve(sessionToAuthSession(session));
    });
  });
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const user = new CognitoUser({ Username: email.trim(), Pool: requirePool() });
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
  return new Promise((resolve, reject) => {
    requirePool().signUp(email.trim(), password, attrs, [], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email.trim(), Pool: requirePool() });
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code.trim(), true, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = new CognitoUser({ Username: email.trim(), Pool: requirePool() });
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
      inputVerificationCode: () => resolve()
    });
  });
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  const user = new CognitoUser({ Username: email.trim(), Pool: requirePool() });
  return new Promise((resolve, reject) => {
    user.confirmPassword(code.trim(), newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err)
    });
  });
}

export function signOut(): void {
  const user = pool?.getCurrentUser();
  user?.signOut();
}

