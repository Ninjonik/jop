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
5. Save a map template for this game's `UniverseId` and `PlaceId` from the JOP `/map` page.

On the web server, create an Open Cloud API key scoped to the experience with
`universe-messaging-service:publish`, then configure `ROBLOX_OPEN_CLOUD_API_KEY`, `ROBLOX_INBOUND_SECRET`, and
`ROBLOX_MESSAGING_TOPIC`. The topic must be no longer than 80 characters.

When a Roblox server starts, `Main.server.lua` registers `game.JobId` as the
runtime `sessionId`, `game.GameId` as the UniverseId, and `game.PlaceId` as the
template key. If a saved JOP place template exists for that UniverseId and PlaceId, the backend creates a fresh Roblox
session in MongoDB from that template and returns one full initialization
payload containing the entire physical state plus the current update cursor. If
no template exists for that UniverseId and PlaceId, the bridge disables itself instead of
retrying forever. Save the template, then restart that Roblox server.

After initialization, Roblox no longer performs periodic full-state refreshes.
The backend publishes only `session:changed` invalidations through
MessagingService. On each invalidation, Roblox fetches queued piece updates from
`/api/roblox/sessions/[sessionId]/updates?afterSequence=...` and applies only
those changed pieces locally.
It also checks the same delta queue every 10 seconds, so missed messages or a
temporary MessagingService failure do not leave the model permanently stale.
This fallback does not download periodic full snapshots. Heartbeats run every
20 seconds; the backend's liveness timeout is 60 seconds.

The server Output begins with `[JOP] Bridge boot: backend=... universe=... place=...
session=... topic=...`, then `[JOP] Registered session ...` and the first
`[JOP] Heartbeat confirmed ...`. HTTP failures include the method and full
endpoint. If startup stops before registration, check that HTTP is enabled and
the `JOP_INBOUND_SECRET` Roblox secret exists, matches `ROBLOX_INBOUND_SECRET`
on the backend, and is allowed for the backend host. Studio tests need the
corresponding Local Secret. Never paste a secret value into logs.

Link any `Instance` to one or more station pieces with a child `StringValue`
named `JOPPieceLinks`. Its `Value` is JSON:

```json
[
  { "stationId": "station-a", "pieceId": "piece-123" },
  { "stationId": "station-a", "pieceId": "piece-crossover", "traversalState": "t" },
  { "stationId": "station-b", "pieceId": "piece-456" }
]
```

For a level-crossing controller, set `JOPComponentType` to `levelCrossing` on
the controller instance and link it to every stacked `trackCrossing` tile that
belongs to that physical crossing. The bridge exposes the aggregate state
through `JOPResolvedLevelCrossingActive` and drives the AŽD 71 sequence.

- Lamps may be named `WhiteLight`, `RedLightA`, `RedLightB`, or the AŽD 71
  names `W`, `R`, `R1`. They may be plain parts or contain Roblox `Light`
  objects.
- Put warning-bell `Sound` instances below the `Reproduktor` descendant.
- A descendant model named `ZÁV` is optional. When present, its pivot rotates
  on X from -84° (up) to 0° (down): 8 seconds of warning, a 10-second lowering
  tween, then a 2-second clearance delay and a 7-second raising tween.
- Models without `ZÁV` use the same white/red/bell sequence with no barrier
  movement.

`traversalState` is optional. The default `HardwareDriver.lua` can now infer
occupation traversal sections directly from part names on the linked Roblox
model, so you usually do not need to encode it manually for occupation sensor
models. It is still supported if you ever wire custom sensors outside the
default naming contract.

The default occupation naming contract is:

- normal track sensor: one or more parts named `Occupancy`
- `singleSwitch` and `singleExtendedSwitch`: one or more `Straight` parts and one or more `Diagonal` parts
- `crossoverSwitch`: one or more `Lower`, `Diagonal`, and `Upper` parts
- `extendedSwitch`: one or more `LowerStraight`, `LowerDiagonal`,
  `UpperStraight`, and `UpperDiagonal` parts

Duplicate parts with the same name are merged into one logical section. If any
part in that section is occupied, the whole section reports occupied.

For `extendedSwitch`, the middle JOP traversal is shared, so both
`LowerDiagonal` and `UpperStraight` report the same traversal state.

For `singleExtendedSwitch`, `Straight` reports `blTbr` and `Diagonal` reports
`blTtr`. The bridge determines this from the linked JOP tile type; no custom
`traversalState` is needed.

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

The current bridge sources are also exposed through a protected backend API:

- `GET /api/roblox/bridge-scripts`
- authorization: `Bearer <ROBLOX_INBOUND_SECRET>`

The response contains the current server bridge sources and the client signal
renderer. You can use this to refresh both directly from Studio instead of
manually pasting every file.

Example Studio command-bar updater:

```lua
local HttpService = game:GetService("HttpService")

local backendBaseUrl = "https://jop.igportals.eu"
local authorization = HttpService:GetSecret("JOP_INBOUND_SECRET"):AddPrefix("Bearer ")

local response = HttpService:RequestAsync({
	Url = backendBaseUrl .. "/api/roblox/bridge-scripts",
	Method = "GET",
	Headers = {
		["authorization"] = authorization,
	},
})

assert(response.Success, string.format("HTTP %d: %s", response.StatusCode, response.Body))

local payload = HttpService:JSONDecode(response.Body)
local root = game:GetService("ServerScriptService"):FindFirstChild("JopBridge")
if not root then
	root = Instance.new("Script")
	root.Name = "JopBridge"
	root.Parent = game:GetService("ServerScriptService")
end
assert(root:IsA("Script"), "JopBridge must be a Script")

for _, scriptInfo in ipairs(payload.scripts) do
	if scriptInfo.name == "JopBridge" then
		root.Source = scriptInfo.source
	elseif scriptInfo.parentService == "StarterPlayer" then
		local parent = game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts")
		local clientScript = parent:FindFirstChild(scriptInfo.name)
		if not clientScript then
			clientScript = Instance.new(scriptInfo.className)
			clientScript.Name = scriptInfo.name
			clientScript.Parent = parent
		end
		clientScript.Source = scriptInfo.source
	else
		local child = root:FindFirstChild(scriptInfo.name)
		local preserveConfig = scriptInfo.name == "Config" and child ~= nil
		if not child then
			child = Instance.new(scriptInfo.className)
			child.Name = scriptInfo.name
			child.Parent = root
		end
		-- Keep the installed backend URL/secret/topic when refreshing bridge code.
		if not preserveConfig then
			child.Source = scriptInfo.source
		end
	end
end
print("JOP bridge refreshed. Check Config, publish the place, then restart live servers to use the new scripts.")
```

Run this in Studio's command bar in edit mode. Updating repository files or
deploying the web server does not replace scripts already published in a Roblox
place or scripts running in an existing game server. The updater preserves an
existing Config module; verify its URL, secret name, and topic separately.

## Protocol verification

With a [Luau CLI](https://github.com/luau-lang/luau/releases) installed, run:

```sh
node --import tsx scripts/verify-roblox-bridge.ts /path/to/luau
node --env-file=.env.local --import tsx scripts/verify-roblox-protocol.ts
```

The first executes the actual Lua sources with service doubles, including
missed notifications, failed initialization and newer sensor events arriving
during a failed request. The second replays HTTP handlers against isolated Mongo
fixtures, verifies persisted state and delta acknowledgements, and cleans up.
It stubs outbound MessagingService publication and does not contact live game
servers. Neither test replaces a Studio test of physical models or a published
server's HTTP/Secrets configuration.

`JopSignalVisualController` and `JopLevelCrossingVisualController` are installed
in `StarterPlayer/StarterPlayerScripts`. The server remains authoritative for
signal/crossing state, barriers, bells, and timing; clients render all lamp
blinking locally.

Only `HardwareDriver.lua` remains intentionally provisional. When the final
Roblox model hierarchy is defined, keep the bridge protocol and these link
shapes stable, and replace the attribute-based plumbing with concrete model
wiring.
