import { isTauri } from '@tauri-apps/api/core';

export async function openToolWindow(path: string, title: string) {
  if (!isTauri()) {
    window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }
  const destination = new URL(path, window.location.origin);
  if (destination.origin !== window.location.origin) throw new Error('Invalid tool URL');
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const tool = new WebviewWindow(`tool-${crypto.randomUUID()}`, {
    url: destination.pathname + destination.search,
    title,
    width: 1280,
    height: 800,
  });
  await new Promise<void>((resolve, reject) => {
    void tool.once('tauri://created', () => resolve());
    void tool.once('tauri://error', (event) => reject(new Error(String(event.payload))));
  });
}
