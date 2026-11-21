# React SPA

The Vite entry point reuses the existing application components and Aero theme.
Run `npm install --prefix apps/spa` and `npm run dev --prefix apps/spa` alongside
the existing API server (`npm run dev`). Vite listens on port 1420 and proxies
`/api` and `/socket.io` to port 3000. Set `API_PROXY_TARGET` in the root environment
to use another development backend.

`npm run build --prefix apps/spa` produces static assets in `apps/spa/dist`.

The development proxy is not included in production builds. Use
`NEXT_PUBLIC_API_ORIGIN` for a separately hosted API. The API server can also
serve this static build on its own origin.

From the repository root, `npm run desktop:dev` runs Tauri and Vite;
`npm run desktop:build` creates native bundles. Desktop builds use a public API
origin and open Roblox login in the default browser, returning through the
registered `jop-dis` scheme. See the root README for deployment prerequisites,
Appwrite platform configuration, and signing.
