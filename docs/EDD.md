# Dispatcher diary and operating messages

The EDD uses the existing DiS station/session selection and station ownership lease. It retains
the Aero light/dark themes and the Slovak/English language selector. The station owner can
record arrivals, departures and passages; readers do not receive write permission. Service
takeover/release remains in the existing station-selection workflow rather than a second EDD lease.

## Workflow

- Two rows per train: arrival above departure/passage. Originating and terminating trains do
  not require fictional endpoint movements. A timetable's intermediate `kind: pass` produces
  one passage entry. A manual train's movement type can be set before actual movements exist.
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
  communication/bilingual display preferences use the existing account-preference service.

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

Delivery means a station owner opened the message panel; acknowledgment is a separate action.
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

`edd_diary_messages` stores structured exchanges, with sender/recipient indexes and a unique
offer-response index. No new Appwrite attributes, browser collection permissions or credentials
are required. The API's existing Mongo credentials create the additive collections/indexes.
The screen polls every five seconds, reusing the existing authenticated request/resource layer;
only 150 recent messages are sent to the work screen. Historical records remain in Mongo.

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
