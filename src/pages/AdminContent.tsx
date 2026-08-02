import type { ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import type { AdminPath } from '../app-routes';
import { AdminPageHeader } from '../components/AdminUi';

const DispatchPage = lazy(() => import('./DispatchPage').then((module) => ({ default: module.DispatchPage })));
const MasterDataPage = lazy(() => import('./MasterDataPage').then((module) => ({ default: module.MasterDataPage })));
const RecordsPage = lazy(() => import('./RecordsPage').then((module) => ({ default: module.RecordsPage })));
const SettingsPage = lazy(() => import('./SettingsPage').then((module) => ({ default: module.SettingsPage })));

export function AdminContent({ activePath, title, description }: { activePath: AdminPath; title: string; description: string }): ReactElement {
  return (
    <section className={`page-content dynamic-page admin-content overlay-scroll ${classNameForPath(activePath)}`} aria-label={`${title} 페이지`}>
      {activePath === '/dispatch' || activePath === '/settings' ? null : <AdminPageHeader title={title} description={description} />}
      <Suspense fallback={null}>
        {contentForPath(activePath, title, description)}
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
    default:
      return 'settings-page';
  }
}

function contentForPath(activePath: AdminPath, title: string, description: string): ReactElement {
  switch (activePath) {
    case '/master-data':
      return <MasterDataPage />;
    case '/dispatch':
      return <DispatchPage title={title} description={description} />;
    case '/records':
      return <RecordsPage />;
    case '/settings':
      return <SettingsPage title={title} description={description} />;
    default:
      return <SettingsPage title={title} description={description} />;
  }
}
