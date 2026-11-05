import { getRobloxCallbackUrl, getRobloxReturnUrl } from '@/lib/dis/roblox-oauth-url';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export async function GET(request: NextRequest) {
  const clientId = process.env.ROBLOX_CLIENT_ID;
  const redirectUri = getRobloxCallbackUrl(request).toString();

  if (!clientId || !process.env.ROBLOX_CLIENT_SECRET) {
    return NextResponse.redirect(
      getRobloxReturnUrl(request, '/dis/login?error=missing_configuration'),
    );
  }

  // Generate random state for CSRF protection
  const state = randomBytes(32).toString('hex');

  const authUrl = new URL('https://apis.roblox.com/oauth/v1/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid profile');
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  // Store state in temporary HTTP-only cookie
  response.cookies.set('roblox_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  });

  return response;
}
