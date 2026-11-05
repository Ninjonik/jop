'use client';
import { account } from './appwrite-client';

let token: { jwt: string; expires: number } | undefined;
let pendingToken: Promise<{ jwt: string }> | undefined;
export async function disRequest(url: string, init: RequestInit = {}): Promise<Response> {
  if (!token || token.expires < Date.now()) {
    pendingToken ??= account.createJWT();
    try {
      const result = await pendingToken;
      token = { jwt: result.jwt, expires: Date.now() + 10 * 60 * 1000 };
    } finally {
      pendingToken = undefined;
    }
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token.jwt}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { ...init, headers, cache: 'no-store' });
  if (!response.ok) {
    const payload = await response.json();
    if (response.status === 401) token = undefined;
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || `HTTP ${response.status}`,
    );
  }
  return response;
}

export async function disFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  return (await disRequest(url, init)).json() as Promise<T>;
}

export function clearDisToken() {
  token = undefined;
}
