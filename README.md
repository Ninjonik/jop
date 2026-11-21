# JOP - DiS

JOP is a railway control panel with a React SPA, a separate Next.js API service,
and a Tauri desktop client for Windows, Linux and macOS.

The npm workspaces are `apps/api` (HTTP routes, Socket.IO and MongoDB change
streams) and `apps/spa` (Vite, React Router and Tauri). Existing railway domain,
server services and reusable screens remain in `src` and are shared by imports.
The SPA never bundles server services or server credentials.

Current focus:

- station layout authoring in the editor
- persisted runtime station snapshots
- mock session simulation
- inter-station lineblock topology setup
- backend-owned runtime state flow

## Main Areas

- `/`
  Session and station entry page.
- `/editor`
  Layout authoring tool. Exported JSON from here is the station layout import format used elsewhere.
- `/runtime/[sessionId]/[stationId]`
  Runtime station view backed by MongoDB change streams and Socket.IO WebSocket snapshots.
- `/mock`
  Mock session simulator for creating stations, importing station JSON, and wiring inter-station lineblock links.
- `/map`
  Session topology editor and Roblox PlaceId template publisher.
- `/test/bounds`
  Tile catalog inspection and rendering/state coverage page.

## Tech Stack

- Next.js 16 App Router for API routes only
- Vite + React Router for the web and desktop SPA
- Tauri 2 for native installers, browser login and file saving
- React 19
- TypeScript
- MongoDB
- Zod

## Local Setup

Install dependencies:

```bash
npm install
```

Create local env values:

```bash
cp .env.example .env.local
```

Required environment variables:

```env
MONGODB_URI=...
MONGODB_DB_NAME=jop
ROBLOX_OPEN_CLOUD_API_KEY=...
ROBLOX_INBOUND_SECRET=...
ROBLOX_MESSAGING_TOPIC=JOPRuntime
```

Run the dev server:

```bash
npm run dev
```

This starts the API on port 3000 and the SPA on port 1420. Open
`http://localhost:1420`. You can start them independently with `npm run dev:api`
and `npm run dev:spa`. The SPA development server proxies HTTP and Socket.IO to
the API. Set `SPA_ORIGIN=http://localhost:1420` for browser OAuth to return there.

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

The production API server also serves the built SPA and falls back to its HTML
entry point for client routes. It can instead sit behind a reverse proxy that
serves `apps/spa/dist` separately. When the origins differ, set the public
`NEXT_PUBLIC_API_ORIGIN` before building the SPA, and set `SPA_ORIGIN` and
`CORS_ORIGINS` on the API. Runtime secrets belong only on the API server.

## Desktop

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then
run `npm run desktop:dev` alongside `npm run dev:api`. Build an installer on the
target operating system with `npm run desktop:build`. Artifacts are written to
`apps/spa/src-tauri/target/release/bundle`. A manual GitHub Actions workflow,
**Desktop installers**, builds Windows and Linux artifacts; repository
variable `JOP_API_ORIGIN` selects their API server.

Desktop builds require `NEXT_PUBLIC_API_ORIGIN` (for example
`https://jop.igportals.eu`), falling back to the origin of `ROBLOX_REDIRECT_URI`.
The backend remains a hosted service; it is not bundled into the installer.
The Windows 7 appearance is the application theme, not a Windows 7 OS target.

## VPS deployment and automatic updates

The production webhook accepts authenticated pushes to `master` (the current
default branch) and `main`. `/usr/local/sbin/deploy-jop` stages an immutable source
snapshot, reuses the existing server `.env*` files and `/etc/jop.env`, builds both
workspaces, switches `/var/lib/jop/current`, and restarts `jop.service`. Failed API
health checks restore the previous snapshot. Desktop builds run afterwards in
the Ubuntu 22.04 container defined by `scripts/deploy/Dockerfile.desktop`.
`cargo-xwin` cross-compiles the Windows executable; the VPS's NSIS 3.11 packages
its installer. Linux produces AppImage/deb with the media framework included.
Only AppImage and Windows installers are advertised for automatic updates.
Web assets use `apps/spa/dist`; desktop assets use `apps/spa/dist-desktop`, so
native builds cannot overwrite the web application that is currently served.

Nginx serves `/srv/jop-releases` at `https://jop.igportals.eu/releases/` independently
of the API process. Installers are immutable and versioned; `latest.json` is
published atomically only after both signed artifacts are ready. The persistent
release counter supplies increasing `0.1.N` application versions on every deploy.
The private updater key lives at `/var/lib/jop/signing/updater.key`; back it up
securely because existing clients require the same signing identity. Its public
key is embedded in the desktop configuration. API/Appwrite/Roblox/LiveKit secrets
stay on the server and are not Vite build definitions.

DIS exposes `/download` before and after sign-in. Installed applications check
for signed updates on startup and hourly, and offer an explicit install/restart
action so an update does not silently interrupt dispatching or unsaved editing.
Build/deploy output appears in `journalctl -u jop-webhook.service`; the first
bootstrap deployment uses `jop-bootstrap-deploy.service`.

The train icon master is `public/brand/dis-icon.svg`; Tauri's `icon` command
generates the platform sizes in `apps/spa/src-tauri/icons`. The official ZSSK
artwork is bundled locally in `public/brand/zssk.svg`, with its source recorded
in `THIRD_PARTY_NOTICES.md`.

Roblox sign-in opens the default browser, uses the existing hosted OAuth
callback, then returns via `jop-dis://auth/complete`. An expiring per-attempt nonce
binds the callback to the initiating app; the Appwrite login token remains
one-time. Installed builds register the scheme. On macOS, test the installed
`.app` bundle because `cargo run` does not register custom schemes. Appwrite
must allow the desktop localhost platform/origins as well as the web SPA host.
The macOS bundle declares microphone access for voice calls. Release signing
and macOS notarization need your signing credentials; unsigned local artifacts
can still be built and tested.

Run `npm run build`, `npm run typecheck -w @jop/spa`, `npm run test:dis` and
`npm run test:i18n` for the main checks.

## Current Data Model

There are two important persistence levels:

- session documents
  hold session metadata and inter-station topology
- station documents
  hold one station layout plus runtime pending actions

Important distinction:

- intra-station piece links live in `station.layout.connections`
- inter-station lineblock links live in `session.topology.lineblockLinks`

## State Ownership Rules

Editor mode:

- local browser state is the editable source of truth
- used for layout creation, rotation, mirroring, text edits, and export/import

Runtime mode:

- MongoDB is the canonical source of truth
- clients fetch snapshots and replace them on Socket.IO updates observed from MongoDB
- clients must not directly mutate canonical station state

Mock mode:

- creates a mock session
- can add multiple stations into one session
- can import station JSON files
- can define which lineblock piece in one station links to which lineblock piece in another

Roblox mode:

- `/map` saves the current session schema as a reusable template for a PlaceId
- each Roblox `game.JobId` registers as a new runtime session
- MongoDB remains canonical; Open Cloud messages only invalidate Roblox's cached projection
- Roblox fetches full physical state over authenticated HTTPS and posts sensor feedback back over HTTPS
- the scripts to copy into ServerScriptService live in `roblox/`

## Important Files

If you are new to the repo, start here:

- `docs/ARCHITECTURE.md`
- `src/app/data/tiles.ts`
- `src/lib/station/layout.ts`
- `src/lib/station/domain.ts`
- `src/lib/server/services/station-service.ts`
- `src/app/components/editor/StationEditorClient.tsx`
- `src/app/components/mock/MockControlClient.tsx`
- `src/app/components/runtime/RuntimeStationClient.tsx`

## Architecture Doc

Detailed architecture notes for AI agents and contributors live here:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

That document explains:

- tile catalog and state groups
- shared station layout shape
- editor vs runtime state ownership
- persistence and mutation flow
- pending action lifecycle
- inter-station topology
- key files and common pitfalls

## Notes

- The runtime frontend no longer exposes direct switch controls.
- The backend still contains a switch command flow as the current example pending-action implementation.
- Mock mode is currently the main place to simulate multi-station sessions and lineblock topology.
