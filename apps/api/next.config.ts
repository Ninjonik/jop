import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';
loadEnvConfig(resolve(__dirname, '../..'));
const config: NextConfig = {
  turbopack: { root: resolve(__dirname, '../..') },
  experimental: { externalDir: true },
};
export default config;
