# GSM-R registration in Roblox

GSM-R links a physical vehicle sensor, every radio in its cabins, a Roblox
player, and their DIS driver selection. GVD supplies the category when the
number exists; otherwise the category is Pos. Registration now supplies driver
connection/position status and dispatcher train labels. The radio also controls DIS browser voice calls and emergency broadcasts.
It does not change train movement or implement simplex radio hardware.

## Install in Studio

1. Deploy the backend and refresh `JopBridge` with the existing command-bar
   updater in `roblox/README.md`. The protected bridge-scripts API now includes
   `GsmRController`, a **ModuleScript under JopBridge**. Keep your existing Config.
2. In each RadioStation, replace `MainHandler` with
   `roblox/RadioStation/MainHandler.server.lua`. Use a **Script with RunContext =
   Server**, enabled. Do not use a LocalScript. The bridge also discovers radios
   centrally; Attach is idempotent, and requiring the same controller module
   shares the state between all MainHandlers.
3. Each RadioStation's `VehicleSensorLink` must be an **ObjectValue** whose Value
   points directly to the vehicle's single **BasePart** sensor. Its name must
   contain `VehicleSensor`, matching the existing occupation bridge contract.
   Both cabins must reference the **same Instance**, not two sensor copies with
   the same name. Separate vehicles reference separate sensors.
4. Keep `Buttons`, `Part.SurfaceGui`, and the supplied frame/label names intact.
   `Zero` and `StarEnter` are supported. `Enter` is also accepted as confirmation.
   The existing `End` button supplies NULL/cancel; `Null` and `NULL` names are
   also accepted for a dedicated yellow NULL button.
   The controller creates missing ClickDetectors and uses a 12-stud activation
   range. It does not use the old `One.SmartTagSettings.RemoteEvent`.
   Disable any other script that handles these same radio button presses.
5. Publish and restart the Roblox servers. Existing published servers do not
   load changes from the repository automatically. Build cloned radios fully
   before parenting them into Workspace. Initially empty sensor ObjectValues
   are watched; changing an already attached sensor link disables that radio
   until repaired/restarted, rather than transferring a registration silently.

`SmallGrayButton` is intentionally unassigned: its physical purpose has not been
specified. No GUI assets need editing. Existing labels are reused for prompts,
errors, pending state, train number, function code, and the registration marker.
Check that the existing status label has enough room for error text in Studio.

## Operation

Before using the radio, log in to DIS through the linked Roblox account. The
profile must be eligible as a driver. In **Môj vlak**, select a train
for the same live Roblox session/place. A custom number may register when it matches the selected train. Category is
looked up by number in that place’s GVD, with Pos when no timetable exists; it
is independent of the locomotive function code and overrides the dashboard’s
manually selected category for radio identification. A custom selection is not
silently attached to a timetable ID by number alone.

- **Power**: switch the shared unit on. A three-second startup screen is a game
  adaptation; the real unit's startup is longer.
- **F3**: begin registration. Enter the three digits of your DIS callsign (for example **042** for
  **ZSSK-042**), then **StarEnter**.
  The number-entry screen shows `VOLACI ZNAK` / `RUSNOVODICA` on two lines and a large input value during this step. The server
  matches that callsign to the player’s linked Roblox profile; another person’s
  callsign is rejected.
- Enter the exact selected train number, then **StarEnter**. Use **Zero** for 0 and
  **Delete** to erase the last digit. Train numbers support one to six digits;
  leading zeroes are significant and must match the selected train.
- Select **F1–F5** (or **1–5**) in the locomotive-selection screen: first locomotive,
  second locomotive, banking locomotive, shunting onto the train, shunting away
  from the train. These map to functional codes **01–05**.
- Press **StarEnter** again on the main screen to send registration to JOP.
  `R`, `REGISTROVANY`, and the registered train appear only after confirmation.
- **F4**: deregister. Wait for server confirmation before changing identity or
  powering off. There is no forced takeover of somebody else's registration.
- **F → F8**: select locomotive function; **F → F9**: reopen callsign/number
  entry. These actions require deregistration if already registered.
- **End**: leave an entry screen without changing confirmed registration.

The first operator holds the shared keypad while entering data (60 seconds,
renewed on each accepted press). A registered radio can only be operated by its
driver. Both cabins show the same drafts, screen, prompts and confirmed values;
the same player can move between them. Server checks player identity, proximity,
and button rate. No client-provided RemoteEvent can supply a trusted identity.

A lost HTTP reply triggers reconciliation. Until JOP confirms the outcome,
registration, deregistration and power-off cannot replace the unknown state.
The one-second shared poll reconciles registrations, call state and radio zones.
Leaving the server, destroying the sensor, or removing all attached radios
queues deregistration, retried when JOP becomes reachable. Closing the entire
Roblox server leaves historical records scoped to its old JobId; these records
do not reserve numbers in a new server/session.

## Backend contract and ownership

`GET /api/roblox/sessions/[sessionId]/gsm-r` returns `{ vehicles }`.
`POST` accepts the discriminated commands in `src/lib/roblox/gsm-r.ts`:

- `initialize`: a batch of session-local sensor UUIDs; upserts empty vehicles and
  never overwrites an existing registration.
- `register`: sensor UUID, server-observed actor UserId, entered three-digit callsign (`driverId`), train
  number, function code, and expected revision.
- `deregister`: sensor UUID, server-observed actor UserId, and expected revision.
- `radio-action`: sensor UUID, server-observed actor UserId, action, and a UUID
  command ID retained across HTTP retries. Accepted commands return `{ queued: true }`;
  the next GET supplies the confirmed call state or error.

All calls require the existing Roblox inbound bearer secret. The Roblox server
is the trusted identity boundary; it derives actorUserId from ClickDetector's
Player rather than accepting it from the client. These are server-to-server
endpoints, not browser/player login endpoints.

Mongo collection `gsm_r_vehicles` is authoritative for confirmed registration.
Each sensor has one document; radios do not have independent registration
records. Its nullable binding stores the explicit timetable ID, number,
operating category, DIS user ID, Roblox driver ID and function code. Unique
partial indexes prevent concurrent claims of the same train/function or driver
within a session. Revision compare-and-set prevents stale commands from
undoing newer state. Retrying the same operation is idempotent.

The binding captures the driver selection at registration time. Editing Môj
vlak later does not silently retarget an already registered sensor: deregister
and register the new train explicitly. This does not create a mock runtime train
or make the web driver selection the owner of physical occupation.

Roblox uses the physical sensor Instance as its local grouping key and assigns
one session-local UUID. The read-only `JOPVehicleSensorId` attribute on each
radio identifies the corresponding backend record. Confirmed bindings project
onto sensor attributes `JOPGsmRTrainNumber`, `JOPGsmRDriverId`,
`JOPGsmRTimetableId`, and `JOPGsmRFunctionCode`. Occupation observers report the stable sensor UUID, and the backend joins it
to the confirmed registration. Registration attributes themselves do not own
occupation decisions. Runtime script hot-reloading
is not a persistence mechanism: restart the Roblox server after script updates.

## References and deliberate adaptations

The [T-CZ VO67 GSM-R manual, Polish chapter C](https://www.zzm-czechowice.pl/wp-content/uploads/2016/01/System-GSM-R.pdf),
pages C4 and C6, documents train-number/function-code entry, F3 registration,
F4 deregistration, and the registration indicator. The
[Czech VO67 guide in ORLEN PRP 69](https://www.orlenunipetroldoprava.cz/CS/o-nas/Documents/PRP%2069_UNIDO_V1Z0_FINAL_II.pdf)
also covers the device. Consult the original manuals for real railway use.

The three-digit DIS callsign screen, DIS/GVD validation, shared mirrored input, short
startup, final confirmation, and no-takeover policy are application adaptations.
Calling uses the VO67 shortcuts described below. Unavailable functions report
that explicitly; the service does not invent a traffic/electrical dispatcher.

## Verification

```sh
node --env-file=.env.local --import tsx scripts/verify-gsm-r.ts
node --import tsx scripts/verify-gsm-r-radio.ts /path/to/luau
node --import tsx scripts/verify-roblox-bridge.ts /path/to/luau
```

The first runs real HTTP handlers and Mongo persistence against isolated test
sessions; external Appwrite reads use fixtures. It checks validation, identity,
revision protection, retries, duplicate claims, function codes and confirmed
snapshots, and removes its Mongo fixtures afterward. The second executes the
actual controller with two cabin models and service doubles, including lost
replies, synchronization, driver ownership and disconnect cleanup. The third
regresses the existing bridge. These tests do not verify physical rendering or
actual ClickDetector placement in Studio.

Studio acceptance: test two cabins referencing one sensor, another vehicle,
a driver with a GVD selection, a second player, incorrect callsign/number, a train
number containing zero, all five functions, successful deregistration, a
backend outage during registration, player departure, and vehicle deletion.
Both cabins must agree at every intermediate step. A registered train should
now show its label on the frontmost eligible occupied straight indicator; the
occupation colors and interlocking behavior must remain unchanged.

## Unique personnel callsigns

Callsigns previously used the final three Roblox-ID digits and could collide.
They now use stable numbers **001–999**, reserved atomically per DIS user in
MongoDB `personnel_callsigns` and projected onto the Appwrite profile as
`ZSSK-NNN`. Login, personnel import and opening Personnel reconcile existing
profiles: valid unique suffixes are preserved; duplicate, zero or malformed
values receive a free number. Concurrent requests cannot allocate one number
to different users. Allocations are retained rather than reassigned when a
profile disappears. Exhaustion returns a clear error. Direct Appwrite edits do
not change the reserved identity; reconciliation restores the assigned value.

After deployment, open **Personál** and refresh to see your assigned callsign.
Refresh the Roblox bridge scripts and restart the Roblox server. Enter only
the three digits, including leading zeroes. Roblox UserId remains the trusted
internal ownership key (including existing registrations); it is no longer
entered on the keypad. `driverCallsign` is optional on old persisted bindings.

Run `node --env-file=.env.local --import tsx scripts/verify-callsigns.ts` to test
legacy collisions, stable allocation, concurrent callers and capacity limits.
It uses a separate temporary Mongo collection and fixture Appwrite profiles.

## Radio camera close-up

Click the main radio housing (`Hull`) or display (`Part`) from within 12 studs
to enter a local camera close-up. Keypad clicks keep their ordinary radio action.
The full radio nearly fills the screen width with a small edge margin; narrow
windows fit the height as well so no keys are clipped. Framing follows the
moving radio and updates when the viewport changes. Its orientation comes from
`Part.SurfaceGui.Face`, so that face must match the actual display surface.

**Backspace**, **Escape**, or another click on the same housing/display closes
the view. The previous camera type, subject, view and field of view are restored.
Temporary mouse locks are released; Roblox then owns normal first-person,
third-person and shift-lock behavior again. Player camera mode and zoom limits
are never changed.
Escape may also open Roblox's standard menu; opening that menu always leaves
the close-up. Gamepad B and a touch “Späť” button also exit. Moving out of range,
respawning, radio removal, or replacement of CurrentCamera ends the close-up.
It never changes the character's position or radio registration.

Refresh the existing bridge bundle to install `JopRadioCameraController`, a
**LocalScript in StarterPlayer/StarterPlayerScripts**, then publish and join a
fresh server. No radio model or MainHandler edits are needed for the camera.
For manual installation use
`roblox/StarterPlayer/StarterPlayerScripts/JopRadioCameraController.client.lua`.

Run `node --import tsx scripts/verify-radio-camera.ts /path/to/luau` for framing,
window resizing, moving/rotated radios, keypad exclusion and camera/input
restoration checks. Physical mesh orientation and actual Roblox input behavior
still need Studio acceptance.

The focused screen temporarily uses `SurfaceGui.AlwaysOnTop` to prevent
intersecting model geometry from cutting into its text. This is local to the
focused panel; its original depth behavior returns on exit. Keypad text uses
transparent backgrounds rather than baked-in white selection blocks. Number
entry has explicit callsign/train-number prompts, a large value with an
underscore cursor, and confirmation/deletion instructions. Both cabins receive
the same prompt and input value.

## DIS connection, position and occupation labels

Môj vlak polls the confirmed registration and physical sensor contacts. It shows
GSM-R connection status, the radio’s category/number, and the current station’s
human-readable name. A registration on a server with an expired heartbeat is
shown disconnected. Unknown position is stated explicitly, rather than using
the selected destination or revealing the internal helper station.

The hardware observer reports every touching vehicle sensor UUID even when
the section remains occupied as one vehicle replaces another. It measures
travel direction from assembly velocity, falling back to sensor displacement
for CFrame-driven trains. The last direction survives stops. The backend
chooses the frontmost eligible currently occupied standard single-cell
indicator per registered vehicle; switches and diagonals do not carry labels.
If a stationary spawn spans multiple indicators with no measured direction,
no label is guessed until direction becomes known. Multiple registrations on
one indicator are joined with commas; identical category/number text is
deduplicated.

`PhysicalOccupation.vehicles` is optional for legacy documents. New contact
telemetry is persisted in the session before `runtime.physicalTrainLabels` is
projected into station documents. Mongo change streams publish the resulting
full station snapshots. Identity-only reports do not replay occupation
transitions, route progress or lineblock releases. The runtime client only
displays the saved label and offers **Označenia vlakov** to toggle it locally.
Text is white, centered on the existing inner occupation rectangle, and uses
the shared orientation handling. No tile artwork or signaling geometry changes.

Refresh **JopBridge (Main.server.lua)**, **HardwareDriver**, and
**GsmRController** through the bridge updater, publish, join a fresh server and
register again. Old bridges still report safe occupied/clear states, but cannot
identify a train. Dashboard updates use the existing 15-second polling; sensor
identity reconciliation runs every second.

Verification:

```sh
node --env-file=.env.local --import tsx scripts/verify-physical-trains.ts
node --import tsx scripts/verify-physical-sensors.ts /path/to/luau
```

The HTTP/Mongo test covers leading sections, reversal, standard-tile filtering,
shared sensors, GVD/Pos category resolution, cross-station position, stale
heartbeats and deregistration. The Luau test executes the actual hardware
observer, including late radio initialization and occupants changing while the
section remains occupied. Both use isolated fixtures and preserve live state.

Radio display text is normalized to plain ASCII, including backend errors. The
callsign prompt uses two lines (`VOLACI ZNAK` / `RUSNOVODICA`); the shorter
`CISLO VLAKU` prompt uses one. Entry prompts and help reserve the right-hand
indicator strip and wrap within their own bounds. No manual GUI edits are
needed; refresh GsmRController for this layout/copy change.

## Browser calls, emergencies and radio zones

After deploying this update, restart the custom DIS server, refresh the
**GsmRController ModuleScript**, then publish and restart Roblox. MainHandler,
GsmRCameraController and the model/GUI do not need changing for this update.
Keep the existing LiveKit environment variables configured on the custom server.

1. Open the live session in DIS. Drivers use their **Rušňovodič** communication
   inbox; dispatchers select their station and use the **Výpravca** inbox.
2. The first eligible communication tab automatically claims the voice terminal.
   Keep it open and permit microphone/audio access when the browser asks.
   A compact headset icon in the caption shows green for this tab, amber when
   another tab owns it, grey when inactive, and red for an action error.
   Hover or keyboard-focus the icon for status, notices and click instructions.
   Click the active icon to release it, or an inactive icon to claim this tab.
   Other tabs cannot take over or answer. Automatic claiming itself does not
   open the microphone; audio still uses the browser's normal permission checks.
3. Register the in-game radio normally. On its main screen:
   - **F8** calls the current station's **výpravca** (VO67 shortcut **1300**).
   - **F1** opens number dialing. Enter **1300**, then **StarEnter**, to call
     the same station. Other numbers currently report unavailable.
   - **StarEnter** answers an incoming call by simulating **lifting the handset**.
     The display explicitly says `*: ZDVIHNUT SLUCHADLO`. It does not hang up.
   - **F6** or **NULL** rejects an incoming call, ends a normal call, or stops
     your own emergency broadcast. The existing model's `End` button supplies
     this cancel/NULL action. In an entry screen NULL cancels the entry.
   - **RadioStop** starts the session-wide emergency. To end it, use F6/NULL;
     pressing the red key again explains how to end it without creating another.
   - **F → RadioStop** starts a station-only emergency (a game shortcut).
   - **F9** is reserved for the separate traffic dispatcher (**1200**), and
     **F7** for the electrical dispatcher (**1400**). Both explicitly report
     unavailable; neither silently calls the station výpravca.

4. Dispatchers can call a driver using the existing browser contact list and
   **Zavolať**. Calls may be answered or ended from either the browser or radio;
   all cabins mirror the server state. The radio poll adds up to roughly one
   second of display delay; it never carries audio.

Normal calls allow one partner per person. A station can have several active
staff terminals: all available terminals ring, and the first answer wins.
Starting your own emergency hangs up your normal call. Receiving emergencies
keeps your normal call and microphone connected to its original partner.
Multiple incoming emergencies play simultaneously. Only each emergency's
originator publishes into that broadcast; listener tokens cannot publish.
To speak to everybody yourself, start your own broadcast.

Session-wide broadcasts capture every active driver/dispatcher voice terminal
in that session. Station broadcasts capture that station's dispatchers and
registered drivers whose physical sensors are in that station at the moment
of starting. The audience stays fixed until the originator stops, even when
trains move. Drivers in inter or with unknown position cannot call a local
dispatcher or start a station broadcast. A captured listener may release and
reclaim a tab and resume the same still-running broadcast.

Tab ownership uses a Mongo compare-and-set lease: heartbeats every five seconds,
expiry after twenty seconds. Clicking the active headset icon releases it explicitly;
an observed socket disconnect releases it immediately. Otherwise, loss of
heartbeats ends that user's normal call and any broadcast they originated on
expiry. Another tab must wait; there is no forced takeover. Browser microphone
and autoplay permissions still apply; use **Povoliť zvuk** if playback is blocked.

The existing **RadioChannel/TextLabel** shows the physical radio zone.
Station codes are allocated once and persisted by universe/place/station in
`radio_station_zones`, using an initial letter and a unique numeric suffix
(e.g. Kolárovo **K1**, Veselé **V1**). Moving between stations updates the display;
**inter = 00**, unknown position = **--**. These are simulation area identifiers,
not GSM-R frequencies, and do not alter call routing rules.

The custom server owns the live call lifecycle. `radio_terminals` stores the
current lease and browser/radio read model. HTTP radio commands enter
`radio_control_commands`; the authenticated `/chat` signalling service consumes
them once, rechecks the binding, and publishes updated state to all of the
user's tabs. Media cleanup retries asynchronously so a LiveKit outage cannot
block heartbeats. Calls end when the custom server restarts; they are not
restored as active audio sessions. This deployment assumes one custom server
process owns signalling.

Verification:

```sh
npm run test:dis
node --env-file=.env.local --import tsx scripts/verify-radio-calls.ts
node --import tsx scripts/verify-gsm-r-radio.ts /path/to/luau
```

The Mongo verification isolates all collections with a temporary prefix and
removes them afterward. Engine and HTTP tests use a media fixture; a final
end-to-end microphone test requires two signed-in browser users and a live
Roblox server.

### VO67 control fidelity

Chapter C of the T-CZ manual, pages C6–C7 and C12, assigns F8 to the station
controller, F9 to the traffic dispatcher, F7 to the electrical dispatcher,
F1 to number dialing, and F6/NULL to ending calls. Incoming ordinary calls
are answered by lifting the handset. Since the supplied model has no handset
interaction, StarEnter is the explicit pickup substitute; F6 rejects rather
than answers. An incoming call interrupts the dialing screen and shows pickup
and reject instructions. Draft call numbers never change the registered train
number, callsign or locomotive function. Both cabins share the dialing screen.

The previously agreed broadcast rules remain game adaptations: several
simultaneous incoming emergencies, normal calls continuing for listeners,
originator-only speech, station/session scopes, and the F+RadioStop shortcut.
This control update does not introduce real GSM-R priority pre-emption or VGCS
floor control. It also retains the area-code display rather than pretending
that the displayed station code is a real simplex channel.

Main-screen status/errors and operation hints use separate bounded text rows.
Both wrap and scale inside the central display body, reserving the header,
right-hand call symbols and bottom function-key artwork. This layout repair is
applied by GsmRController at attachment; no Studio GUI edits are required.

A powered-off LCD renders an opaque black frame over the whole SurfaceGui,
with all operating frames hidden. The GUI remains enabled only to cover the
model's grey screen backing. Power-on hides that frame and shows the normal
startup/display; no screen-part material or color needs changing in Studio.

Automatic claiming runs once per authenticated socket after the inbox is ready,
and only if no terminal owner is known. Concurrent tab attempts still use the
Mongo lease arbiter. Releasing the icon disables automatic claiming for that
mounted dock, so heartbeat/contact updates cannot immediately take it back.
Existing waiting tabs remain available for a manual claim after unlock/expiry.

### Overlapping station zones

Station selection ignores every inter contact before comparing stations. Inter
alone supplies no station or local dispatcher (the radio keeps the outside-area
code 00). If normal stations overlap, the section furthest ahead in measured
travel direction chooses the station; the same result drives the radio zone,
driver position, local dispatcher shortcut and new station emergency audiences.
Roblox measures direction from velocity or actual position changes and retains
it through stops; reversing reverses the comparison. Board X coordinates and
station names do not establish train direction. Missing measurements for a
candidate station, or equally frontmost stations, give unknown/-- rather than
an arbitrary dispatcher. Existing emergency audiences remain frozen.

Internal inter occupancy is still reported for railway logic; ignoring it here
only changes identification/radio location and prevents it stealing a station's
train label.
