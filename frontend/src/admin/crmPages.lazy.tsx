import { lazy } from 'react';

/** One shared dynamic import target keeps a single admin chunk; routes are nested under /admin in App.tsx. */
const m = () => import('./AdminCrmApp');

export const AdminHomePage = lazy(() => m().then((x) => ({ default: x.AdminHomePage })));
export const UsersPage = lazy(() => m().then((x) => ({ default: x.UsersPage })));
export const UserDetailPage = lazy(() => m().then((x) => ({ default: x.UserDetailPage })));
export const OrdersPage = lazy(() => m().then((x) => ({ default: x.OrdersPage })));
export const PaymentsPage = lazy(() => m().then((x) => ({ default: x.PaymentsPage })));
export const AuditsPage = lazy(() => m().then((x) => ({ default: x.AuditsPage })));
export const ContactListPage = lazy(() => m().then((x) => ({ default: x.ContactListPage })));
export const ContactTicketPage = lazy(() => m().then((x) => ({ default: x.ContactTicketPage })));
export const ActivityLogsPage = lazy(() => m().then((x) => ({ default: x.ActivityLogsPage })));
export const SystemLogsPage = lazy(() => m().then((x) => ({ default: x.SystemLogsPage })));
