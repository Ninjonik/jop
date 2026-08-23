# Roblox ServerScriptService bridge

Create a `Script` named `JopBridge` under `ServerScriptService`. Use
`Main.server.lua` as its source and add the other `.lua` files as child
`ModuleScript` instances named `Config`, `ApiClient`, `HardwareDriver`,
`InstanceRegistry`, and `SignalController`.

Before running it:

1. Set `BackendBaseUrl` in `Config` to the public HTTPS URL of the JOP server.
2. Enable **Allow HTTP Requests** in the experience security settings.
3. Create the Roblox secret named by `InboundSecretName`. Its value must match
   the web server's `ROBLOX_INBOUND_SECRET` environment variable and its domain
   should be restricted to the JOP host.
4. Keep `MessagingTopic` equal to the web server's `ROBLOX_MESSAGING_TOPIC`.
5. Save a map template for this game's `PlaceId` from the JOP `/map` page.

On the web server, create an Open Cloud API key scoped to the experience with
`universe-messaging-service:publish`, then configure `ROBLOX_UNIVERSE_ID`,
`ROBLOX_OPEN_CLOUD_API_KEY`, `ROBLOX_INBOUND_SECRET`, and
`ROBLOX_MESSAGING_TOPIC`. The topic must be no longer than 80 characters.

When a Roblox server starts, `Main.server.lua` registers `game.JobId` as the
runtime `sessionId` and `game.PlaceId` as the template key. If a saved JOP
place template exists for that `PlaceId`, the backend creates a fresh Roblox
session in MongoDB from that template and returns one full initialization
payload containing the entire physical state plus the current update cursor. If
no template exists for that `PlaceId`, the bridge disables itself instead of
retrying forever.

After initialization, Roblox no longer performs periodic full-state refreshes.
The backend publishes only `session:changed` invalidations through
MessagingService. On each invalidation, Roblox fetches queued piece updates from
`/api/roblox/sessions/[sessionId]/updates?afterSequence=...` and applies only
those changed pieces locally.

Link any `Instance` to one or more station pieces with a string attribute named
`JOPPieceLinks`. The value is JSON:

```json
[
  { "stationId": "station-a", "pieceId": "piece-123" },
  { "stationId": "station-a", "pieceId": "piece-crossover", "traversalState": "t" },
  { "stationId": "station-b", "pieceId": "piece-456" }
]
```

`traversalState` is optional. The default `HardwareDriver.lua` can now infer
occupation traversal sections directly from part names on the linked Roblox
model, so you usually do not need to encode it manually for occupation sensor
models. It is still supported if you ever wire custom sensors outside the
default naming contract.

The default occupation naming contract is:

- normal track sensor: one or more parts named `Occupancy`
- `singleSwitch`: one or more `Straight` parts and one or more `Diagonal` parts
- `crossoverSwitch`: one or more `Lower`, `Diagonal`, and `Upper` parts
- `extendedSwitch`: one or more `LowerStraight`, `LowerDiagonal`,
  `UpperStraight`, and `UpperDiagonal` parts

Duplicate parts with the same name are merged into one logical section. If any
part in that section is occupied, the whole section reports occupied.

For `extendedSwitch`, the middle JOP traversal is shared, so both
`LowerDiagonal` and `UpperStraight` report the same traversal state.

Switch geometry can also be driven directly by the default driver when the
linked switch model contains mutually exclusive physical variants named `ONE`,
`TWO`, and optionally `THREE`:

- `singleSwitch`: `ONE = blTbr`, `TWO = blTtr`
- `crossoverSwitch`: `ONE = tlTtrAblTbr`, `TWO = blTtr`
- `extendedSwitch`: `ONE = blTbr`, `TWO = blTtr`, `THREE = blTmr`

On every switch change, the driver immediately hides the inactive variants and
leaves only the selected one collidable.

The bridge now supports split standalone Roblox instances for signals, switches,
and occupation sensors, even when they all point at the same JOP piece. The
default `HardwareDriver.lua` detects component roles from descendant attributes:

- `JOPComponentType = "signal"` or `"signalHead"`
- `JOPComponentType = "switch"`, `"switchMotor"`, or `"switchFeedback"`

The default switch feedback observer contract is still attribute-based until the
final switch motor structure is defined:

- Switch feedback emits from `JOPPosition` and requires `JOPControlSlot`
- Snapshot application writes resolved state back via `JOPResolved*`
  attributes

Signals are now expected to be fully driven by the server-resolved Roblox
state. Roblox no longer computes aspects locally. The bridge applies the
server-provided resolved signal family/aspect through `SignalController.lua`,
and that module only reflects backend state onto the physical lamps.

Only `HardwareDriver.lua` remains intentionally provisional. When the final
Roblox model hierarchy is defined, keep the bridge protocol and these link
shapes stable, and replace the attribute-based plumbing with concrete model
wiring.
