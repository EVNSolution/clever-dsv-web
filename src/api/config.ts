export type ApiMode = 'mock' | 'remote';

function resolveApiMode(value: string | undefined): ApiMode {
  if (value === 'mock' || value === 'remote') return value;
  throw new Error('VITE_DSV_API_MODE must be explicitly set to "mock" or "remote".');
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || '/api/dsv';
}

const legacyBaseUrl = normalizeBaseUrl(import.meta.env.VITE_DSV_LEGACY_API_BASE_URL ?? import.meta.env.VITE_DSV_API_BASE_URL ?? '/api/dsv');
const v1BaseUrl = normalizeBaseUrl(import.meta.env.VITE_DSV_V1_API_BASE_URL ?? `${legacyBaseUrl}/v1`);

export const apiConfig = {
  legacyBaseUrl,
  v1BaseUrl,
  mode: resolveApiMode(import.meta.env.VITE_DSV_API_MODE),
  shopDomain: (import.meta.env.VITE_DSV_SHOP_DOMAIN ?? 'dsv-demo.local').trim(),
};
