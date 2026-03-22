import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminCrmLoadingSurface, AdminRoute } from './AdminRoute';
import { useAdminSessionContext } from './AdminSessionContext';
import './admin-crm.css';

/**
 * Parent for all nested /admin/* CRM routes. Single Outlet — no second &lt;Routes&gt; tree
 * (nested absolute paths were unreliable and could render nothing = blank screen).
 */
export function AdminCrmGate() {
  const { adminSession, sessionLoading } = useAdminSessionContext();
  return (
    <AdminRoute adminSession={adminSession} loading={sessionLoading}>
      <Suspense
        fallback={<AdminCrmLoadingSurface title="Loading admin" detail="Opening CRM…" />}
      >
        <Outlet />
      </Suspense>
    </AdminRoute>
  );
}
