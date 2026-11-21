import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';
const version = process.env.JOP_RELEASE_VERSION;
if (!/^0\.1\.\d+$/.test(version || '')) throw new Error('Invalid release version');
const root = '/srv/jop-releases';
const output = join(root, version);
await mkdir(output, { recursive: true, mode: 0o755 });
await chmod(output, 0o755);
const platforms = {};
const publicKey = Buffer.from(
  (await readFile('/var/lib/jop/signing/updater.key.pub', 'utf8')).trim(),
  'base64',
)
  .toString('utf8')
  .trim()
  .split('\n')
  .at(-1);
for (const [platform, target, folder, suffix] of [
  ['linux-x86_64', 'x86_64-unknown-linux-gnu', 'appimage', '.AppImage'],
  ['windows-x86_64', 'x86_64-pc-windows-msvc', 'nsis', '-setup.exe'],
]) {
  const directory = join(process.env.CARGO_TARGET_DIR, target, 'release/bundle', folder);
  const files = (await readdir(directory)).filter(
    (name) => name.includes(`_${version}_`) && name.endsWith(suffix),
  );
  if (files.length !== 1)
    throw new Error(`Expected one ${platform} installer, found ${files.length}`);
  const name = files[0];
  const signature = (await readFile(join(directory, `${name}.sig`), 'utf8')).trim();
  if (!signature) throw new Error(`Missing ${platform} signature`);
  const verification = await mkdtemp('/var/lib/jop/verify-signature-');
  try {
    const signaturePath = join(verification, 'artifact.minisig');
    await writeFile(signaturePath, Buffer.from(signature, 'base64'), { mode: 0o600 });
    const result = spawnSync(
      'minisign',
      ['-Vm', join(directory, name), '-x', signaturePath, '-P', publicKey],
      { encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(
        `${platform} signature verification failed: ${result.stderr || result.error?.message}`,
      );
  } finally {
    await rm(verification, { recursive: true });
  }
  for (const file of [name, `${name}.sig`]) {
    await copyFile(join(directory, file), join(output, basename(file)));
    await chmod(join(output, basename(file)), 0o644);
  }
  platforms[platform] = {
    url: `https://jop.igportals.eu/releases/${version}/${encodeURIComponent(name)}`,
    signature,
  };
}
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  notes: `DIS ${process.env.JOP_RELEASE_REVISION}`,
  platforms,
};
await writeFile(join(root, 'latest.json.next'), JSON.stringify(manifest, null, 2), { mode: 0o644 });
await chmod(join(root, 'latest.json.next'), 0o644);
await rename(join(root, 'latest.json.next'), join(root, 'latest.json'));
