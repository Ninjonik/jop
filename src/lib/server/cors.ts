import type { IncomingMessage, ServerResponse } from 'node:http';

export function allowedClientOrigin(origin: string, host?: string) {
  const allowed = new Set([
    'tauri://localhost',
    'http://tauri.localhost',
    'https://tauri.localhost',
    ...(process.env.NODE_ENV !== 'production'
      ? ['http://localhost:1420', 'http://127.0.0.1:1420']
      : []),
    ...(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    ...(process.env.SPA_ORIGIN ? [process.env.SPA_ORIGIN] : []),
  ]);
  return allowed.has(origin) || origin === `https://${host}` || origin === `http://${host}`;
}

export function handleCors(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader('Vary', 'Origin');
    if (!allowedClientOrigin(origin, request.headers.host)) {
      response.writeHead(403).end('Origin not allowed');
      return true;
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
  }
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.writeHead(204).end();
    return true;
  }
  return false;
}
