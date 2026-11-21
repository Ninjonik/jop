/** Public endpoint only. Server credentials must never enter the SPA build. */
export const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || '').replace(/\/$/, '');
export function apiUrl(path: string) {
  return path.startsWith('/api/') ? `${apiOrigin}${path}` : path;
}
export function apiFetch(path: string, init?: RequestInit) {
  return fetch(apiUrl(path), init);
}
