import { createContext, useContext, type ReactNode } from 'react';
import type { AdminSessionStatus } from '../types';

export type AdminSessionContextValue = {
  adminSession: AdminSessionStatus;
  refreshAdminSession: () => Promise<AdminSessionStatus>;
  sessionLoading: boolean;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({
  value,
  children
}: {
  value: AdminSessionContextValue;
  children: ReactNode;
}) {
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSessionContext(): AdminSessionContextValue {
  const v = useContext(AdminSessionContext);
  if (!v) {
    throw new Error('useAdminSessionContext must be used within AdminSessionProvider');
  }
  return v;
}
