import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const require = createRequire(resolve(repo, 'package.json'));
const react = require('@vitejs/plugin-react').default;
const config = {
  define: { 'process.env.NEXT_PUBLIC_API_ORIGIN': '""' },
  root,
  cacheDir: resolve(repo, 'node_modules/.vite-edd-preview'),
  publicDir: resolve(repo, 'public'),
  css: { postcss: repo },
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@/lib/dis/auth-context', replacement: resolve(root, 'auth.ts') },
      { find: '@/lib/dis/api-client', replacement: resolve(root, 'api.ts') },
      { find: /^\.\/api-client$/, replacement: resolve(root, 'api.ts') },
      { find: '@', replacement: resolve(repo, 'src') },
      ...['react', 'react-dom', 'react-router-dom'].map((name) => ({
        find: name,
        replacement: resolve(repo, 'node_modules', name),
      })),
    ],
  },
  server: { host: '127.0.0.1', port: 1423, strictPort: true, fs: { allow: [repo] } },
};
export default config;
