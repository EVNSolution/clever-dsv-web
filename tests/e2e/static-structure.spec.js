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
    'demo/management.ts',
    'demo/selectors/customer.ts',
  ];
  for (const path of expectedDemoFiles) expect(exists(path), `${path} should exist`).toBe(true);

  const expectedDevDbFacades = [
    'src/dev-db/management.ts',
    'src/dev-db/queries.ts',
    'src/dev-db/schema.ts',
    'src/dev-db/seed.ts',
  ];
  const devDbFiles = listFiles('src/dev-db', (path) => /\.(ts|tsx)$/.test(path));
  expect(devDbFiles).toEqual(expectedDevDbFacades);

  for (const path of devDbFiles) {
    const facade = readRepo(path);
    const explicitDemoReexport = /export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+['"]\.\.\/demo\/(?:data|management|model|selectors\/customer)['"];\s*/g;
    expect(facade.match(explicitDemoReexport)?.length ?? 0, `${path} should explicitly re-export src/demo ownership`).toBeGreaterThan(0);
    expect(facade).not.toMatch(/export\s+\*/);
    expect(facade.replace(explicitDemoReexport, '').trim(), `${path} should contain no implementation outside named re-exports`).toBe('');
  }

  const model = exists('demo/model.ts') ? readSrc('demo/model.ts') : '';
  expect(model).toMatch(/frontend demo projection/i);
  expect(model).toMatch(/not backend (domain )?models/i);
  expect(model).toMatch(/not (api|API) DTOs?/);
});

test('management keeps empty operational seeds until fixed dispatch import owns them', () => {
  for (const path of ['demo/model.ts', 'demo/management.ts', 'demo/data.ts']) {
    expect(exists(path), `${path} should exist`).toBe(true);
  }

  const model = exists('demo/model.ts') ? readSrc('demo/model.ts') : '';
  const management = exists('demo/management.ts') ? readSrc('demo/management.ts') : '';
  const data = exists('demo/data.ts') ? readSrc('demo/data.ts') : '';
  expect(`${model}\n${management}`).toMatch(/ManagementAssignment(Relation)?/);
  expect(management).toMatch(/drivers:\s*\[\]/);
  expect(management).toMatch(/vehicles:\s*\[\]/);
  expect(management).toMatch(/assignments:\s*\[\]/);
  expect(management).toMatch(/customers:\s*\[\]/);
  expect(management).toMatch(/destinations:\s*\[\]/);
  expect(data).toMatch(/customers:\s*\[\]/);
  expect(data).toMatch(/customerUsers:\s*\[\]/);
  expect(data).toMatch(/orders:\s*\[\]/);
  expect(data).toMatch(/orderItems:\s*\[\]/);
  expect(data).toMatch(/deliveryStops:\s*\[\]/);
  expect(data).toMatch(/routePlanStops:\s*\[\]/);
  expect(data).toMatch(/proofMedia:\s*\[\]/);
  expect(data).not.toMatch(/demoCouriers|demoVehicles|actualArrivals/);
  expect(exists('pages/RecordsPage.tsx')).toBe(true);
  expect(exists('pages/ResourcesPage.tsx')).toBe(true);
  expect(readSrc('pages/RecordsPage.tsx')).toMatch(/배송 이력이 없습니다/);
  expect(readSrc('pages/ResourcesPage.tsx')).toMatch(/등록된 배송원이 없습니다/);
  expect(readSrc('pages/ResourcesPage.tsx')).toMatch(/등록된 차량이 없습니다/);
});

test('customer map does not depend on seeded vehicle identity', () => {
  const customerPage = readSrc('pages/CustomerDeliveryInquiryPage.tsx');
  expect(customerPage).not.toMatch(/mapVehicleIdForCustomerVehicle|vehicleId=\{/);
  expect(customerPage).toMatch(/<MapCanvas ariaLabel="고객 배송조회 지도 - OpenFreeMap" \/>/);
  expect(customerPage).not.toMatch(/mapMode|ShellControlsState|defaultShellControls/);
});

test('control vehicles keep their latest valid coordinates even when telemetry is stale', () => {
  const adminShell = readFileSync(new URL('../../src/components/AdminShell.tsx', import.meta.url), 'utf8');
  const vehiclePoints = adminShell.match(/function controlVehicleMapPoints[\s\S]*?\n\}/u)?.[0] ?? '';
  expect(vehiclePoints).toContain('visibleControlVehicles');
  expect(vehiclePoints).not.toContain('vehicle.vehiclePositionStale');
});

test('service and page imports follow dependency rules', () => {
  expect(exists('services/routing.ts')).toBe(false);

  const apiImports = listFiles('src/api', (path) => path.endsWith('.ts')).filter((path) => /from ['"][^'"]*demo\//.test(readRepo(path)));
  expect(apiImports).toEqual([]);

  const queries = readExisting('src/dev-db/queries.ts');
  expect(queries).not.toMatch(/export\s+\*/);

  const pageFiles = listFiles('src/pages', (path) => /\.(ts|tsx)$/.test(path));
  const rawSeedPageImports = pageFiles.filter((path) => /from ['"][^'"]*(dev-db\/(seed|admin-seed)|demo\/data)['"]/.test(readRepo(path)));
  expect(rawSeedPageImports).toEqual([]);
});

test('manual router, local state, layered plain CSS, and lazy map loading remain', () => {
  const app = readSrc('App.tsx');
  const routes = readSrc('app-routes.ts');
  const adminShell = readSrc('components/AdminShell.tsx');
  const adminContent = readSrc('pages/AdminContent.tsx');
  const customerPage = readSrc('pages/CustomerDeliveryInquiryPage.tsx');
  const main = readSrc('main.tsx');
  const settingsPage = readSrc('pages/SettingsPage.tsx');
  const viteConfig = readRepo('vite.config.ts');
  const dispatchImports = readSrc('services/dispatch-imports.ts');
  const controlRoutes = readSrc('services/control-routes.ts');

  expect(app).toContain('pushState');
  expect(app).toContain('popstate');
  expect(adminShell).toMatch(/useState/);
  expect(customerPage).toMatch(/useState/);
  expect(main).toContain("import './styles/index.css'");
  expect(main).not.toMatch(/styles\/(?:00-foundation-shell|10-control-panels|20-admin-pages|30-customer-responsive|40-runtime-compat)\.css/);
  expect(adminShell).toMatch(/lazy\(\(\) => import\('\.\/MapCanvas'\)/);
  expect(customerPage).toMatch(/lazy\(\(\) => import\('\.\.\/components\/MapCanvas'\)/);
  expect(app).toMatch(/lazy\(\(\) => import\('\.\/pages\/CustomerDeliveryInquiryPage'\)/);
  expect(adminContent).toMatch(/lazy\(\(\) => import\('\.\/DispatchPage'\)/);
  expect(adminContent).toMatch(/lazy\(\(\) => import\('\.\/MasterDataPage'\)/);
  expect(adminContent).toMatch(/lazy\(\(\) => import\('\.\/RecordsPage'\)/);
  expect(adminContent).toMatch(/lazy\(\(\) => import\('\.\/SettingsPage'\)/);
  expect(settingsPage).toMatch(/lazy\(\(\) => import\('\.\.\/components\/DepartureLocationMap'\)/);
  expect(settingsPage).not.toMatch(/import\s+\{\s*DepartureLocationMap\s*\}\s+from/);
  expect(dispatchImports).toMatch(/import\('xlsx'\)/);
  expect(viteConfig).toContain("manualChunks");
  expect(viteConfig).toContain("return 'maplibre'");
  expect(viteConfig).toContain("return 'xlsx'");
  expect(controlRoutes).toContain('control/routes?');
  expect(controlRoutes).not.toContain('router.project-osrm.org');
  expect(controlRoutes).not.toContain('/route/v1/driving/');

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
    { selector: '.auth-page', owner: 'src/styles/features/auth.css' },
    { selector: '.auth-panel', owner: 'src/styles/features/auth.css' },
    { selector: '.auth-control', owner: 'src/styles/features/auth.css' },
    { selector: '.auth-submit', owner: 'src/styles/features/auth.css' },
    { selector: '.auth-error', owner: 'src/styles/features/auth.css' },
    { selector: '.session-screen', owner: 'src/styles/features/auth.css' },
    { selector: '.left-tabs a.main-tab', owner: 'src/styles/components/navigation.css' },
    { selector: '.nav-expanded .left-tabs a.main-tab', owner: 'src/styles/components/navigation.css' },
    { selector: '.maplibregl-canvas', owner: 'src/styles/components/map.css' },
    { selector: '.control-customer-order-list', owner: 'src/styles/features/control.css' },
    { selector: '.customer-route-group small', owner: 'src/styles/features/customer.css' },
    { selector: '.master-data-shell', owner: 'src/styles/features/management.css' },
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

test('CSS entrypoint defines explicit design layers and token ownership', () => {
  const entrypoint = readSrc('styles/index.css');
  const tokens = readSrc('styles/foundation/tokens.css');
  const legacyFiles = [
    'styles/00-foundation-shell.css',
    'styles/10-control-panels.css',
    'styles/20-admin-pages.css',
    'styles/30-customer-responsive.css',
  ];

  expect(entrypoint).toContain('@layer vendor, reset, tokens, base, components, features, responsive');
  expect(entrypoint).toContain("layer(vendor)");
  expect(entrypoint).toContain("layer(tokens)");
  expect(entrypoint).toContain("layer(components)");
  expect(entrypoint).toContain("layer(features)");
  expect(entrypoint).toContain("layer(responsive)");
  expect(entrypoint).toContain("layer(overrides)");
  expect(tokens).toMatch(/--font-sans:/);
  expect(tokens).toMatch(/--color-surface:/);
  expect(tokens).toMatch(/--space-2:/);
  expect(tokens).toMatch(/--radius-panel:/);
  for (const path of legacyFiles) expect(exists(path), `${path} should be removed`).toBe(false);
});

test('application CSS consumes shared palette and typography tokens', () => {
  const applicationCss = listFiles('src/styles', (path) => path.endsWith('.css') && !path.endsWith('foundation/tokens.css'))
    .map(readRepo)
    .join('\n');

  expect(applicationCss).not.toMatch(/#fff(?:fff)?\b/i);
  expect(applicationCss).not.toMatch(/#000(?:000)?\b/i);
  expect(applicationCss).not.toMatch(/#eef3f8\b/i);
  expect(applicationCss).not.toMatch(/#008060\b/i);
  expect(applicationCss).not.toMatch(/Pretendard,\s*sans-serif/);
  expect(applicationCss).not.toMatch(/var\(--(?:canvas|surface|ink|muted|hairline|blue|blue-soft|green|green-soft|future|done|done-soft|risk|risk-soft|amber|amber-soft|shadow|radius)\)/);
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

test('session check remains visually silent', () => {
  const app = readRepo('src/App.tsx');
  expect(app).not.toContain('관리자 세션 권한을 확인하고 있습니다.');
  expect(app).not.toContain('고객 세션 권한을 확인하고 있습니다.');
});

test('package dependency inventory is unchanged', () => {
  const manifest = JSON.parse(readRepo('package.json'));
  expect(Object.keys(manifest.dependencies).sort()).toEqual([
    '@vitejs/plugin-react',
    'lucide-react',
    'maplibre-gl',
    'pretendard',
    'react',
    'react-day-picker',
    'react-dom',
    'xlsx',
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
