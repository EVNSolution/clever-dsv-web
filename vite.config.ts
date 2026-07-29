import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (env.VITE_DSV_API_MODE !== 'mock' && env.VITE_DSV_API_MODE !== 'remote') throw new Error('VITE_DSV_API_MODE must be explicitly set to "mock" or "remote".');
  const proxy = env.VITE_DSV_API_PROXY_TARGET
    ? { '/api/dsv': { changeOrigin: true, target: env.VITE_DSV_API_PROXY_TARGET } }
    : undefined;
  return {
    build: { manifest: true },
    plugins: [react()],
    preview: { proxy },
    server: { proxy },
  };
});
