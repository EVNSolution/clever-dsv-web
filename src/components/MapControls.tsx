import type { ReactElement } from 'react';

export function ProductHeader({
  title,
  section,
  onHome,
}: {
  title: string;
  section?: string;
  onHome?: () => void;
}): ReactElement {
  return (
    <header className="app-header">
      <button className="brand-home" type="button" onClick={onHome} aria-label="관제 홈으로 이동">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span className="brand-copy"><h1>{title}</h1>{section ? <small>{section}</small> : null}</span>
      </button>
    </header>
  );
}
