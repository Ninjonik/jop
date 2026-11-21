import type { NextRequest } from 'next/server';

export function getRobloxCallbackUrl(request: NextRequest): URL {
  return new URL(process.env.ROBLOX_REDIRECT_URI || '/api/auth/roblox/callback', request.url);
}

export function getRobloxReturnUrl(request: NextRequest, path: string): URL {
  const nonce =
    request.cookies.get('roblox_desktop_nonce')?.value ||
    (request.nextUrl.pathname === '/api/auth/roblox/login'
      ? request.nextUrl.searchParams.get('desktopNonce')
      : null);
  if (nonce && /^[a-f0-9]{64}$/.test(nonce)) {
    const destination = new URL('jop-dis://auth/complete');
    destination.searchParams.set('nonce', nonce);
    const error = new URL(path, 'https://localhost').searchParams.get('error');
    if (error) destination.searchParams.set('error', error);
    return destination;
  }
  return new URL(path, process.env.SPA_ORIGIN || getRobloxCallbackUrl(request).origin);
}
