import type { ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import type { AdminPath } from '../app-routes';
import { AdminPageHeader } from '../components/AdminUi';
import { operationsEnabled } from '../config/dsv-operations';

const DispatchPage = lazy(() => import('./DispatchPage').then((module) => ({ default: module.DispatchPage })));
const MasterDataPage = lazy(() => import('./MasterDataPage').then((module) => ({ default: module.MasterDataPage })));
const RecordsPage = lazy(() => import('./RecordsPage').then((module) => ({ default: module.RecordsPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((module) => ({ default: module.SettingsPage })));
const DriverInquiriesPage = lazy(() => import('./DriverInquiriesPage').then((module) => ({ default: module.DriverInquiriesPage })));
const ExecutionOperationsPage = lazy(() => import('./ExecutionOperationsPage').then((module) => ({ default: module.ExecutionOperationsPage })));

export function AdminContent({ activePath, title, description, principalId, principalShopId, principalScopes }: { activePath: AdminPath; title: string; description: string; principalId: string | null; principalShopId: string | null; principalScopes: readonly string[] }): ReactElement {
  return (
    <section className={`page-content dynamic-page admin-content overlay-scroll ${classNameForPath(activePath)}`} aria-label={`${title} 페이지`}>
      {activePath === '/dispatch' || activePath === '/settings' ? null : <AdminPageHeader title={title} description={description} />}
      <Suspense fallback={null}>
        {contentForPath(activePath, title, description, principalId, principalShopId, principalScopes)}
      </Suspense>
    </section>
  );
}

function classNameForPath(activePath: AdminPath): string {
  switch (activePath) {
    case '/master-data':
      return 'resources-page master-data-page';
    case '/dispatch':
      return 'work-page';
    case '/records':
      return 'records-page';
    case '/settings':
      return 'settings-page';
    case '/inquiries':
      return 'inquiries-page';
    case '/executions':
      return 'execution-operations-page';
    default:
      return 'settings-page';
  }
}

function contentForPath(activePath: AdminPath, title: string, description: string, principalId: string | null, principalShopId: string | null, principalScopes: readonly string[]): ReactElement {
  switch (activePath) {
    case '/master-data':
      return <MasterDataPage principalScopes={principalScopes} />;
    case '/dispatch':
      return <DispatchPage title={title} description={description} />;
    case '/records':
      return <RecordsPage />;
    case '/settings':
      return <SettingsPage title={title} description={description} principalId={principalId} principalScopes={principalScopes} />;
    case '/inquiries':
      return principalScopes.includes('dsv:accounts:read')
        ? <DriverInquiriesPage />
        : <p role="alert">이 계정에는 현재 화면의 조회 권한이 없습니다.</p>;
    case '/executions':
      return operationsEnabled && principalScopes.includes('dsv:control:read')
        ? <ExecutionOperationsPage principalId={principalId} principalShopId={principalShopId} principalScopes={principalScopes} />
        : <p role="alert">회차 기능이 비활성화되어 있거나 조회 권한이 없습니다.</p>;
    default:
      return <SettingsPage title={title} description={description} principalId={principalId} principalScopes={principalScopes} />;
  }
}
