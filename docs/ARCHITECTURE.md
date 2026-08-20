# JOP Architecture Notes

This file is for AI agents and human contributors who need a fast, reliable map of the project.

It describes:

- the core tile catalog and state model
- how editor state works
- how runtime state works
- how data is stored in MongoDB
- how stations in a session relate to each other
- where mutations are allowed to happen

It is intentionally practical rather than exhaustive.

## 1. Project Shape

The app is split into four main surfaces:

- `/`
  Root entry page for entering `sessionId` and `stationId`.
- `/editor`
  Layout authoring tool. This is the only place where layout is edited directly in the browser.
- `/runtime/[sessionId]/[stationId]`
  Runtime view for one persisted station.
- `/mock`
  Mock session simulator. Used to create stations, import station JSON, and define inter-station lineblock links.

Important rule:

- Editor mode is local-authoring-first.
- Runtime mode is backend-owned.
- Mock mode is session simulation and topology setup.

## 2. Source Of Truth

There are two different state ownership models in this repo.

### Editor mode

Editor mode uses local React state as the editable source of truth.

Main file:

- `src/app/components/editor/StationEditorClient.tsx`

The editor:

- creates and mutates `EditorState` locally
- exports/imports station JSON
- allows placement, deletion, rotation, mirroring, text edits, and local piece-to-piece connections

This is intentionally mutable UI state because the editor is an authoring tool.

### Runtime mode

Runtime mode does not own canonical state in the browser.

Main files:

- `src/app/components/runtime/RuntimeStationClient.tsx`
- `src/app/components/runtime/StationRuntimeBoard.tsx`

Runtime flow:

1. client fetches station snapshot from backend
2. client subscribes to Socket.IO station snapshots over WebSocket
3. backend changes MongoDB first
4. the custom server observes the MongoDB change stream
5. the custom server pushes the full station snapshot to the subscribed station room
6. client replaces local snapshot with the latest backend snapshot

The runtime client should be treated as a read model for canonical state.

## 3. Core Station Layout Model

The core station representation is shared across editor export/import, persistence, and runtime rendering.

Main file:

- `src/lib/station/layout.ts`

The central type is:

```ts
type StationLayout = {
  width: number;
  height: number;
  pieces: Record<string, PieceRecord>;
  map: GridCellRef[][];
  connections: Record<string, string>;
};
```

This model has three distinct parts:

- `map`
  2D matrix of occupied cells
- `pieces`
  record of actual piece objects and their current per-piece state
- `connections`
  intra-station logical links between specific piece endpoints

Important rule:

- `layout.connections` is only for links inside one station layout.
- It is not used for inter-station topology.

## 4. What A Cell Stores

Each grid cell stores a string ref:

```ts
type GridCellRef = `${string}.${number}`;
```

Example:

- `abc123.0`
- `abc123.1`

Meaning:

- the left side is the piece id
- the right side is the part index within a multi-cell piece

Helpers for this live in:

- `src/lib/station/layout.ts`

Key helpers:

- `parseCellRef`
- `getRenderablePieces`
- `getPieceCells`
- `placePieceAt`

## 5. Piece State

A piece record looks like this:

```ts
type PieceRecord = {
  type: string;
  rotation: 0 | 180;
  mirrored: boolean;
  state: {
    groups: Record<string, GroupSelection>;
    texts: Record<string, string>;
  };
};
```

A piece contains:

- tile type key
- orientation
- state-group selections
- text overrides

This lets the same tile definition render differently depending on runtime/editor state.

## 6. Tile Catalog And Rendering

The tile catalog is the static domain definition for every supported tile.

Main file:

- `src/app/data/tiles.ts`

This file defines:

- `tiles`
  the tile catalog
- `stateGroups`
  the shared state-group registry

Each tile entry can define:

- component SVG
- footprint size
- used cells
- traversable states
- supported state groups
- static style variables
- text slots

Important rule:

- `tiles.ts` is static tile metadata, not per-station mutable state.

### State groups

`stateGroups` defines reusable visual state categories such as:

- `signal`
- `occupation`
- `switch`
- `lineblock`

Tile state helpers live in:

- `src/lib/station/tile-state.ts`

Tile type definitions live in:

- `src/lib/station/tile-types.ts`

Rendering components use these via:

- `src/app/components/tiles/TileSvg.tsx`
- `src/app/components/tiles/tile-rendering.ts`
- `src/app/components/tiles/tile-catalog.ts`

Those `src/app/components/tiles/*` modules are currently thin wrappers around the shared domain layer.

## 7. Editor Export / Import Shape

The editor exports the in-memory `EditorState`.

Important detail:

- `EditorState` is just the shared `StationLayout` type aliased for editor use.

See:

- `src/app/components/editor/types.ts`

That means station JSON exported from the editor is directly consumable by:

- mock station import
- persisted station creation

This is intentional. The project avoids a second parallel layout shape.

## 8. Intra-Station Connections

There are two distinct concepts named "connections" in the project. Do not mix them up.

### A. Layout connections

Stored in:

- `StationLayout.connections`

Used for:

- piece endpoint links inside one station
- currently used mainly for switch ↔ switch-button editor/runtime relationships

Editor logic for these lives mostly in:

- `src/app/components/editor/StationEditorClient.tsx`
- `src/lib/station/layout.ts`

### B. Inter-station links

Stored in:

- `SessionDocument.topology.lineblockLinks`

Used for:

- linking lineblock pieces between different stations in the same session

These are session topology, not station layout.

## 9. Session / Station Persistence Model

Main file:

- `src/lib/station/domain.ts`

### Session document

```ts
type SessionDocument = {
  _id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'closed';
  mockMode: true;
  topology: {
    lineblockLinks: Record<string, SessionLineblockLink>;
  };
  runtime: {
    trains: Record<string, MockTrain>;
    lineblocks: Record<string, SessionLineblockRuntimeState>;
  };
};
```

### Station document

```ts
type StationDocument = {
  _id: string;
  sessionId: string;
  stationId: string;
  revision: number;
  layout: StationLayout;
  runtime: {
    pendingActions: Record<string, PendingAction>;
    activeTrainRoutes: Record<string, ActiveTrainRoute>;
    switchAlignments: Record<string, PhysicalSwitchAlignment>;
  };
  createdAt: string;
  updatedAt: string;
};
```

### Historical action document

```ts
type StationActionLogDocument = {
  _id: string;
  sessionId: string;
  stationId: string;
  actionId: string;
  type: string;
  status: 'completed' | 'failed' | 'cancelled';
  ...
};
```

Mongo collections are accessed via:

- `src/lib/server/repositories/session-repository.ts`
- `src/lib/server/repositories/station-repository.ts`
- `src/lib/server/repositories/station-action-log-repository.ts`

## 10. Inter-Station Topology

Inter-station links are stored at the session level.

Type:

```ts
type SessionLineblockLink = {
  id: string;
  sessionId: string;
  a: {
    stationId: string;
    pieceId: string;
  };
  b: {
    stationId: string;
    pieceId: string;
  };
  createdAt: string;
};
```

Current meaning:

- one link connects one lineblock piece in station A to one lineblock piece in station B

Current limitation:

- the link stores only `stationId` and `pieceId`
- it does not yet model sub-endpoints, directions, or richer signaling semantics

Current creation path:

- mock UI posts to `POST /api/sessions/[sessionId]/lineblock-links`
- service validates both referenced stations exist
- service validates both referenced pieces are `lineblock`
- session topology is updated in Mongo

Relevant files:

- `src/app/api/sessions/[sessionId]/lineblock-links/route.ts`
- `src/lib/server/services/station-service.ts`

## 11. Mutation Rules

This is the most important section for future agents.

### Allowed direct browser mutations

Allowed only in editor mode:

- placing/removing pieces
- rotation/mirroring
- text editing
- local endpoint connections
- board resize/reset

These all happen inside:

- `src/app/components/editor/StationEditorClient.tsx`

### Disallowed direct browser mutations

Disallowed in runtime mode:

- mutating persisted station layout directly
- patching canonical station state locally
- inventing backend results optimistically

Runtime must go through backend routes/services first.

### Backend-owned mutations

Backend-owned changes should happen through:

- route handler
- validation
- service layer
- Mongo write
- MongoDB change-stream observation
- Socket.IO snapshot propagation

Not through:

- ad hoc React state patches
- raw client-side document edits

## 12. Command / Pending Action Model

Pending actions are stored inside the station document while active.

Type:

```ts
type PendingAction = {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  sessionId: string;
  stationId: string;
  issuedAt: string;
  startedAt: string | null;
  dueAt: string | null;
  finishedAt: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};
```

Current implemented vertical slice:

- `switch:set-position`

Switch-button behavior:

- runtime users operate the switch-button tile directly
- switch buttons resolve their switch and `main`/`upper`/`lower` motor through `layout.connections`
- left/right setting takes three seconds and is persisted as an active action
- setting actions are recovered from persisted `dueAt` when the station is loaded
- returning a fixed handle to neutral is instant and retains physical motor alignment
- fixed button positions constrain route search; neutral buttons may be overridden by routes
- reserved or occupied switch sections cannot be manually operated
- compatible crossover halves remain independently controllable
- the extended switch persists four motor combinations but exposes only its three connected traversals

Current implementation files:

- `src/app/api/stations/[sessionId]/[stationId]/commands/switch-set-position/route.ts`
- `src/lib/server/services/station-service.ts`

Lifecycle:

1. backend adds pending action to station doc
2. station revision increments
3. snapshot is published
4. delayed completion logic runs
5. station layout/runtime is updated
6. finished action is removed from active pending state
7. action is archived to `station_actions`
8. updated snapshot is published

## 13. Realtime Flow

Realtime uses full snapshots over Socket.IO WebSockets.

Main files:

- `server.ts`
- `src/lib/station/realtime.ts`
- `src/app/components/runtime/RuntimeStationClient.tsx`

Behavior:

- the custom Next.js server owns Socket.IO and one MongoDB `stations` change stream
- clients subscribe to one station room using validated `sessionId` and `stationId`
- MongoDB writes are observed with `fullDocument: 'updateLookup'`
- the server sends validated full station snapshots
- clients replace their local copy
- Socket.IO reconnects automatically and the server sends the current snapshot on every subscription
- no granular patch syncing yet

This is deliberate. The system currently prefers simple, explicit snapshot replacement.

## 14. Mock Mode

Mock mode is not just a test page anymore. It is the current session simulator.

Main file:

- `src/app/components/mock/MockControlClient.tsx`

Current responsibilities:

- create a mock session
- add demo stations
- import station JSON into that session
- list stations in the session
- inspect lineblock pieces by station
- create inter-station lineblock links
- show outbound mock adapter calls
- create, place, move, and remove session-wide mock trains

Supporting routes:

- `POST /api/sessions/mock`
- `GET /api/sessions/[sessionId]`
- `GET /api/sessions/[sessionId]/stations`
- `POST /api/sessions/[sessionId]/lineblock-links`
- `POST /api/stations`

## 15. Mock Trains

Mock trains live in `SessionDocument.runtime.trains`, not in a browser and not
inside one station. A train can occupy sensors in more than one station while
crossing an inter-station lineblock.

Movement rules:

- the selected spawn sensor is the train front
- the remaining simulated sensor length is placed behind the front
- movement requires an active reserved route; call-on movement is not implemented
- each traversed tile takes two seconds
- tiles without occupation sensors consume time but do not change the board
- occupied sensor overlays are derived server-side into station snapshots
- a route reservation returns to normal after the train's rear clears that sensor
- trains stop at the last sensor before a terminal departure/shunt control
- passed signals return to danger
- physical switch traversal alignment remains persisted after route cancellation
- odhlaska is enabled only after the complete train clears the entrance signal

Active routes persist an ordered `path`. `reservedOccupations` is intentionally
not used as a movement path because it is an unordered visual aggregation.

Train mock routes:

- `POST /api/sessions/[sessionId]/trains`
- `POST /api/sessions/[sessionId]/trains/[trainId]/move`
- `DELETE /api/sessions/[sessionId]/trains/[trainId]`

## 16. Runtime Rendering

Runtime rendering is based on persisted station snapshots.

Main files:

- `src/app/components/runtime/RuntimeStationClient.tsx`
- `src/app/components/runtime/StationRuntimeBoard.tsx`

Current runtime page behavior:

- fetch snapshot
- subscribe through Socket.IO over WebSocket
- render board
- display pending actions
- operate lineblocks, route controls, and connected switch buttons through backend commands

## 17. Serialization Boundaries

The code tries to keep serialization explicit.

Helpers:

- `serializeStationLayout`
- `deserializeStationLayout`

Location:

- `src/lib/station/domain.ts`

Use these when moving layout data between:

- editor/export JSON
- API payloads
- Mongo persistence
- runtime in-memory layout logic

Do not scatter ad hoc object spreads for persisted layout conversion if a shared helper can be used.

## 18. Files To Read First

If you need to change the system, these are the best entry points.

For tile/domain shape:

- `src/app/data/tiles.ts`
- `src/lib/station/layout.ts`
- `src/lib/station/tile-state.ts`
- `src/lib/station/domain.ts`

For editor behavior:

- `src/app/components/editor/StationEditorClient.tsx`

For runtime behavior:

- `src/app/components/runtime/RuntimeStationClient.tsx`
- `src/app/components/runtime/StationRuntimeBoard.tsx`

For mock session simulation:

- `src/app/components/mock/MockControlClient.tsx`

For backend state changes:

- `src/lib/server/services/station-service.ts`
- `src/app/api/stations/*`
- `src/app/api/sessions/*`

## 19. Common Pitfalls

- Do not confuse `layout.connections` with `session.topology.lineblockLinks`.
- Do not introduce a second station layout shape unless absolutely necessary.
- Do not make runtime React state the canonical source of truth.
- Do not mutate persisted runtime state only in the browser.
- Do not reimplement tile orientation/state logic separately from `src/lib/station/*`.
- Do not assume inter-station links are directional yet.
- Do not assume lineblock links currently model terminal-side detail.
- Do not store trains in one station document; train occupancy can span stations.
- Do not use unordered route reservations as a train movement path.

## 20. Roblox Runtime Adapter

Mock and Roblox runtime integrations implement the same interpreter boundary. Domain services persist
canonical session/station state and emit a `session:changed` invalidation only after the write. The mock
interpreter records that event for inspection. The Roblox interpreter publishes the same small event to
the configured Open Cloud MessagingService topic.

MessagingService is not a state store and its 1 KiB messages are best-effort. A matching Roblox server
filters notifications by `game.JobId` (the JOP `sessionId`) and fetches a complete physical-state
projection over authenticated HTTPS. Registration returns the initial projection, and periodic fetching
repairs missed notifications.

`/map` can save a complete `SessionSchemaDocument` to `roblox_place_templates`, keyed by Roblox
`PlaceId`. On registration, a new JobId session is instantiated from that template. Tile links in Roblox
use the `JOPPieceLinks` JSON attribute and contain `{ stationId, pieceId }` pairs, so one Instance can
represent multiple JOP tiles without relying on globally unique piece IDs.

Roblox occupation events persist in `SessionDocument.runtime.physicalOccupations`. An optional
`traversalState` allows independently occupied crossover/switch paths. Both mock train sensors and
physical occupations feed the same server-side station visual projection and availability rules.

Relevant files:

- `src/lib/server/roblox/runtime-interpreter.ts`
- `src/lib/server/roblox/roblox-open-cloud-port.ts`
- `src/app/api/roblox/*`
- `src/lib/server/repositories/place-template-repository.ts`
- `roblox/ServerScriptService/JopBridge/*`

## 21. Short Summary

If you only remember five things, remember these:

1. `tiles.ts` defines static tile metadata and visual state capabilities.
2. `StationLayout` is the shared station shape used by editor, persistence, and runtime.
3. Editor mode mutates local layout state directly; runtime mode must not.
4. Persisted runtime stations live in Mongo and are pushed to clients as full snapshots.
5. Inter-station links live on the session document, not inside a station layout.
