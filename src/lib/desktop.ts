import { apiUrl } from '@/lib/api-client';
import { isTauri } from '@tauri-apps/api/core';

const loginKey = 'jop-desktop-login';
export { isTauri };

export async function startDesktopLogin() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  localStorage.setItem(loginKey, JSON.stringify({ nonce, expires: Date.now() + 600_000 }));
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  const endpoint = apiUrl('/api/auth/roblox/login');
  const url = new URL(endpoint, window.location.origin);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Nastavte NEXT_PUBLIC_API_ORIGIN na adresu servera.');
  url.searchParams.set('desktopNonce', nonce);
  await openUrl(url.toString());
}

export function desktopCallback(url: string): string | null {
  const destination = new URL(url);
  if (
    destination.protocol !== 'jop-dis:' ||
    destination.host !== 'auth' ||
    destination.pathname !== '/complete'
  )
    return null;
  const saved = localStorage.getItem(loginKey);
  if (!saved) return null;
  const attempt = JSON.parse(saved) as { nonce: string; expires: number };
  if (attempt.expires < Date.now() || destination.searchParams.get('nonce') !== attempt.nonce)
    return null;
  localStorage.removeItem(loginKey);
  const error = destination.searchParams.get('error');
  if (error) return `/dis/login?${new URLSearchParams({ error })}`;
  const userId = destination.searchParams.get('userId');
  const secret = destination.searchParams.get('secret');
  if (!userId || !secret) return '/dis/login?error=missing_code';
  return `/dis/auth-complete?${new URLSearchParams({ userId, secret })}`;
}

export async function listenDesktopLinks(navigate: (path: string) => void) {
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  const handle = (urls: string[]) => {
    for (const url of urls) {
      try {
        const path = desktopCallback(url);
        if (path) navigate(path);
      } catch {
        /* Ignore malformed URLs rather than replacing the current workspace. */
      }
    }
  };
  const unlisten = await onOpenUrl(handle);
  handle((await getCurrent()) || []);
  return unlisten;
}

/** WebViews do not consistently implement blob downloads; use the native save dialog. */
export function installDesktopDownloads() {
  const listener = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest('a');
    if (!anchor?.hasAttribute('download') || !anchor.href.startsWith('blob:')) return;
    event.preventDefault();
    const bytes = fetch(anchor.href).then((response) => response.arrayBuffer());
    void (async () => {
      const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const path = await save({ defaultPath: anchor.download || 'export' });
      if (path) await writeFile(path, new Uint8Array(await bytes));
    })().catch(() => window.alert('Súbor sa nepodarilo uložiť. Skúste to znova.'));
  };
  document.addEventListener('click', listener, true);
  return () => document.removeEventListener('click', listener, true);
}
