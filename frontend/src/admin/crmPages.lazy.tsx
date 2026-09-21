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
export const DiagnosticsPage = lazy(() => m().then((x) => ({ default: x.DiagnosticsPage })));
export const SystemLogsPage = lazy(() => m().then((x) => ({ default: x.SystemLogsPage })));
export const CreatorAcquisitionPage = lazy(() =>
  import('./AcquisitionOverviewPage').then((x) => ({ default: x.AcquisitionOverviewPage }))
);
export const AcquisitionOverviewPage = lazy(() =>
  import('./AcquisitionOverviewPage').then((x) => ({ default: x.AcquisitionOverviewPage }))
);
export const AcquisitionCreatorsPage = lazy(() =>
  import('./AcquisitionCreatorsPage').then((x) => ({ default: x.AcquisitionCreatorsPage }))
);
export const AcquisitionApprovalsPage = lazy(() =>
  import('./AcquisitionApprovalsPage').then((x) => ({ default: x.AcquisitionApprovalsPage }))
);
export const AcquisitionCampaignsPage = lazy(() =>
  import('./AcquisitionCampaignsPage').then((x) => ({ default: x.AcquisitionCampaignsPage }))
);
export const AcquisitionInboxPage = lazy(() =>
  import('./AcquisitionInboxPage').then((x) => ({ default: x.AcquisitionInboxPage }))
);
export const AcquisitionAnalyticsPage = lazy(() =>
  import('./AcquisitionAnalyticsPage').then((x) => ({ default: x.AcquisitionAnalyticsPage }))
);
