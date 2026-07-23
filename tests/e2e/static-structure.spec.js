import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const srcUrl = (path) => new URL(`../../src/${path}`, import.meta.url);
const repoUrl = (path) => new URL(`../../${path}`, import.meta.url);
const exists = (path) => existsSync(srcUrl(path));
const readSrc = (path) => readFileSync(srcUrl(path), 'utf8');
const readRepo = (path) => readFileSync(repoUrl(path), 'utf8');

function listFiles(root, predicate = () => true) {
  const rootUrl = repoUrl(`${root}/`);
  if (!existsSync(rootUrl)) return [];
  const files = [];
  const walk = (url, relative) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
      if (entry.isDirectory()) {
        walk(childUrl, childRelative);
      } else if (entry.isFile() && predicate(childRelative)) {
        files.push(`${root}/${childRelative}`);
      }
    }
  };
  walk(rootUrl, '');
  return files.sort();
}

function readExisting(path) {
  return existsSync(repoUrl(path)) ? readRepo(path) : '';
}

test('canonical demo projection stays under src/demo', () => {
  const expectedDemoFiles = [
    'demo/model.ts',
    'demo/data.ts',
    'demo/identity.ts',
    'demo/management.ts',
    'demo/selectors/control.ts',
    'demo/selectors/customer.ts',
    'demo/selectors/management.ts',
    'demo/selectors/route.ts',
  ];
  for (const path of expectedDemoFiles) expect(exists(path), `${path} should exist`).toBe(true);

  const expectedDevDbFacades = [
    'src/dev-db/admin-seed.ts',
    'src/dev-db/management.ts',
    'src/dev-db/queries.ts',
    'src/dev-db/schema.ts',
    'src/dev-db/seed.ts',
  ];
  const devDbFiles = listFiles('src/dev-db', (path) => /\.(ts|tsx)$/.test(path));
  expect(devDbFiles).toEqual(expectedDevDbFacades);

  for (const path of devDbFiles) {
    const facade = readRepo(path);
    const explicitDemoReexport = /export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+['"]\.\.\/demo\/(?:data|identity|management|model|selectors\/(?:control|customer|management|route))['"];\s*/g;
    expect(facade.match(explicitDemoReexport)?.length ?? 0, `${path} should explicitly re-export src/demo ownership`).toBeGreaterThan(0);
    expect(facade).not.toMatch(/export\s+\*/);
    expect(facade.replace(explicitDemoReexport, '').trim(), `${path} should contain no implementation outside named re-exports`).toBe('');
  }

  const model = exists('demo/model.ts') ? readSrc('demo/model.ts') : '';
  expect(model).toMatch(/frontend demo projection/i);
  expect(model).toMatch(/not backend (domain )?models/i);
  expect(model).toMatch(/not (api|API) DTOs?/);
});

test('assignment relation and route history stay separate', () => {
  for (const path of ['demo/model.ts', 'demo/management.ts', 'demo/selectors/management.ts']) {
    expect(exists(path), `${path} should exist`).toBe(true);
  }

  const model = exists('demo/model.ts') ? readSrc('demo/model.ts') : '';
  const management = exists('demo/management.ts') ? readSrc('demo/management.ts') : '';
  const selectors = exists('demo/selectors/management.ts') ? readSrc('demo/selectors/management.ts') : '';
  const assignmentSource = `${model}\n${management}`;
  expect(assignmentSource).toMatch(/ManagementAssignment(Relation)?/);
  expect(assignmentSource).not.toMatch(/\b(active|isActive|startsAt|startDate|startedAt|endsAt|endDate|endedAt|unique|primary|current)\b/);
  expect(selectors).toMatch(/routePlanStops/);
  expect(selectors).toMatch(/progress|actualArrivals|completed/i);
  expect(selectors).not.toMatch(/ManagementData\[['"]assignments['"]\]|data\.assignments|loadManagementData|saveManagementData/);
});

test('customer map identity uses explicit seed relation', () => {
  expect(exists('demo/identity.ts'), 'demo/identity.ts should exist').toBe(true);
  const identity = exists('demo/identity.ts') ? readSrc('demo/identity.ts') : '';
  const customerPage = readSrc('pages/CustomerDeliveryInquiryPage.tsx');
  expect(identity).toContain('vehicle-330');
  expect(identity).toContain('proof11');
  expect(identity).not.toMatch(/\.(plate|label|driver|driverName|name)\b|\[(0|index)\]/);
  expect(customerPage).toMatch(/<MapCanvas[\s\S]*vehicleId=\{[^}]+}/);
});

test('service and page imports follow dependency rules', () => {
  const routing = readSrc('services/routing.ts');
  expect(routing).not.toMatch(/dev-db\/queries/);
  expect(routing).not.toMatch(/selectors.*Coordinate|Coordinate.*selectors/);

  const apiImports = listFiles('src/api', (path) => path.endsWith('.ts')).filter((path) => /from ['"][^'"]*demo\//.test(readRepo(path)));
  expect(apiImports).toEqual([]);

  const queries = readExisting('src/dev-db/queries.ts');
  expect(queries).not.toMatch(/export\s+\*/);

  const pageFiles = listFiles('src/pages', (path) => /\.(ts|tsx)$/.test(path));
  const rawSeedPageImports = pageFiles.filter((path) => /from ['"][^'"]*(dev-db\/(seed|admin-seed)|demo\/data)['"]/.test(readRepo(path)));
  expect(rawSeedPageImports).toEqual([]);
});

test('manual router, local state, plain CSS, and lazy map loading remain', () => {
  const app = readSrc('App.tsx');
  const routes = readSrc('app-routes.ts');
  const adminShell = readSrc('components/AdminShell.tsx');
  const customerPage = readSrc('pages/CustomerDeliveryInquiryPage.tsx');
  const main = readSrc('main.tsx');

  expect(app).toContain('pushState');
  expect(app).toContain('popstate');
  expect(adminShell).toMatch(/useState/);
  expect(customerPage).toMatch(/useState/);
  expect(main).toContain("import './styles/00-foundation-shell.css'");
  expect(main).toContain("import './styles/10-control-panels.css'");
  expect(main).toContain("import './styles/20-admin-pages.css'");
  expect(main).toContain("import './styles/30-customer-responsive.css'");
  expect(main).not.toContain("40-runtime-compat.css");
  expect(adminShell).toMatch(/lazy\(\(\) => import\('\.\/MapCanvas'\)/);
  expect(customerPage).toMatch(/lazy\(\(\) => import\('\.\.\/components\/MapCanvas'\)/);

  const routePairs = [
    ["path: '/control'", "label: '관제'"],
    ["path: '/dispatch'", "label: '배차'"],
    ["path: '/records'", "label: '이력'"],
    ["path: '/master-data'", "label: '관리'"],
    ["path: '/settings'", "label: '설정'"],
  ];
  for (const [path, label] of routePairs) {
    expect(routes).toContain(path);
    expect(routes).toContain(label);
  }
  expect(routes).toContain("export const customerDeliveryPath = '/customer/delivery-inquiry'");
});

test('single-concept labels remain', () => {
  const source = [
    readSrc('app-routes.ts'),
    readSrc('components/AdminShell.tsx'),
    readSrc('pages/DynamicPage.tsx'),
    readSrc('pages/MasterDataPage.tsx'),
  ].join('\n');
  const labels = [...readSrc('app-routes.ts').matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  expect(labels).toEqual(['관제', '배차', '이력', '관리', '설정']);
  expect(source).not.toMatch(/배송원·차량|고객·배송망|운영\/알림/);
});

test('CSS ownership manifest matches source usage', () => {
  const ownership = [
    { selector: '.login-screen', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-card', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-card label', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-card input', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-card button', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-card button:disabled', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.login-error', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.left-tabs a.main-tab', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.nav-expanded .left-tabs a.main-tab', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '.maplibregl-canvas', owner: 'src/styles/00-foundation-shell.css' },
    { selector: '#destinationList', owner: 'src/styles/20-admin-pages.css' },
    { selector: '.customer-route-group small', owner: 'src/styles/30-customer-responsive.css' },
    { selector: '.page-content.master-data-page .courier-grid', owner: 'src/styles/20-admin-pages.css' },
    { selector: '.driver-history', owner: null },
    { selector: '.couriers-page', owner: null },
  ];
  const cssFiles = listFiles('src/styles', (path) => path.endsWith('.css'));
  const jsxTsxFiles = listFiles('src', (path) => /\.(ts|tsx)$/.test(path));
  expect(cssFiles).not.toContain('src/styles/40-runtime-compat.css');

  for (const { selector, owner } of ownership) {
    const cssOwners = cssFiles.filter((path) => readRepo(path).includes(selector));
    if (owner) {
      expect(cssOwners, `${selector} should have exactly one CSS owner`).toEqual([owner]);
    } else {
      expect(cssOwners, `${selector} should have no CSS owner`).toEqual([]);
      const token = selector.slice(1);
      const sourceUsers = jsxTsxFiles.filter((path) => readRepo(path).includes(token));
      expect(sourceUsers, `${selector} should have no JSX/TSX usage`).toEqual([]);
    }
  }
});

test('documentation names and boundaries', () => {
  const backendApi = readRepo('docs/backend-api.md');
  const docs = ['README.md', 'DESIGN.md', 'docs/backend-api.md'].map(readRepo).join('\n');
  for (const value of ['/control', '/dispatch', '/records', '/master-data', '/settings', '/customer/delivery-inquiry', '관제', '배차', '이력', '관리', '설정']) {
    expect(docs).toContain(value);
  }
  expect(docs).not.toMatch(/배송원·차량|고객·배송망|운영\/알림|src\/dev-db\/queries/);
  expect(docs).toMatch(/frontend demo projection|프론트엔드 데모/i);
  expect(docs).toMatch(/backend models?|백엔드 모델/i);
  expect(docs).toMatch(/API DTOs?|API DTO/i);
  expect(backendApi).toMatch(/v1 read success responses[\s\S]*"data"\s*:\s*\{\}[\s\S]*"meta"\s*:\s*\{\s*"apiVersion"\s*:\s*"dsv\.v1"\s*\}[\s\S]*"requestId"/i);
  expect(backendApi).toMatch(/v1 errors use the strict v1 floor[\s\S]*"error"\s*:\s*\{[\s\S]*"code"[\s\S]*"message"[\s\S]*"requestId"/i);
  expect(backendApi).toMatch(/bounded legacy[^\n]*[\s\S]*legacy[^\n]*\{[^\n]*"data"[^\n]*"error"[^\n]*\}[^\n]*envelope/i);
  expect(backendApi).toMatch(/## v1 reads[\s\S]*## Bounded legacy commands/i);
});

test('package dependency inventory is unchanged', () => {
  const manifest = JSON.parse(readRepo('package.json'));
  expect(Object.keys(manifest.dependencies).sort()).toEqual([
    '@vitejs/plugin-react',
    'maplibre-gl',
    'pretendard',
    'react',
    'react-dom',
  ]);
  expect(Object.keys(manifest.devDependencies).sort()).toEqual([
    '@playwright/test',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'typescript',
    'vite',
  ]);
  expect(statSync(repoUrl('package.json')).isFile()).toBe(true);
});
