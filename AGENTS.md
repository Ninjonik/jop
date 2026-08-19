<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Agent Guidelines

This file is the operating contract for agents working in this repository.
Read `docs/ARCHITECTURE.md` before making structural or domain changes. That
document contains the detailed system map; this file defines the rules that
must guide implementation decisions.

## Engineering Priorities

Use these priorities in order:

1. Correct domain behavior
2. Readability
3. Simplicity
4. Maintainability
5. Performance, only where it is demonstrably needed

The project explicitly follows KISS, YAGNI, and DRY.

### KISS

- Choose the smallest explicit solution that correctly handles the current requirement.
- Prefer ordinary functions, clear conditionals, and concrete domain types.
- Avoid clever code, hidden control flow, metaprogramming, and overly generic frameworks.
- Keep business rules visible and easy to trace from route handler to database write.
- A few straightforward lines are better than an abstraction that obscures behavior.

### YAGNI

- Build only what the current requirement needs.
- Do not add extension systems, generic event buses, plugin layers, factories, or configuration engines for hypothetical features.
- Do not implement future Roblox behavior until its contract is known.
- Leave a short note for a known future limitation instead of prematurely implementing it.
- New abstractions must solve an existing duplication or ownership problem, not an imagined one.

### DRY

- Keep domain decisions, traversal rules, orientation transforms, state initialization, and validation in one authoritative place.
- Reuse shared tile and station helpers across editor, runtime, mock, and test pages.
- Do not duplicate backend rules in React components.
- DRY does not mean removing every repeated line. Do not create a difficult abstraction merely to deduplicate small, unrelated UI fragments.

## Readability Rules

- Use domain-specific names. Avoid vague names such as `manager`, `handler`, `data`, or `utils` when a precise name exists.
- Keep functions focused and make mutations obvious.
- Prefer explicit types at persistence and transport boundaries.
- Comments should explain non-obvious railway or state-machine reasoning, not restate code.
- Keep files cohesive. Extract a module when a file contains a distinct responsibility, not solely because it reached an arbitrary line count.
- Match existing project conventions before introducing a new pattern.

## Architecture Invariants

### App surfaces

- `/` is the session and station entry page.
- `/editor` is the local station layout authoring tool.
- `/runtime/[sessionId]/[stationId]` is the canonical runtime control view.
- `/mock` simulates Roblox, session topology, station imports, and trains.

### State ownership

- MongoDB is the canonical source of truth for runtime state.
- Runtime React state is a read model of server snapshots, never canonical state.
- Runtime clients send commands; they do not directly patch station state.
- The backend writes first, the MongoDB change stream observes the write, Socket.IO sends a whole-station snapshot, then clients replace their snapshot.
- Do not add optimistic canonical station updates.
- Editor state is the exception: the editor may mutate local state because it is an authoring tool.

### Station layout

The shared layout shape must remain:

```ts
type StationLayout = {
  width: number;
  height: number;
  map: GridCellRef[][];
  pieces: Record<string, PieceRecord>;
  connections: Record<string, string>;
};
```

- `map`, `pieces`, and `connections` have separate responsibilities; do not collapse them.
- Runtime layout is fixed. Placement, deletion, rotation, and mirroring belong to editor mode.
- Editor exports must remain directly promotable into persisted station layouts.
- Use the serialization helpers in `src/lib/station/domain.ts`; do not spread persistence conversion logic across the app.

### Connections and topology

- `StationLayout.connections` stores logical links inside one station.
- `SessionDocument.topology.lineblockLinks` stores links between stations.
- Never store inter-station links in a station layout.
- Lineblock-to-premain links are authored in the station editor and persisted with the station layout/runtime derivation.

### Tile domain

- `src/app/data/tiles.ts` and `src/app/data/_tiles/*` are the static tile catalog and visual-state definitions.
- Shared orientation, mirroring, placement, traversal, state-group, and rendering logic belongs in shared station/tile modules.
- Do not create separate editor and runtime implementations of tile behavior.
- Preserve every supported tile type, variant, state group, text default, rotation, and mirror behavior.
- Use the bounds page as a regression surface when changing tile definitions or rendering.

### Backend flow

Use this flow for runtime mutations:

1. App Router route handler parses and validates input.
2. Service applies domain rules.
3. Repository persists the canonical document in MongoDB.
4. The custom server observes the MongoDB change and publishes the resulting station snapshot through Socket.IO.
5. Client replaces its current snapshot.

- Route handlers must remain thin.
- Do not expose generic station patch endpoints.
- Use explicit commands and explicit validation for each operation.
- Active delayed actions belong in station state and terminal actions belong in `station_actions`.
- Browser lifetime must not own delayed domain actions.

### Routes, switches, and trains

- `reservedOccupations` is an unordered visual reservation set. Never use it as an ordered train path.
- Active routes persist an ordered `path` for movement.
- Physical switch alignment is persisted separately from visual reservation and survives route cancellation.
- Switch-button fixed/neutral state is separate from physical motor alignment; neutral release retains alignment.
- Switch buttons resolve `main`/`upper`/`lower` motors through station layout connections.
- A switch cannot realign while occupied.
- Crossover branches can be independently reserved or occupied when their traversals are compatible.
- Mock trains are session-wide because a train may span station boundaries.
- Train occupancy is derived server-side into station snapshots.
- Route reservations are released sensor-by-sensor after the rear of the train clears them.
- Movement currently requires an active reserved route. Call-on movement is intentionally not implemented.
- Inter-station lineblocks remain occupied until the complete train clears the entrance signal and the dispatcher sends `odhlaska`.

## Module Guide

- `src/lib/station/domain.ts`: persisted domain types, commands, and boundary schemas
- `src/lib/station/layout.ts`: shared matrix, piece, connection, orientation, and placement logic
- `src/lib/station/routes.ts`: route search, ordered traversal, reservations, and route visual projection
- `src/lib/station/switches.ts`: switch-button connections, motor mappings, and fixed-position route constraints
- `src/lib/station/tile-state.ts`: shared tile state initialization and style resolution
- `src/lib/station/realtime.ts`: typed Socket.IO station subscription contract
- `server.ts`: custom Next.js server, Socket.IO transport, and MongoDB station change stream
- `src/lib/server/services/station-service.ts`: backend station command and lifecycle orchestration
- `src/lib/server/repositories/*`: MongoDB access only
- `src/lib/server/roblox/*`: typed outbound Roblox ports and mock implementations
- `src/app/components/editor/*`: local layout authoring UI
- `src/app/components/runtime/*`: server-snapshot runtime UI
- `src/app/components/mock/*`: mock Roblox and train controller UI
- `docs/ARCHITECTURE.md`: detailed architecture and data-flow notes

## Change Discipline

- Inspect existing code and current working-tree changes before editing.
- Preserve user changes. Do not revert unrelated or pre-existing modifications.
- Consolidate existing logic instead of reimplementing it.
- Keep domain logic out of React components where practical.
- Add fields only when required by current persisted behavior.
- Maintain backward normalization for existing Mongo documents when adding runtime fields.
- Never silently migrate an unordered or ambiguous legacy value into a safety-relevant ordered value.
- Prefer a clear compatibility error requiring a route rebuild over guessing railway state.

## Validation And Verification

For meaningful changes:

- Run `npm run build`.
- Run targeted ESLint on changed source files.
- Run `git diff --check`.
- Test domain changes through backend APIs and Mongo-backed state when practical.
- Verify both the intermediate persisted state and the final rendered snapshot.
- Clean up isolated test sessions, stations, trains, and action logs after verification.

Repository-wide `npm run lint` may expose unrelated legacy errors. Do not hide
them or modify unrelated files merely to make a task-specific check green.
Report pre-existing failures and still run targeted checks for changed files.

## Decision Test

Before adding code, ask:

1. Is this required for the current behavior?
2. Is there already one authoritative implementation I can reuse?
3. Can a new contributor understand the state change without tracing hidden abstractions?
4. Does the backend remain the owner of runtime decisions?
5. Is the persisted representation explicit enough to recover after refresh or restart?

If the answer is no, simplify the design before implementing it.
