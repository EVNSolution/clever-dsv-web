/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DSV_API_BASE_URL?: string;
  readonly VITE_DSV_LEGACY_API_BASE_URL?: string;
  readonly VITE_DSV_V1_API_BASE_URL?: string;
  readonly VITE_DSV_API_MODE?: 'mock' | 'remote';
  readonly VITE_CLEVER_OSRM_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
