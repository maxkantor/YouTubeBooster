import { lazy } from 'react';

/** One shared dynamic import target keeps a single admin chunk; routes are nested under /admin in App.tsx. */
const m = () => import('./AdminCrmApp');

export const AdminHomePage = lazy(() => m().then((x) => ({ default: x.AdminHomePage })));
export const UsersPage = lazy(() => m().then((x) => ({ default: x.UsersPage })));
export const UserDetailPage = lazy(() => m().then((x) => ({ default: x.UserDetailPage })));
export const PaymentsPage = lazy(() => m().then((x) => ({ default: x.PaymentsPage })));
export const AuditsPage = lazy(() => m().then((x) => ({ default: x.AuditsPage })));
export const ContactListPage = lazy(() => m().then((x) => ({ default: x.ContactListPage })));
export const ContactTicketPage = lazy(() => m().then((x) => ({ default: x.ContactTicketPage })));
export const AnalyticsPage = lazy(() => m().then((x) => ({ default: x.AnalyticsPage })));
export const SystemLogsPage = lazy(() => m().then((x) => ({ default: x.SystemLogsPage })));
export const PlaceholderSubscriptionsPage = lazy(() =>
  m().then((x) => ({ default: x.PlaceholderSubscriptionsPage }))
);
export const PlaceholderDemoUnlocksPage = lazy(() =>
  m().then((x) => ({ default: x.PlaceholderDemoUnlocksPage }))
);
export const PlaceholderEmailPage = lazy(() => m().then((x) => ({ default: x.PlaceholderEmailPage })));
export const PlaceholderSettingsPage = lazy(() =>
  m().then((x) => ({ default: x.PlaceholderSettingsPage }))
);
