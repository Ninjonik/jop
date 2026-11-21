'use client';
import { account } from './appwrite-client';

type DisToken = { jwt: string; expires: number };
let token: DisToken | undefined;
let pendingToken: Promise<DisToken> | undefined;
let tokenVersion = 0;

function tokenExpiry(jwt: string, requestedAt: number) {
  const cacheUntil = requestedAt + 10 * 60 * 1000;
  try {
    const payload = jwt.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const { exp } = JSON.parse(atob(payload));
    // This is only a cache deadline. The server remains the JWT verifier.
    if (typeof exp === 'number' && Number.isFinite(exp))
      return Math.min(cacheUntil, exp * 1000 - 30_000);
  } catch {
    /* Retain the conservative cache deadline if no expiry can be read. */
  }
  return cacheUntil;
}
export async function getDisToken() {
  if (token && token.expires > Date.now()) return token.jwt;
  if (!pendingToken) {
    const version = tokenVersion;
    const requestedAt = Date.now();
    const request = account
      .createJWT()
      .then((result) => {
        if (version !== tokenVersion) throw new Error('Prihlásenie sa zmenilo. Skúste znova.');
        token = { jwt: result.jwt, expires: tokenExpiry(result.jwt, requestedAt) };
        return token;
      })
      .finally(() => {
        if (pendingToken === request) pendingToken = undefined;
      });
    pendingToken = request;
  }
  return (await pendingToken).jwt;
}

export class DisRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function disRequest(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const version = tokenVersion;
  let jwt = await getDisToken();
  const send = () => {
    headers.set('Authorization', `Bearer ${jwt}`);
    return fetch(url, { ...init, headers, cache: 'no-store' });
  };
  let response = await send();
  const replayable = !(
    typeof ReadableStream !== 'undefined' && init.body instanceof ReadableStream
  );
  if (response.status === 401 && replayable && version === tokenVersion) {
    // Other requests may already have refreshed the rejected token. Share that
    // result rather than invalidating a newly issued token for every failed call.
    if (token?.jwt === jwt) token = undefined;
    jwt = await getDisToken();
    response = await send();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && token?.jwt === jwt) token = undefined;
    throw new DisRequestError(
      response.status,
      typeof payload?.error === 'string'
        ? payload.error
        : payload?.error?.message || `HTTP ${response.status}`,
    );
  }
  return response;
}

export async function disFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  return (await disRequest(url, init)).json() as Promise<T>;
}

export function clearDisToken() {
  tokenVersion++;
  token = undefined;
  pendingToken = undefined;
}
