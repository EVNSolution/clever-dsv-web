import type { ReactElement } from 'react';
import type { AdminPath } from '../app-routes';
import { MasterDataPage } from './MasterDataPage';
import { DispatchPage } from './DispatchPage';
import { RecordsPage } from './RecordsPage';
import { SettingsPage } from './SettingsPage';

export function AdminContent({ activePath, title, description }: { activePath: AdminPath; title: string; description: string }): ReactElement {
  return (
    <section className={`page-content dynamic-page admin-content overlay-scroll ${classNameForPath(activePath)}`} aria-label={`${title} 페이지`}>
      {activePath === '/dispatch' || activePath === '/settings' ? null : <div className="page-hero"><div><h2>{title}</h2><p>{description}</p></div></div>}
      {contentForPath(activePath, title, description)}
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
