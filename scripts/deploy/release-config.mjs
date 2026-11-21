import { readFile, writeFile } from 'node:fs/promises';
const pubkey = (await readFile('/var/lib/jop/signing/updater.key.pub', 'utf8')).trim();
await writeFile(
  'desktop-release.json',
  JSON.stringify({
    version: process.env.JOP_RELEASE_VERSION,
    plugins: { updater: { pubkey, endpoints: ['https://jop.igportals.eu/releases/latest.json'] } },
  }),
);
