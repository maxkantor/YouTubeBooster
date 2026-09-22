import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/api';
import { useAdminSessionContext } from './AdminSessionContext';

/** Session + sign-out for all /admin CRM screens (nested routes + Outlet). */
export function useAdminCrm() {
  const { adminSession, refreshAdminSession } = useAdminSessionContext();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      try {
        await adminApi.logout();
      } catch {
        // Still clear local session even if the network call fails.
      }
      await refreshAdminSession();
      navigate('/admin/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }, [refreshAdminSession, navigate, signingOut]);

  return { adminSession, onSignOut, signingOut };
}
