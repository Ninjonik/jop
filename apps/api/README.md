# API service

The Next application in this workspace contains API routes only. Its custom
`server.ts` retains Socket.IO, MongoDB change streams, radio calls and backend
domain ownership. Shared services/repositories remain in `../../src/lib/server`.

Run `npm run dev:api` from the repository root, or `npm start` after `npm run build`.
The root `.env.local` supplies development configuration. Deploy the repository
with Node and Mongo/Appwrite/Roblox/LiveKit server configuration as before.

All existing `/api/...` paths are retained. Production also serves
`apps/spa/dist` for web clients. `SPA_ORIGIN` controls browser OAuth return and
allowed client access; `CORS_ORIGINS` adds other approved origins. Tauri desktop
origins are allowed explicitly. Appwrite JWT and role validation still run on
the server.
