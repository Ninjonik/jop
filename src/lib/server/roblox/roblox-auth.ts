import { timingSafeEqual } from 'crypto';

export function assertRobloxRequestAuthorized(request: Request) {
  const configuredSecret = process.env.ROBLOX_INBOUND_SECRET?.trim();
  if (!configuredSecret) {
    throw new Error('ROBLOX_INBOUND_SECRET is not configured.');
  }

  const authorization = request.headers.get('authorization') ?? '';
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = Buffer.from(configuredSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error('Unauthorized Roblox request.');
  }
}
