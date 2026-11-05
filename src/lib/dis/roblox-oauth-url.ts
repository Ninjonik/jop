import type { NextRequest } from 'next/server';

export function getRobloxCallbackUrl(request: NextRequest): URL {
  return new URL(process.env.ROBLOX_REDIRECT_URI || '/api/auth/roblox/callback', request.url);
}

export function getRobloxReturnUrl(request: NextRequest, path: string): URL {
  return new URL(path, getRobloxCallbackUrl(request).origin);
}
