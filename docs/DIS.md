# DIS setup and verification

The homepage redirects to `/dis`. Live sessions, the railway pult, EDD, TPV,
shifts, personnel, documents, GVD, and simulation are operated from that portal.
The station editor, station/network manager, and linker remain available as
embedded authoring tools. Existing railway APIs and MongoDB snapshots are reused.

## Configuration

Copy `.env.example` to `.env.local` and supply the real values. Keep runtime
bridge settings as well as DIS settings:

- `MONGODB_URI`, `MONGODB_DB_NAME`: MongoDB with replica-set change streams.
- `ROBLOX_UNIVERSE_ID`, `ROBLOX_OPEN_CLOUD_API_KEY`, `ROBLOX_INBOUND_SECRET`,
  `ROBLOX_MESSAGING_TOPIC`: the existing JOP bridge.
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`,
  `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`, `APPWRITE_STORAGE_BUCKET_ID`: DIS.
- `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, `ROBLOX_GROUP_ID`,
  `ROBLOX_REDIRECT_URI`: Roblox login. Configure the callback URL in Roblox too.

After deploying the current application, run the complete idempotent setup:

```sh
npm run dis:setup
```

This creates missing collections and attributes, repairs numeric defaults,
waits for attributes to become available, and applies server-only access rules.
It also upgrades existing installations without deleting documents. The legacy
`init-appwrite-cli.ts` and `fix-defaults.ts` entrypoints delegate to this setup.
Do not run setup while serving an older client that accesses Appwrite directly.
The Appwrite server key needs database read/write, user read/write and custom
session/token creation for OAuth, and storage read/write for attachments.
The Appwrite project must allow the website origin as a web platform.

A group guest/non-member or an unmapped group role is rejected. Roles are
synchronized from Roblox at login; an existing training assessment is retained
when the DIS role is unchanged. Name and rank must both match the explicit mapping:

| Roblox role (rank)                                  | DIS role              |
| --------------------------------------------------- | --------------------- |
| Driver (2)                                          | driver                |
| Dispatcher (4)                                      | dispatcher            |
| Trainee Driver (8)                                  | driver trainee        |
| Trainee Dispatcher (9)                              | dispatcher trainee    |
| Driver Trainer (28)                                 | driver instructor     |
| Dispatcher Trainer (30)                             | dispatcher instructor |
| Head Of Drivers (201)                               | driver manager        |
| Head Of Dispatchers (203)                           | dispatcher manager    |
| Contributor (235)                                  | admin                 |
| Board of Executives (254), Executive Director (255) | admin                 |

Passenger, Member, Other Staff, Head Of Conductors, Relations
Director, Workforce Director, Shift Manager, unused roles, and unknown roles
do not currently grant DIS access. Assign these only after their responsibilities
are defined. Existing sessions and temporary password accounts are not revoked
when this mapping changes.
Login uses the OAuth access token from the Roblox sign-in to read Open Cloud
memberships and roles; no additional user-owned API key is required. The existing
group-owned bridge key remains unchanged. Calls outside login can use a user-owned
`ROBLOX_API_KEY`; group-owned keys are rejected by the membership endpoint.
It resolves the assigned role resource paths to actual
names and ranks and selects the highest explicitly authorized rank. An unmapped
legacy single-role response also triggers this lookup, so another assigned role
can grant access even when an unrelated role is the legacy primary role. OAuth
logins resolve the complete role set even if the public response already matches
a lower DIS role, so Contributor admin access is not masked. This follows the
[Roblox Groups API](https://create.roblox.com/docs/cloud/reference/features/groups).
Lookup failures do not grant membership or downgrade staff to an invented rank.
Login errors must be fixed at their source; do not grant a fallback staff profile.

## Deploying access rules

All current DIS data access goes through authenticated server routes. Older
setups granted direct database write access to every signed-in user. After
**deploying these routes and clients**, `npm run dis:setup` applies the collection
policy too. To inspect or reapply only that policy:

```sh
node --env-file=.env.local --import tsx scripts/secure-dis-appwrite.ts
node --env-file=.env.local --import tsx scripts/secure-dis-appwrite.ts --apply
```

The first command is read-only. The second removes direct browser grants and
disables individual document/file ACLs so old grants cannot bypass the server.
It preserves data. API-key-backed server access continues to work. Do not run
it while serving an older client that still accesses collections directly.

## Workflows

Train categories for both GVD and manual EDD entry are defined in
`src/lib/dis/train-categories.ts`. Both server schemas use that same catalog.
The menus show codes and names, grouped into passenger, freight, and operational
trains. Historical Slovak categories remain available for older-era timetables.
Passenger designations follow [ŽSR GVD 2025/2026, section 3.1](https://tis.zsr.sk/pogvd/data_2026/zcp/rzgvd.pdf);
historical freight codes are also documented in the [ŽSR 2004 annual report](https://www.zsr.sk/files/o-nas/vyrocne-spravy/vyrocnasprava2004.pdf).

1. Select an active session and station in DIS.
2. Select a place and create daily train schedules in **Tvorba GVD**, choosing
   stations from that place's saved layout. Each timetable stores its place ID;
   duplicate numbers and conflicts are checked within that place. Existing
   legacy timetables without a place are not assigned automatically and are not
   listed until explicitly assigned. Check conflicts before using them. Conflicting schedules may
   be saved for further editing; the report remains visible after saving.
3. In EDD, select a train and import its GVD. Repeating an import does not
   duplicate entries or overwrite actual times. Additional trains can be entered
   manually. Record arrival before departure.
4. TPV uses the same GVD and actual reports. It does not invent a physical train
   position between reports. Labels and clock times are schematic daily values.
5. Radio messages belong to the selected session. They are text records inside
   DIS; signal operations and odhlaska remain on the railway pult.
6. Managers can save document drafts, publish them, manage shifts/attendance, and
   record personnel assessments. Attachments are stored in Appwrite Storage.

The timetable model has no distances, headway limits, platform lengths, or
track multiplicity for inter-station sections. The implemented conflict check
identifies same-track dwell overlaps and warns about concurrent section use.
It does not certify operational safety or calculate missing infrastructure data.

## Checks

To populate personnel before members first log in, run:

```sh
node --env-file=.env.local --import tsx scripts/import-roblox-personnel.ts
node --env-file=.env.local --import tsx scripts/import-roblox-personnel.ts --apply
```

The first command previews the complete roster; the second adds missing profiles.
Only roles in the existing DIS role mapping qualify. Multi-role members use
their highest authorized role. Existing profiles and assessments are preserved.
The import creates no login sessions or credentials; first login creates the
account and reuses the deterministic `rbx_<Roblox user ID>` profile. Re-running
the import is safe. It is a one-time backfill, not ongoing group synchronization.

The document editor has formatting controls, write/split/preview modes, multiple
file upload, file drop and clipboard-image paste. Images can be enlarged; PDFs
use the browser viewer; text, PPTX slides and DOCX have text previews. Other
Office files and ZIPs provide downloads. Attachments remain authenticated.
The limit is 10 MB per file. Run `npm run dis:setup` after deploying to update
the allowed file extensions on an existing storage bucket.

`scripts/verify-document-attachments.ts` checks the live document/upload APIs,
original filenames, protected downloads, and persisted draft links with isolated
fixtures and cleanup. Set `DIS_TEST_BASE_URL` if the app is not on port 3000.

```sh
npm run build
npm run test:dis
node --env-file=.env.local --import tsx scripts/verify-dis-services.ts
```

The offline tests cover OAuth callbacks, concurrent account creation, group-role
lookup, authenticated attachment handling, schema setup, and timetable rules
using simulated external-service responses.

The service integration check uses the configured Appwrite database and MongoDB,
creates isolated fixtures, checks intermediate and final persisted states, and
removes its fixtures. It verifies that EDD does not mutate the railway runtime.
It does not exercise account authentication or Storage.

For full authenticated HTTP checks, run the application with its custom server
and use a disposable test account environment:

```sh
PORT=3101 NODE_ENV=production node --env-file=.env.local --import tsx server.ts
DIS_TEST_BASE_URL=http://localhost:3101 node --env-file=.env.local --import tsx scripts/verify-dis.ts
```

The HTTP check creates temporary Appwrite users/sessions, database records,
a Storage file, and an isolated Mongo session. Cleanup runs on failure too.
Appwrite Users and Storage must be healthy; an HTTP 500 from those services
prevents full end-to-end verification and is not a successful login test.
