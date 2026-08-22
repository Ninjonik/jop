import { execSync } from 'node:child_process';

let cachedShortCommitHash: string | null = null;

export function getCurrentShortCommitHash() {
  if (cachedShortCommitHash) {
    return cachedShortCommitHash;
  }

  try {
    cachedShortCommitHash = execSync('git rev-parse --short HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    cachedShortCommitHash = 'unknown';
  }

  return cachedShortCommitHash;
}

export function getCurrentAppTitle() {
  return `JOP | ${getCurrentShortCommitHash()}`;
}
