import { existsSync, readFileSync, readdirSync } from 'node:fs';

const nginxConfigPath = 'ops/nginx/dsv-web.conf';
const assetsPath = 'dist/assets';

if (!existsSync(nginxConfigPath)) {
  throw new Error(`Missing canonical nginx config: ${nginxConfigPath}`);
}

const pdfWorkers = readdirSync(assetsPath).filter((name) => /^pdf\.worker-.*\.mjs$/.test(name));
if (pdfWorkers.length === 0) {
  throw new Error('The production build did not emit a PDF.js module worker.');
}

const nginxConfig = readFileSync(nginxConfigPath, 'utf8');
if (!/location\s+=\s+\/index\.html\s*\{[\s\S]*?Cache-Control\s+"no-cache, no-store, must-revalidate"\s+always\s*;[\s\S]*?\}/.test(nginxConfig)) {
  throw new Error('The canonical nginx config must prevent stale index.html responses.');
}
if (!/location\s+~\*\s+\\\.mjs\$[\s\S]*?types\s*\{\s*application\/javascript\s+mjs\s*;\s*\}/.test(nginxConfig)) {
  throw new Error('The canonical nginx config must serve .mjs files as application/javascript.');
}

console.log(`Static server contract verified (${pdfWorkers.join(', ')}).`);
