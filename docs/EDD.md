# Dispatcher diary and operating messages

The EDD uses the existing DiS station/session selection and station ownership lease. It retains
the Aero light/dark themes and the Slovak/English language selector. The station owner can
read and record arrivals, departures and passages only for their currently claimed stations. The top dispatcher selector contains only those claims; direct EDD API access also requires a live claim. Service
takeover/release remains in the existing station-selection workflow rather than a second EDD lease.

## Workflow

- One row per train presents arrival and departure side by side, including passing trains. Origins and termini disable only the inapplicable endpoint. A manual train's movement type can be set before actual movements exist.
- Quick actions use server operating time at whole-minute precision. Manual entries accept `1803`
  or `18:03` and an explicit operating date. Midnight is resolved using dates, not
  an assumed clock ordering. Existing records without event dates retain their original values.
- Corrections require a reason; history retains before/after values and the operator, real
  timestamp and operating clock at the time of the command. Cancellation does not delete a
  train and is restricted to trains without a recorded movement.
- Editing holds the revision selected when the draft was opened. Polling cannot silently
  advance that revision and overwrite another operator's changes. Re-select a train after a
  conflict. Records are not optimistically changed before the server accepts a command.
- The diary keeps its order while editing. Active/completed/all filters, train search and
  preset-composer display preferences use the existing account-preference service.

Manual movement controls remain visible directly beside each row action, including a planned → resulting time preview and individual arrival/departure offsets. Train numbers can be copied; unspecified tracks display “–”. Unused endpoint rows are omitted. Enter HH:mm or a whole-minute offset from the planned time, review actual/planned time and date, then save. Negative offsets and midnight date changes are supported. This offset belongs to that movement and never changes the session clock. Existing times require a correction reason.

## Preset communication

Select a train, recipient and message type; review the preview, then send. Arrival/departure
presets can reuse the selected record's actual times. Acceptance repeats the source offer's
time and departure station; it does not substitute the receiving station or current clock.
Known station names use explicit Slovak grammatical forms; unknown names have editable forms.

Offers, acceptance, waiting and ordinary odhláška patterns are based on these references:

- Archived ŽSR D 2, articles 483–484: <https://www.rail.sk/arp/slovakia/leg/d02-08.htm>
- Indexed ŽSR Z 1, articles 745–748: <https://www.zsr.sk/files/dopravcovia/legislativa/predpisy-zsr/zsr-z-1.pdf>
- ŽSR EDD training material: <https://www.zsr.sk/files/uivp/sylaby/15os-16.pdf>
- ŽSR's description of electronic distribution: <https://www.zsr.sk/pre-media/zeleznicny-semafor/_/attachment/inline/343ea4fa-02b2-40bc-9513-e9b79e01dbbb%3Ae6ec080472dd0d38f9017f8341b590c7925b0056/pdf_2009-6.pdf>

English is a game translation, not an official ŽSR phrasebook. Other notices are explicitly
labelled simplified game messages. This is a game-oriented diary, not a verified reproduction
of a particular commercial EDD release or a complete amended 2005 D 2 edition. Z 1 and Z 14
postdate 2005; the original Z 1 PDF link was unavailable during research, so indexed clauses
and published training material were used as cross-references.

Delivery means a station owner opened the existing conversation; acknowledgment is a separate action.
The sender cannot acknowledge for the recipient. Offers can receive one acceptance/wait reply;
waiting requires a new offer before acceptance. Linked corrections/cancellations preserve the
original message. Request IDs make retries idempotent. Station ownership and recipient scope
are checked on the server for every send/receipt/acknowledgment.

An arrival is not an odhláška. Before sending the latter, the operator must explicitly confirm
that the complete train has cleared and the conditions are met. Neither the EDD record nor
its messages operate signals, change reservations, or release a lineblock. The existing pult
odhláška action remains authoritative. No new Roblox movement-detection contract is invented.
Session topology identifies adjacent stations; other real session stations remain selectable
for operational communication. Telephone templates are available when needed, not imposed on
every normally functioning block system.

## Persistence and compatibility

Existing Appwrite `edd_records`, IDs, GVD imports and timetable documents are preserved. New
actuals, notes, movement type and history are owned by an additive Mongo collection,
`edd_diary_entries`, keyed by session/station/record ID. Existing values are copied only on first
use; subsequent GVD refreshes do not replace actuals or history. Untouched entries can receive
their timetable endpoint/pass classification even if TPV first loaded the legacy record.

`/api/dis/edd` and `/api/dis/tpv` both read this projection. This is important: direct Appwrite
inspection alone no longer represents the latest actuals after an EDD edit. Do not deploy an
old EDD/TPV server over this version without accounting for the overlay. Legacy records have
no fabricated audit trail; history begins with changes made through the new diary.

`session_chat_messages` stores both ordinary chat and structured EDD exchanges in the same station conversation, with a unique offer-response index. There is no separate EDD message history or legacy radio-log panel. The existing chat transport delivers presets and receipt/acknowledgment updates; English users see the translated structured message. No new Appwrite attributes, browser collection permissions or credentials
are required. The API's existing Mongo credentials create the additive collections/indexes.
The screen polls every five seconds, reusing the existing authenticated request/resource layer;
only 150 recent structured messages are sent to the work screen for linked replies. Historical records remain in Mongo.

## Preview and checks

Run `npm run preview:edd`, then open <http://127.0.0.1:1423/>. It renders the production component
and styles with isolated in-memory sample transport/authentication. Switch between Kolárovo
and Veselé to try offers, acceptance and acknowledgment; switch languages/themes, record
origin/terminus/pass/stopping movements, and use the simulated-save-failure button. Reload
resets sample operations. This preview never accesses the live game or database.

- `npm run test:dis`: domain/authentication regressions, including EDD endpoint behavior,
  minute-only entry, legacy second-precision graph positions and bilingual message patterns.
- `npm run test:dis:edd`: disposable Mongo session checks for revision races, role/ownership
  enforcement, midnight, corrections, clock-offset preservation, message retries, reply races,
  receipt versus acknowledgment and odhláška prerequisites. Requires `.env.local`; deletes only
  its generated session's fixtures.
- `npm run test:dis:services`: existing isolated Appwrite/Mongo DiS workflow regression.
- `npm run build`: production API and SPA build.

The preview is not an end-to-end live Roblox acceptance test. Existing unrelated standalone
SPA typing issues and UI-copy-checker findings are reported in the pull request.

Arrival/departure/passage entries and operating messages use HH:mm only. Seconds remain on the
live clock and internal audit timestamps. Legacy records are readable without being rewritten.

Train rows now present arrival and departure horizontally, including passing trains. Passing trains default to equal movement times until departure is edited. Endpoints disable only the inapplicable movement. A single train command atomically records both times; Save with layover records arrival (or waiting at an origin) without recording a departure. Dwell is persisted as a flag; the proposed departure and delay follow the session clock in the UI without per-minute database writes, until manually overridden or saved. Only exact dated movement reports acknowledged by the receiving station lock their matching recorded movement. Other events remain editable; revision checks cover concurrent acknowledgments.


## Shared train workspace and live TPV

The train number in EDD, a train number in an ordinary/structured chat message, and a second click on a selected graph path open the same bounded dialog. It shows the operating timetable, available driver metadata, dispatcher-recorded times, last reported stop, and explicitly labelled estimates. These are dispatcher reports, not inferred GPS or sensor-confirmed positions.

`/api/dis/traffic` is an authenticated, live-session read model combining active operating timetables, legacy EDD records, the Mongo diary overlay (without audit history), current driver selections and the operating clock. It does not initialize diary rows or alter runtime/Roblox state. One shared client resource polls every 10 seconds while EDD, TPV or the train dialog needs it, using the existing reconnect/backoff layer; saving EDD refreshes it immediately. Layover advances estimates locally each minute, with no periodic database writes. Hidden EDD/TPV views stop their own polls. Station runtime and chat keep Ninjonik’s existing socket reconnect logic.

`train-progress.ts` propagates recorded deviations along the ordered timetable. Passing trains retain early running; stops do not forecast departure before booked time. Actual departures override estimates and stale layover flags. Actuals and neighbor acknowledgments remain separate. Forecasts never write into planned or recorded times. The green TPV clock always means operating time, even after navigating to another time.

TPV uses black passenger and blue freight paths, heavier selected paths, directional section-boundary arrows, orange 5/30/60-minute divisions, and a green clock. Account preferences store up to 12 named station-section layouts (within the existing 8 KB preference limit). Layouts are private preferences, not new session topology.

Chat retains its existing station/driver conversations and sound assets. Contacts are grouped, tabs wrap, and only the latest conversation message offers operating reply/correction controls. History stays visible; server reply/acknowledgment rules are unchanged. Structured Slovak message patterns were cross-checked against the indexed ŽSR Z1 and OS 506 training examples referenced above; English remains a game translation, not an official prescribed railway text.

Digital ZCP follows the selected theme. A4/print clones explicitly reset text fill, text colour and row shading to black on white, preserving the existing geometric scale, heading and footer. Native PDF still requires A4, 100% and background graphics; no SVG background workaround is used.

The sample EDD preview now also exposes TPV and a +6-minute upstream report; switch to Veselé to inspect propagation. Samples include origin, terminus, passing, stopping, reverse-direction and freight trains. The GVD preview also supports the train dialog and dark digital/white A4 comparisons.

The diary writer initializes a session-ID read index for shared snapshots; repeated EDD projection reads initialize only missing rows and changed untouched timetable hints. Existing operated records and audit histories are preserved.
