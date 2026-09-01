# JOP

JOP is a railway control panel built with Next.js, React, TypeScript, and MongoDB.

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

- Next.js 16 App Router
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

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm run start
```

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
