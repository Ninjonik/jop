# DiS timetable editor and grafikon

The editor creates daily services for the Roblox map from manually measured
journey times. It reuses the existing DiS authentication, place/station catalogue,
train categories, Appwrite timetables, Mongo session timetables and line storage.
Saving uses the existing integration; it does not send driving or signalling
commands to Roblox.

## Normal workflow

1. Choose **Nový vlak**, or select a train from the searchable list. The list shows
   its departure, arrival, route and active/draft/retired status.
2. Enter the train number and category. Add stations and enter arrival, departure,
   dwell and track values. Compact clocks such as `630` or `6.30` become
   `06:30` on blur. Optional notes and stop/pass types are behind one checkbox.
   Enter/Up/Down move between clock cells; Tab and TSV pasting remain available.
   The origin arrival and terminus departure show a dash and need no input.
   Their internal values follow the visible endpoint event for API compatibility.
3. Use **Šablóny trás** to save the current route and measured times as a reusable
   template. Choose a template and first departure to fill another timetable:
   measured travel and dwell durations are preserved, including across midnight.
   An unmeasured route supplies station order with equal clocks, to be filled in
   manually. Opposite directions can have separate templates.
4. Choose **V prevádzke** or **Koncept**, check times, then save. Active trains
   appear in existing game/DiS timetable consumers. There is no separate deploy
   button or automatic Roblox runtime mutation in this editor.
5. **Kópia vlaku** and **Spiatočný výkon** open an editable new draft. Review return
   times and tracks. **Posun časov** shifts the current train from a chosen stop.
   **Nástroje a export** contains repeating services, dwell tools and JSON/CSV.
   Repeated/imported trains show a batch preview and save separately; a partial
   failure leaves only the unsaved remainder in the queue.

Undo/redo retains 100 local edits. Debounced draft recovery is scoped to the
user, place and recurring/session mode. Leaving a dirty draft prompts and keeps
a recovery copy. Recovery still respects server validation and revision checks.
Saving clears the local recovery record. Storage failure does not block editing.

**Vyradiť vlak** removes it from the active offer while retaining its identity,
EDD history and references. Enable the drafts/retired filter to reopen it and
restore active status. Active-driver protection and revision conflict handling
remain on the server. No timetable records are silently purged.

## Graph

Time runs left to right, station order runs top to bottom. The time ruler and
station labels remain available while scrolling. Labels adapt from minutes to
multiple hours as you zoom; next-day events include `+1`.

- Scroll to move through time; Ctrl + scroll zooms around the pointer. Zoom
  buttons, fit-to-trains, full-day view and go-to-time are available.
- Drag the background to pan. Search and category/direction filters reduce the
  displayed trains; selected-only mode isolates one service.
- Select a train to highlight it and open its compact time editor beside the
  chart. Edits update the shared unsaved draft. Switching tabs keeps graph
  position and settings.
- Enable **Upravovať ťahaním** before dragging a train line or an event. Whole
  lines shift all times; individual events stay within neighbouring events.
  Snapping and a drag offset preview help deliberate edits. Save remains explicit.
- Passenger, express and freight colours distinguish services; the selected
  train is highlighted and its display colour can be changed locally. Hover
  shows the nearest station's arrival/departure in the graph status bar.
- Station spacing is schematic unless a complete existing distance profile is
  available. The graph never invents distances, acceleration or braking times.
- SVG export contains station/time labels and resolved theme colours. The graph,
  working timetable and station list support browser print/PDF.

The check action keeps clock/order/duplicate-number validation and the existing
track/section overlap reports. These are advisory authoring reports, not a
complete infrastructure or signalling simulation.

## Simplification and compatibility

The normal editor has no calendars, operating-day restrictions, traction curves,
braking tables, physics calculations, time locks or technical preparation panels.
New/edited services carry `planning.daily: true` and manual mode. Daily services
ignore retained historical validity fields; retired services remain inactive.
Legacy planning metadata stays readable. Selecting a legacy timetable prepares
the daily/manual representation locally; it is persisted only when saved.

The older solver, technical schemas and catalogue API remain available for
backward compatibility, but are not imported by the simplified editor. Daily
plans skip technical diagnostics. Existing timetable IDs, next-working links,
stops, notes, session scope and permission boundaries are retained.

Route templates use the optional `RailwayLine.measuredStops` field in the
existing Mongo line record. The server validates exact station order and a
journey shorter than 24 hours. Editing station order in the route editor clears
the old measured snapshot to avoid applying times to different stations.
No line schema migration is required.

JSON imports are create-only, limited to 500 trains/5 MB. Referenced next train
IDs must already be valid in the target GVD; import is not a cross-place restore.

## Safe preview before merge

Run `npm ci`, then `npm run preview:gvd`, and open
<http://127.0.0.1:1421/>. No environment file, account or production database is
needed. The preview renders the actual editor and production styles with fixture
auth and a fixture-only transport. It never calls live timetable or Roblox APIs.
Reload resets sample saves/templates; local draft recovery can survive reload.
Use the header controls to check Slovak/English and light/dark themes.

The preview is for authoring/UI checks. Actual authentication and live Roblox
integration require the site's normal staging acceptance.

## Deployment and rollback

### Shared operating clock

The top-right DIS clock shows hours, minutes, seconds and a small date. With a
session selected, authorized managers can open **Posun času** and choose an offset
in hours. For example, -12 h turns 18:00 real Bratislava time into 06:00 operating
time. The offset is stored once per session/universe in Mongo `session_clocks`;
participants read the same server-owned value. Legacy sessions default to zero.
The date rolls with the offset; calculations use Bratislava civil time in summer
and winter. Browser clock skew is corrected from the server sample.

TPV's current-time cursor and EDD automatic/default actual times use this clock.
Planned timetable clocks are unchanged: author the 06:00 service as 06:00.
Real shift bookings, audit timestamps, network timeouts and lease deadlines
remain real time. Changing an offset never rewrites existing EDD actuals.
The setting is session-specific and must be selected again for a new game server.

Update the JOP Bridge together with the API to synchronize Roblox Lighting.
Registration, heartbeat and normal update polls include the clock, even when
there are no physical deltas. Once configured, one server loop advances
`Lighting.ClockTime` each second. Other game clocks can use workspace attributes
`DiSClockOffsetMinutes`, `DiSOperatingDate`, `DiSClockServerUnixMs` and
`DiSClockSecondOfDay` as a reference sample. Existing Lighting is left untouched
until an offset is explicitly saved. **Použiť reálny čas** saves zero and
synchronizes Lighting to real Bratislava time.

Clock reads require a DIS login; writes use existing manager permissions and
validate active session ownership/universe. Expired session clock records are
pruned with existing session artefacts. The safe preview includes fixture-only
clock controls. No live Roblox server was modified by authoring or preview.

Deploy API and SPA together using the existing release process. The original
PR adds an optional Appwrite `planningJson` string attribute (30,000 characters):
run the reviewed existing `npm run dis:setup` on the intended environment and
wait until it is available. That command also performs the repository's existing
schema/storage/access-policy setup; it is not run against production by preview
or tests. Saves fail clearly and retain drafts if the attribute is unavailable.

Recurring revision-protected edits use Appwrite transactions. Session edits use
Mongo atomic compare-and-replace with monotonic revision times. Mongo 5+ supports
the legacy-record `$getField` read path. Older clients without revision tokens
retain legacy behaviour; avoid concurrent editing through mixed client versions.
Train-number creation retains the existing pre-write uniqueness check.

Rollback the application without deleting records or the optional metadata.
Review inactive/draft records before reverting to an older API that does not
understand their status.

## Verification

- `npm run test:dis`: domain coverage, including measured-template shifting,
  midnight, daily operation, malformed template rejection and legacy checks.
- `npm run test:dis:gvd:persistence`: disposable Appwrite database and unique Mongo
  universe/session namespace. Verifies additive setup, legacy reads, stale and
  concurrent edits, retirement/driver guard, measured route round-trip, catalogue
  snapshots, session rename/CAS and unauthenticated rejection. Cleans its fixtures.
- Production API/SPA build, targeted ESLint and `git diff --check`.
- Actual-component fixture browser checks: save, compact clocks, route template
  save/apply, copy, repeats, graph-side edits, line dragging, undo/redo, SVG export,
  light/dark and smaller-window layouts. This is not a full live game test.

Known repository baselines: standalone SPA type-check reports the existing
`TileSvg.tsx:232` SVG `title` typing error; the UI-copy checker has three unrelated
missing translations in StationSelectionView and StationRuntimeBoard. The
existing main-bundle size warning is unchanged.
