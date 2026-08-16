# Railway Control Panel Implementation Plan

## Objective

Build the next stage of this project as a realtime railway control panel backend/frontend foundation.

The end goal is a station control system whose canonical state is synced two-way with a Roblox game. For now, Roblox is not connected. Instead:

- outbound actions that would normally go to Roblox must call the correct interfaces with correct arguments and return types, but use no-op/mock implementations
- inbound state changes that would normally come from Roblox must be simulated through app-owned API routes
- a dedicated mock/test page must act as the simulated Roblox side and drive those API routes

The implementation must prioritize:

- readability first
- maintainability first
- simple, explicit code
- DRY
- KISS
- YAGNI

Do not add speculative abstractions beyond what is needed for this plan.

---

## Core Product Rules

### 1. Runtime station state model

The station state must continue using the same core representation already used by the current root/editor page:

- 2D matrix / map
- separate `pieces` object
- separate `connections` object

This structure stays.

However, in runtime mode:

- users do **not** move/place/remove tiles directly in the matrix
- users **do** change tile state through backend commands
- layout is fixed during runtime

### 2. Immutable client state

Client app state must be treated as immutable derived state.

Rules:

- MongoDB is the source of truth
- local UI state is only a view of server state
- the client must never directly mutate canonical station state
- every station change must be applied in the backend first
- backend writes to MongoDB first
- client updates only after the database change is observed and sent back to the client

The intended flow is:

1. client triggers command
2. backend validates and processes command
3. backend writes updated state to MongoDB
4. realtime subscription/change propagation notifies clients
5. clients replace current station snapshot with the new one

### 3. Backend owns all decisions

All domain decisions must be server-side.

The client may:

- request actions
- display pending actions
- display final results/state

The client must not:

- decide route legality
- decide final signal/switch outcomes
- directly patch station state
- apply optimistic canonical state updates

### 4. Pending actions

Some actions take time, e.g. building paths, switching switches, resetting counters, etc.

These actions must:

- be represented in station state as active/pending actions
- exist independently of the browser session
- continue correctly if the user refreshes or leaves
- be completed by backend-controlled logic

### 5. Multiple users

Multiple users controlling/viewing the same station is allowed.

For now:

- assume users will not trigger conflicting actions within a tiny time window
- do not over-engineer race/conflict handling yet
- still keep APIs explicit and clean so stricter control can be added later

---

## Confirmed Domain Decisions

These decisions are fixed and must be implemented exactly unless explicitly changed later.

### Routing / page behavior

- The current root page must no longer be the editor.
- The current root page must become a session/station entry page.
- The current editor must be moved to a dedicated station editor route/page.

### Session / station lifecycle

- Sessions represent a unique runtime world / game server instance.
- A new mock session must be created automatically when mock mode is started.
- A session can contain multiple stations.
- Each station belongs to one session.

### Station identifiers

- `stationId` must be a human-readable stable identifier within a session
- it is not an opaque/generated UI identifier

### Runtime layout

- Station layout is fixed in runtime mode
- layout editing belongs to editor mode only

### Mongo persistence model

- There is one main collection for sessions
- There is one main collection for stations
- There is one collection for finished/historical station actions
- Active/non-finished actions live directly inside the station document
- Finished actions are archived/logged in the action log collection

### Realtime payload strategy

- Whole-station snapshot updates are sufficient
- Do not implement granular patch/event syncing in the first version

### Mock Roblox support

The mock system must support both:

- inbound simulated Roblox -> app updates via API routes
- outbound app -> Roblox action calls via typed no-op/mock adapters with correct signatures

---

## Existing Code Constraints That Must Be Preserved

The current project already has working behavior across:

- station editor behavior
- test/bounds page behavior
- tile rendering/state logic
- tile orientation logic

These working behaviors must be preserved and unified correctly.

In particular, do **not** break or omit support for:

- all current tile types
- all current tile states
- all current tile variants
- rotation handling
- mirror handling
- state groups
- text state/default text behavior
- any tile behavior currently covered by the editor page
- any tile behavior currently covered by the bounds/test page

Some of this logic already exists in different places. The implementation must consolidate shared behavior into common reusable modules/components where appropriate. Reuse existing logic rather than re-creating it.

The target is:

- editor mode and runtime mode both rely on the same shared tile/domain logic
- no duplicated orientation/state/rendering logic
- shared components/helpers where practical

---

## Target App Structure

Implement the app as three main areas:

### 1. Root entry page

Purpose:

- ask the user for `sessionId`
- ask the user for `stationId`
- allow navigation into runtime control mode

Behavior:

- root page replaces the current editor page
- keep this simple and explicit

### 2. Station editor page

Purpose:

- preserve the current station-building/editor workflow
- allow layout creation/export/import

Behavior:

- move current editor/root functionality here
- continue to support current placement/orientation/connection behavior

### 3. Runtime control page

Purpose:

- display fixed station layout from persisted station data
- show live state updates
- allow backend-driven actions only

Behavior:

- no direct layout editing
- no direct piece placement/removal
- tile state changes must happen through backend commands
- whole station snapshot is rendered from server data

### 4. Mock/test page

Purpose:

- simulate the Roblox side
- create a new mock session automatically
- send inbound API requests as if they came from Roblox
- observe / exercise outbound mock adapter behavior

---

## Data Model

Use explicit TypeScript domain types. Keep runtime/domain types separate from purely local editor UI state where needed.

### Session document

```ts
type SessionDocument = {
  _id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'closed';
  mockMode: true;
};
```

Notes:

- keep this minimal for now
- add only fields needed for current implementation

### Station document

```ts
type StationDocument = {
  _id: string;
  sessionId: string;
  stationId: string; // human-readable stable identifier within the session
  revision: number;
  layout: {
    width: number;
    height: number;
    map: GridCellRef[][];
    pieces: Record<string, PieceRecord>;
    connections: Record<string, string>;
  };
  runtime: {
    pendingActions: Record<string, PendingAction>;
  };
  createdAt: string;
  updatedAt: string;
};
```

Notes:

- `layout` remains in the same shape as the current editor state model
- runtime state is separated from layout
- use a monotonically increasing `revision` for whole-snapshot change tracking

### Pending action

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

Notes:

- active actions live in `station.runtime.pendingActions`
- completed/failed/cancelled actions must be removed from active station state and archived in the history collection

### Historical station action log

```ts
type StationActionLogDocument = {
  _id: string;
  sessionId: string;
  stationId: string;
  actionId: string;
  type: string;
  status: 'completed' | 'failed' | 'cancelled';
  issuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};
```

---

## Data Ownership Rules

### Editor mode

Editor mode may keep local mutable UI state because it is a layout authoring tool.

### Runtime mode

Runtime mode must not reuse the editor’s local mutation model as the source of truth.

Runtime mode must instead:

- fetch a station snapshot from backend/Mongo
- subscribe to realtime updates
- replace the current rendered snapshot whenever a new station version arrives
- send only commands/events to the backend

Do not blur editor-mode mutation behavior with runtime-mode behavior.

---

## Shared Tile/Station Domain Layer

Create or refactor a shared domain layer that both editor mode and runtime mode use.

This shared layer must centralize:

- tile definitions/catalog access
- orientation transforms
- rotation/mirror handling
- placement shape normalization
- default tile state generation
- text default generation
- state group initialization
- station document serialization/deserialization
- shared piece/map/connection types
- reusable render-state helpers

Avoid duplicated logic between:

- editor page
- runtime control page
- test/bounds page

The current code already contains useful pieces of this logic. Reuse and reorganize them instead of reimplementing them from scratch.

---

## Backend Architecture

### General rule

Keep backend code explicit and layered, but simple.

Recommended structure:

- domain types
- repository layer for Mongo access
- service layer for command execution and action lifecycle
- transport layer for route handlers / SSE
- adapter layer for mock Roblox interfaces

Do not collapse all logic into route handlers.

### MongoDB responsibilities

MongoDB is the canonical state store.

Implement:

- session persistence
- station persistence
- pending action persistence
- historical action persistence
- realtime observation of station document changes

### MongoDB indexing requirements

Add practical indexes at minimum for:

- sessions by `_id`
- stations by `sessionId + stationId` unique
- stations by `sessionId`
- action logs by `sessionId + stationId`
- action logs by `actionId`

Keep indexing simple and directly tied to the known queries in this plan.

---

## Realtime Update Strategy

Use whole-station snapshot propagation.

Recommended first implementation: Server-Sent Events (SSE).

Requirements:

- client subscribes to station updates for a specific `sessionId` + `stationId`
- server observes database changes relevant to that station
- server pushes full station snapshots to connected clients
- clients replace their current station snapshot with the latest one

Do not implement direct browser-to-Mongo subscriptions.
Realtime flow must be app server mediated.

Do not start with WebSockets unless there is a concrete reason. SSE is sufficient for the current scope.

---

## Command Model

Do not expose generic “patch station document” endpoints.

All runtime changes must be triggered through explicit typed commands.

Command shape:

```ts
type StationCommand<TPayload> = {
  commandId: string;
  sessionId: string;
  stationId: string;
  type: string;
  issuedAt: string;
  actor: {
    type: 'user' | 'mock-roblox';
    id: string;
  };
  payload: TPayload;
};
```

Requirements:

- explicit validation per command type
- explicit backend behavior per command type
- clean extension path for future command types
- no raw document patch APIs

Likely future command examples:

- `switch:set-position`
- `path:build-train`
- `path:build-shunting`
- `counter:reset`
- `signal:request-aspect`

Only implement what is necessary now, but keep the command model ready for these.

---

## Pending Action Lifecycle

The backend must own the lifecycle of time-based actions.

Lifecycle requirements:

1. client sends command
2. backend validates command
3. backend creates/updates an active pending action in the station document
4. backend advances action state (`queued` -> `running` -> terminal state)
5. backend updates the station state when the action completes/fails
6. backend removes terminal action from active station document
7. backend archives the terminal action to `station_actions`
8. updated station snapshot is pushed to clients

This lifecycle must remain correct even if:

- the user refreshes
- the user leaves the page
- another user is watching the same station

---

## Mock Roblox Integration

The real Roblox integration is not implemented yet, but the interfaces must be designed now.

### Outbound app -> Roblox

Create typed outbound interfaces/ports for operations that would normally call Roblox.

Examples:

- set switch position
- set signal aspect
- notify path built

Requirements:

- correct arguments
- correct return types
- no-op/mock implementation for now
- implementation must do nothing externally but still satisfy the application contract

### Inbound Roblox -> app

Create app-owned API routes for simulated inbound Roblox updates/actions.

These routes will be called from the mock/test page.

Requirements:

- clean typed request payloads
- explicit validation
- backend applies changes through the same domain/service layer, not ad hoc route logic

### Mock/test page responsibilities

The mock page must be able to:

- create a new mock session automatically
- create/use stations within that session
- send inbound Roblox-like requests to your API routes
- exercise outbound mock adapter calls/acknowledgements

---

## Frontend Responsibilities

### Root page

Replace the current root page with a simple session/station entry page.

Requirements:

- input for `sessionId`
- input for `stationId`
- clear navigation into runtime control page

Keep it minimal.

### Editor page

Move the existing editor from `/` to a dedicated route.

Requirements:

- preserve current layout-building behavior
- preserve current import/export behavior
- preserve orientation and connection behavior
- refactor only as necessary to share common domain logic

### Runtime control page

Requirements:

- fetch initial station snapshot from backend
- subscribe to live station updates
- render station from canonical snapshot
- allow only backend-driven control actions
- show pending actions and final results as needed
- no direct layout editing

### Bounds/test page

Preserve the existing test/bounds usefulness.

Use it as a validation surface for tile/state/orientation coverage while refactoring shared logic.

---

## API / Transport Requirements

Use App Router route handlers.

Required categories:

### Session routes

For example:

- create mock session
- fetch session metadata if needed

### Station routes

For example:

- fetch station snapshot
- create station from editor-exported layout if needed

### Subscription route

For example:

- SSE endpoint for station snapshots

### Command routes

For example:

- submit `switch:set-position`

### Mock Roblox inbound routes

For example:

- routes used by the mock page to simulate Roblox-originated updates/events

Keep route handlers thin. Put business logic in services.

---

## Persistence / Serialization Requirements

The current editor state shape is already close to the persisted runtime layout shape.

Requirements:

- keep persisted `layout` compatible with the current matrix + pieces + connections model
- provide explicit serialization/deserialization helpers where needed
- ensure imported/exported layout data can be promoted into persisted station layout data cleanly

Do not leave this as implicit ad hoc object spreading across the codebase.

---

## Validation Requirements

Validation must exist for:

- session ids
- station ids
- command payloads
- inbound mock Roblox payloads
- station document shape at boundaries

Keep validation readable and explicit.

Do not rely on unchecked client payloads.

---

## Implementation Sequence

Implement in this order.

### Phase 1: Restructure routes and shared domain

1. Move current root editor page into a dedicated editor route.
2. Replace `/` with session/station entry UI.
3. Extract/refactor shared tile/station domain logic from current editor/test code.
4. Preserve current editor behavior and bounds/test behavior.

Deliverable:

- app structure is split into root entry, editor, runtime, and mock areas
- shared tile logic exists and current behavior still works

### Phase 2: Introduce persistence and domain contracts

1. Add TypeScript domain types for sessions, stations, pending actions, and action logs.
2. Add Mongo connection layer.
3. Add repositories for sessions, stations, action logs.
4. Add required Mongo indexes.
5. Add serialization helpers between editor layout and station document layout.

Deliverable:

- canonical persisted data model exists

### Phase 3: Mock session/bootstrap flow

1. Add API route/service to create a new mock session automatically.
2. Add ability to create/load stations under that session.
3. Add mock/test page to trigger this flow.

Deliverable:

- starting mock mode creates a usable runtime session automatically

### Phase 4: Realtime station snapshot flow

1. Add station snapshot fetch route/service.
2. Add SSE subscription route for station updates.
3. Add runtime control page initial fetch + live subscription behavior.
4. Ensure client replaces snapshot on updates instead of mutating canonical state locally.

Deliverable:

- runtime page shows live station state driven by Mongo-backed snapshots

### Phase 5: First backend-driven action vertical slice

Implement one complete command/action flow end to end. Recommended starter:

- `switch:set-position`

Required behavior:

1. client triggers command
2. backend validates command
3. backend writes active pending action into station doc
4. backend simulates delayed execution
5. backend updates station tile state in Mongo
6. backend removes active action from station doc
7. backend archives final action to `station_actions`
8. runtime subscribers receive the updated whole-station snapshot

Deliverable:

- first real backend-owned control action works end to end

### Phase 6: Mock Roblox inbound/outbound structure

1. Add typed Roblox outbound port interfaces.
2. Add mock/no-op implementations.
3. Add mock inbound routes called by the mock page.
4. Route all of this through the same services/domain rules.

Deliverable:

- mock page can behave as stand-in Roblox for both directions

---

## Quality Constraints

The implementation must follow these coding constraints:

- readability over cleverness
- maintainability over premature optimization
- keep route handlers small
- keep domain logic out of React components where possible
- reuse shared helpers/components
- no duplicated tile logic
- no duplicated orientation logic
- no duplicated state initialization logic
- no speculative abstractions for unimplemented future features

When refactoring, prefer:

- extracting shared pure functions
- consolidating existing logic
- small explicit service modules

Avoid:

- giant “god” files
- generic patch/update endpoints
- hidden state mutation paths
- client-owned canonical runtime state

---

## Non-Goals For This Implementation

Do **not** implement full production Roblox integration yet.

Do **not** implement advanced conflict/race handling yet.

Do **not** implement granular patch-diff realtime syncing yet.

Do **not** implement full route-building/signaling domain behavior yet beyond what is needed for the first vertical slice and infrastructure.

Do **not** overbuild the system around hypothetical future needs.

---

## Minimum Acceptance Criteria

The implementation is acceptable only if all of the following are true:

1. The root page is a session/station entry page.
2. The current editor has been moved to a dedicated editor route.
3. Tile states, variants, rotation, and mirror behavior remain correct.
4. Shared logic between editor/test/runtime has been consolidated appropriately.
5. MongoDB is the canonical runtime state store.
6. Runtime clients do not directly mutate canonical station state.
7. Runtime updates are driven by backend writes + realtime snapshot propagation.
8. Active pending actions live in the station document.
9. Completed actions are archived in a separate action log collection.
10. A mock session is created automatically from the mock flow.
11. A mock/test page can simulate Roblox-originated requests.
12. Outbound Roblox-facing calls exist as typed no-op/mock interfaces.
13. At least one end-to-end backend-driven action flow works through pending action lifecycle and realtime station update propagation.

---

## Final Instruction

Implement exactly this architecture unless blocked by a concrete code-level constraint discovered during implementation.

If a detail is unclear during implementation, prefer the option that best preserves:

- backend ownership of runtime state
- compatibility with the existing tile/matrix model
- shared tile logic across editor/test/runtime
- simple explicit code
- readability and maintainability
