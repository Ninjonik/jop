# Roblox ServerScriptService bridge

Create a `Script` named `JopBridge` under `ServerScriptService`. Use
`Main.server.lua` as its source and add the other `.lua` files as child
`ModuleScript` instances named `Config`, `ApiClient`, `HardwareDriver`, and
`InstanceRegistry`.

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

Link any `Instance` to one or more station pieces with a string attribute named
`JOPPieceLinks`. The value is JSON:

```json
[
  { "stationId": "station-a", "pieceId": "piece-123" },
  { "stationId": "station-b", "pieceId": "piece-456" }
]
```

Only `HardwareDriver.lua` is intentionally unfinished. Implement its three
functions once the uniform Roblox model hierarchy and sensor signals are known.
The function arguments are the stable boundary between the transport bridge and
physical models.
