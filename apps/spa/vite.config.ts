import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(root, '../..'), '');
  const apiOrigin =
    env.NEXT_PUBLIC_API_ORIGIN ||
    (mode === 'desktop' && env.ROBLOX_REDIRECT_URI ? new URL(env.ROBLOX_REDIRECT_URI).origin : '');
  if (mode === 'desktop' && !apiOrigin)
    throw new Error(
      'Set NEXT_PUBLIC_API_ORIGIN to the public API origin before building the desktop application.',
    );
  return {
    build: { outDir: mode === 'desktop' ? 'dist-desktop' : 'dist' },
    plugins: [react()],
    publicDir: '../../public',
    resolve: { alias: [{ find: '@', replacement: resolve(root, '../../src') }] },
    define: {
      'process.env.NEXT_PUBLIC_API_ORIGIN': JSON.stringify(apiOrigin),
      'process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT': JSON.stringify(
        env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1',
      ),
      'process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID': JSON.stringify(
        env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis',
      ),
    },
    server: {
      watch: { ignored: ['**/src-tauri/**'] },
      port: 1420,
      strictPort: true,
      proxy: {
        '/releases': {
          target: env.NEXT_PUBLIC_API_ORIGIN || 'https://jop.igportals.eu',
          changeOrigin: true,
        },
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true },
        '/socket.io': { target: env.API_PROXY_TARGET || 'http://localhost:3000', ws: true },
      },
    },
  };
});
