import nextEnv from '@next/env';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
nextEnv.loadEnvConfig(root);
const secrets = [
  'APPWRITE_API_KEY',
  'ROBLOX_CLIENT_SECRET',
  'ROBLOX_API_KEY',
  'ROBLOX_INBOUND_SECRET',
  'LIVEKIT_API_SECRET',
  'MONGODB_URI',
]
  .map((key) => [key, process.env[key]])
  .filter(([, value]) => value && value.length > 8);
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path);
    else if (/\.(js|css|html|json)$/.test(entry.name)) {
      const text = await readFile(path, 'utf8');
      for (const [key, value] of secrets)
        if (text.includes(value))
          throw new Error(`Server secret ${key} appeared in the public build`);
    }
  }
}
await inspect(join(root, 'apps/spa/dist'));
console.log('Public SPA build contains no configured server secrets.');
