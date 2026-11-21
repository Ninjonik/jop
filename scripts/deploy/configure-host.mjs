// Run as root once after installing the reviewed files from scripts/deploy.
import { chmod, chown, readFile, stat, writeFile } from 'node:fs/promises';
const nginxPath = '/etc/nginx/sites-enabled/jop.conf';
const nginx = await readFile(nginxPath, 'utf8');
if (!nginx.includes('include /etc/nginx/snippets/jop-releases.conf;')) {
  const markers = nginx.match(/    location \/ \{/g) || [];
  if (markers.length !== 2)
    throw new Error('Unexpected JOP nginx structure; inspect before changing it');
  await writeFile(
    nginxPath,
    nginx.replaceAll(
      '    location / {',
      '    include /etc/nginx/snippets/jop-releases.conf;\n\n    location / {',
    ),
  );
}
const sudoPath = '/etc/sudoers.d/jop-deploy';
const sudo = await readFile(sudoPath, 'utf8');
const rule = 'jop ALL=(root) NOPASSWD: /usr/local/sbin/jop-desktop-build';
if (!sudo.includes(rule))
  await writeFile(sudoPath, `${sudo.trimEnd()}\n${rule}\n`, { mode: 0o440 });
await chmod(sudoPath, 0o440);
const envPath = '/home/services/jop/.env.production.local';
let env = await readFile(envPath, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
for (const [key, value] of Object.entries({
  NEXT_PUBLIC_API_ORIGIN: 'https://jop.igportals.eu',
  SPA_ORIGIN: 'https://jop.igportals.eu',
})) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  env = line.test(env)
    ? env.replace(line, `${key}=${value}`)
    : `${env.trimEnd()}\n${key}=${value}\n`;
}
await writeFile(envPath, env, { mode: 0o600 });
await chmod('/home/services/jop/.env', 0o600);
const owner = await stat('/home/services/jop');
await chown('/home/services/jop/.env', owner.uid, owner.gid);
await chown(envPath, owner.uid, owner.gid);
console.log('Configured nginx releases, restricted builder command, and public SPA/API origins.');
