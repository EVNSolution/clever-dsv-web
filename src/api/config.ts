export type ApiMode = 'mock' | 'remote';

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || '/api/dsv';
}

const legacyBaseUrl = normalizeBaseUrl(import.meta.env.VITE_DSV_LEGACY_API_BASE_URL ?? import.meta.env.VITE_DSV_API_BASE_URL ?? '/api/dsv');
const v1BaseUrl = normalizeBaseUrl(import.meta.env.VITE_DSV_V1_API_BASE_URL ?? `${legacyBaseUrl}/v1`);

export const apiConfig = {
  legacyBaseUrl,
  v1BaseUrl,
  mode: import.meta.env.VITE_DSV_API_MODE === 'remote' ? 'remote' : 'mock' as ApiMode,
  shopDomain: (import.meta.env.VITE_DSV_SHOP_DOMAIN ?? 'tomatonofood.com').trim(),
};
