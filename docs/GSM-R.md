# GSM-R registration in Roblox

This slice links a physical vehicle sensor, every radio in its cabins, a Roblox
player, their DIS driver selection, and an explicit GVD timetable. It does not
change occupation reporting, train movement, station labels, radio calls,
RadioStop, simplex operation, or web voice calls.

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
profile must be eligible as a driver. In **Môj vlak**, select a saved GVD train
for the same live Roblox session/place. A custom number without a timetable ID
cannot register. Operating category is taken from that selection, separately
from the locomotive function code.

- **Power**: switch the shared unit on. A three-second startup screen is a game
  adaptation; the real unit's startup is longer.
- **F3**: begin registration. Enter the three digits of your DIS callsign (for example **042** for
  **ZSSK-042**), then **StarEnter**.
  The number-entry screen shows `VOLACÍ ZNAK RUŠŇOVODIČA` and a large input value during this step. The server
  matches that callsign to the player’s linked Roblox profile; another person’s
  callsign is rejected.
- Enter the exact GVD train number, then **StarEnter**. Use **Zero** for 0 and
  **Delete** to erase the last digit. Train numbers support one to six digits;
  leading zeroes are significant and must match the saved GVD.
- Select **F1–F5** (or **1–5**) in the locomotive-selection screen: first locomotive,
  second locomotive, banking locomotive, shunting onto the train, shunting away
  from the train. These map to functional codes **01–05**.
- Press **StarEnter** again on the main screen to send registration to JOP.
  `R`, `REGISTROVANÝ`, and the registered train appear only after confirmation.
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
The ten-second repair poll retries discovery and reconciles registrations.
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
`JOPGsmRTimetableId`, and `JOPGsmRFunctionCode`. These attributes are not yet
consumed by station control or occupation events. Runtime script hot-reloading
is not a persistence mechanism: restart the Roblox server after script updates.

## References and deliberate adaptations

The [T-CZ VO67 GSM-R manual, Polish chapter C](https://www.zzm-czechowice.pl/wp-content/uploads/2016/01/System-GSM-R.pdf),
pages C4 and C6, documents train-number/function-code entry, F3 registration,
F4 deregistration, and the registration indicator. The
[Czech VO67 guide in ORLEN PRP 69](https://www.orlenunipetroldoprava.cz/CS/o-nas/Documents/PRP%2069_UNIDO_V1Z0_FINAL_II.pdf)
also covers the device. Consult the original manuals for real railway use.

The three-digit DIS callsign screen, DIS/GVD validation, shared mirrored input, short
startup, final confirmation, and no-takeover policy are application adaptations.
Only registration is implemented; unavailable functions report that explicitly.

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
Both cabins must agree at every intermediate step, and an occupied station
sensor must still render exactly as before, without a new train label.

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
