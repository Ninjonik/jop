# GVD planning workstation

The GVD authoring view is a compact DiS/Aero workstation. It uses the existing
authentication, place catalogue, train categories, Appwrite recurring timetable
records and MongoDB session timetable endpoints. It does not send commands to
Roblox, change station/interlocking state, or rewrite EDD actuals and shifts.

## Editing workflow

1. Select a place and train, or choose **Nový vlak**.
2. Edit the timetable grid. Stations use the existing autocomplete. Compact times
   such as `630` or `6.30` become `06:30` when leaving the field. Enter/Up/Down move
   between time cells; Tab works normally. Paste tab-separated arrival,
   departure, track and notes values into their matching columns.
3. Specify stops, passing points or operating stops. Dwell changes departure;
   passing points have no dwell. Arrival/departure locks protect times when
   applying a calculation, not against deliberate manual edits.
4. In **Technické údaje**, choose validity, weekdays and explicit date exceptions.
   The year presets are 2004/2005 and 2005/2006; custom periods are also supported.
   The operating-date filter is a GVD service date, not today's real date.
5. Select a stock profile and directional line profile to estimate running times.
   Inspect the speed graph and leg times before **Použiť vypočítané časy**.
6. Review diagnostics, then save. Calculating, graph dragging and preparing tools
   never save automatically.

Undo/redo keeps up to 100 local edits. A debounced local draft is scoped to the
user, place and recurring/session mode. Leaving a dirty document prompts and
keeps a recovery copy. Recovery never bypasses server validation or revision
checks. Local recovery is a convenience, not a server backup.

**Kópia vlaku**, **Spiatočný výkon**, **Taktové vlaky**, time shifts and dwell
tools prepare drafts. Return workings clear unsafe track/lock assumptions;
review their reverse running times and turnaround. Repeating trains are capped
at 20 per operation. JSON imports are capped at 500 trains/5 MB. Prepared trains
are saved individually; after a failure the unsaved remainder remains visible.
Imports create records, rather than silently overwriting existing numbers.
Existing `nextTrainId` references must resolve in the target GVD; review or edit
foreign references in an imported JSON file before saving it. Imports are not
a cross-place database restore tool.

The **Grafikon** tab shares the current draft. Drag the train line to shift it,
or an event to change that time within neighbouring events. Time snapping,
axis fitting, zoom and background panning are available. Station spacing uses
metres only when the selected line has a complete forward distance profile;
otherwise the chart explicitly says it is schematic. The graph can be exported
as SVG or printed. The working timetable and station train list have print/PDF
views, and the grid has CSV export. Use the browser's Save as PDF option.

## Infrastructure and stock data

**Príprava trate** retains the existing line topology editor and adds a separate
line selector for technical profiles. Each direction contains ordered segments
with length in metres, speed in km/h and gradient in per mille (positive uphill
in that direction). Reversing a profile reverses segment order and gradient
sign; reverse braking requirements must be supplied independently.

Optional station tracks have usable length and clearance time. Optional blocks
have start/end distances and clearance time. Optional brake tables contain mode
P/R/G, maximum axles, maximum speed and required braked-weight percentage. Cite
the relevant table and its validity in the section source. Unknown values remain
unknown; the editor does not infer real capacity from a station picture.

Stock profiles contain locomotive/hauled mass, wheel power, tractive effort or a
speed/effort curve, resistance coefficients, adhesion, rotating mass factor,
traction/brake build-up and service deceleration. Optional brake mode, braked
weight and axles support a **separate** required-percentage check. Braked weight
is not a force and is not converted into deceleration.

The reusable stock catalogue lives in MongoDB `gvd_stock_profiles`. Trains embed
profile snapshots, so changing/deleting a catalogue profile cannot silently alter
an existing train calculation. Increment the profile version when changing its
technical assumptions; recorded source/version appear in the authoring data.

## Running-time model and limits

The shared solver uses SI units, spatial steps of at most 20 m, a backwards
service-braking envelope and forward traction integration. It accounts for:

- train/locomotive mass and rotating mass;
- power, effort curve, locomotive adhesion and Davis A/B/C resistance;
- signed gradients and route/stock/section speed limits;
- traction build-up at launch and conservative brake build-up allowance;
- rear-of-train clearance before leaving a lower speed restriction;
- stops versus passing points, dwell, manual time locks and allowances.

The solver is bounded at 20,000 cells, with a downsampled speed plot. A fingerprint
detects changed stock, length, route or infrastructure assumptions. Internal
times are seconds; the existing GVD contract remains whole-minute `HH:mm` with
midnight unfolding and a journey duration under 24 hours. Applied leg times round
up to minutes. Per-leg percentage and fixed allowances are explicit.

**The supplied 750 profile is an editable estimate, not a verified 750.166
traction-chart calibration.** Calibrated mode requires a sourced calibrated stock
profile and section sources. Marking a source does not independently validate
its accuracy. The engine does not model detailed driver technique, weather,
signal approach curves, switches, wheel slip or individual pneumatic distributors.
Brake build-up is a conservative full-delay approximation, not an air-brake
transient simulation. Engineering calibration still requires measured route and
stock data. Do not use this game tool for real railway operations.

Checks cover calendar-aware track/section overlaps (including adjacent service
dates across midnight), directional single-track opposition, entry headways,
track lengths/clearance, running-time feasibility, passing-point dwell,
turnaround location/time, missing data and source-backed braking percentages.
Same-direction block occupancy uses a linear position estimate over **scheduled**
leg time including train length and clearance. It produces warnings, not proof
of safe separation; it cannot certify catching-up, signal spacing or route
release. Missing information is reported, not silently accepted as verified.

Period reference: [ŽSR ZCP 121, valid from 11 December 2005](https://www.vlaky.net/upload/images/obehy/zsr_zcp_2006/zcp121.pdf).
This informs the period presentation and distinction between train mass and
braking requirements; it is not a locomotive traction source or a complete
implementation of all historical ŽSR timetable regulations. Existing train
categories remain available for compatibility.

There is no service-date field in the existing live-session contract. Calendars
currently control planning/filtering/conflict checks. Runtime menus exclude
draft/retired records, but are not filtered by the present-day computer date.

## Compatibility and deployment

Recurring timetables retain their document IDs, existing fields and `stopsJson`.
New authoring data is optional `planningJson`; legacy records without it remain
active. New stop metadata is optional. No bulk record rewrite is required.
Retirement replaces hard deletion to preserve IDs and historical references.
Existing EDD rows, shift snapshots, driver claims and GSM-R bindings are not
rewritten. Re-numbering or making an actively driven train inactive is rejected
until its driver's lease ends, preserving its active timetable identity.

Session-only records now use ordinary Mongo field names `id`/`updatedAt`, adapted
to the existing public `$id`/`$updatedAt` response. Legacy dollar-prefixed fields
are read through an aggregation projection before BSON decoding and migrated
only when that individual record is edited. Existing session record IDs survive
renaming. Writes compare the saved revision atomically.

Before enabling this version in production:

1. Back up the Appwrite GVD collection and follow the site's normal release process.
2. Run the existing `npm run dis:setup` with the intended deployment environment.
   This includes the additive optional `planningJson` string attribute (30,000
   characters). The schema initializer is idempotent. The setup command also
   performs the repository's existing schema/storage/access-policy setup; review
   those existing responsibilities before running it on production.
3. Wait for the new attribute to become `available`. Advanced saves give a clear
   503 setup message while it is missing; they never discard the local draft.
4. Deploy the API and SPA together. Appwrite transactions must be supported by
   the server/API key, and MongoDB must support `$getField` (MongoDB 5.0+).
5. Smoke-test an existing train and a new draft, preview, save, refresh, restore
   and retirement before authoring real schedules.

Recurring revision-protected edits use Appwrite transactions. Session edits use
Mongo atomic compare-and-replace with monotonically increasing revision times.
Older clients without recurring revision tokens retain their previous API
behaviour; avoid concurrent edits from old and new client versions. Concurrent
creation of the same new train number retains the legacy pre-write uniqueness
check and is not a database-wide unique-index guarantee.

Rollback: return to the previous application version; leave the optional
attribute and embedded metadata in place. Do not delete timetable records or
change IDs. The old client can still read the original timetable fields; newly
retired/draft semantics require the new API, so review those records before an
application rollback.

## Verification

- `npm run test:dis`: existing domain suite plus GVD physics, calendars, tools,
  normalization and capacity tests.
- `npm run test:dis:gvd:persistence`: requires the configured Appwrite/Mongo
  credentials. Creates a **fresh disposable Appwrite database** and a random
  Mongo universe/session namespace; it never runs the full production setup.
  Rehearses the additive migration twice, legacy reads, the setup guard, stale
  and concurrent Appwrite edits, retirement/active-driver protection, profile
  snapshot isolation, session rename/CAS, legacy Mongo records and unauthenticated
  route rejection. Fixture cleanup is in `finally`.
- Full API/SPA production build, targeted ESLint and `git diff --check`.
- Browser verification uses the actual components with fixture APIs/auth and
  production styles, in light/dark themes, Slovak/English and a smaller viewport.
  It must not connect the preview to shared live timetable endpoints.

The new workstation modules are under `src/app/components/dis/Gvd*`; shared
models, solver, tools and diagnostics are under `src/lib/dis/gvd-*`. Persistence
remains in the existing `timetables`/`session-timetables` services, with the stock
catalogue in `src/lib/server/dis/gvd-profiles.ts`.
