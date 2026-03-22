import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../lib/api';
import { useAdminSessionContext } from './AdminSessionContext';

/** Session + sign-out for all /admin CRM screens (nested routes + Outlet). */
export function useAdminCrm() {
  const { adminSession, refreshAdminSession } = useAdminSessionContext();
  const navigate = useNavigate();

  const onSignOut = useCallback(async () => {
    await adminApi.logout();
    await refreshAdminSession();
    navigate('/admin/login', { replace: true });
  }, [refreshAdminSession, navigate]);

  return { adminSession, onSignOut };
}
