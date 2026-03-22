import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { AdminSessionStatus } from '../types';

export function AdminCrmLoadingSurface({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="page narrow-page">
      <div className="surface">
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

export function AdminRoute({
  adminSession,
  loading,
  children
}: {
  adminSession: AdminSessionStatus;
  loading: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <AdminCrmLoadingSurface title="Checking admin session" detail="Loading protected CRM access." />
    );
  }
  if (!adminSession.authenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}
