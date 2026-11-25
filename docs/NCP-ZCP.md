# NCP, infrastructure and ZCP

The GVD workspace includes a **Mapa a dopravné body** tab. Select a transport
point for its type, name, grid position and column-2 measures. Select a line for
track count, block system, opposite-direction operation, prescribed speed and
required braking percentage. Add branches from a selected point, or connect
existing points. **Uložiť sieť** persists changes; switching tabs keeps the draft.
The undo button restores previous local edits. Refresh discards edits only after
confirmation. A concurrent save returns a conflict instead of overwriting a newer
network.

The initial Kameňansko network uses the two supplied map PDFs and confirmed
corrections: Klenov and odb. Chým inclusive, plus the Teriakovce and Kolárovo
branches. It includes AH Brekov and AH Prílesie. The lower route through Dvorníky
zastávka z is double-track. Unfinished continuations are excluded from new
suggestions. Legacy timetable IDs remain readable and are not deleted.

Network records live in MongoDB `railway_networks`, keyed by universe and place.
Only existing GVD management roles may write; authenticated users may read.
Defaults are returned without writing until an authorised author saves. Unknown
signalling and braking values are left unspecified. Existing railway-line
templates, measured times, timetable documents and Roblox interfaces remain
independent. New network points are accepted by timetable and route validation.

The NCP remembers orientation independently from the selected train. Reverse
selection does not reverse the station axis. An explicit button reverses it.
Dragging, selected-train filtering, time/station scales and snapping are stored
per user and route scope in `dis_preferences`. Theme and general website/audio
preferences use the same account-scoped store, with browser fallback. Physical
microphone/speaker device IDs remain local. The time-offset control is unchanged
in production; the isolated preview no longer forces administrative clock access.

The digital ZCP uses numbered railway columns 1, 2, 3, 5, 6, 7 and 8. Column 3 is
running time; column 8 is prescribed speed / **required**, not achieved, braking
percentage. Infrastructure markings and column-2 measures use the saved network.
Intermediate operating points may be shown without invented passing times.
Route via a particular branch by including its transport point in the timetable.
Unknown technical values stay blank. HKV class, carrier, brake mode and header
notes can be entered under **Ďalšie údaje vlaku** and remain in planning metadata.

**Náhľad A4** and **Tlač / PDF** copy the actual digital table with its computed
styles, then apply one geometric scale to fit 182 mm inside A4's 14 mm margins.
There is no independently restyled print table. Long tables split at row
boundaries, retain the table header, and show generation time and page numbering.
The print root is isolated from the app's responsive layout, so mobile minimum
table widths cannot clip it. Return from the preview before continuing editing.

Validation:

- `npm run test:dis`
- `node --env-file=.env.local --import tsx scripts/verify-ncp-persistence.ts`
- `npm run build`
- Targeted ESLint and `git diff --check`
- `npm run preview:gvd`: isolated fixture UI; `?printTest=1` adds a deliberately
  long test working for pagination. It never writes production timetable data.

The Roblox paper-on-desk feature is not part of this update.
