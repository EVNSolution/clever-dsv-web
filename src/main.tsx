import React from 'react';
import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/00-foundation-shell.css';
import './styles/10-control-panels.css';
import './styles/20-admin-pages.css';
import './styles/30-customer-responsive.css';
import { App } from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
