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
| Board of Executives (254), Executive Director (255) | admin                 |

Passenger, Member, Other Staff, Head Of Conductors, Contributor, Relations
Director, Workforce Director, Shift Manager, unused roles, and unknown roles
do not currently grant DIS access. Assign these only after their responsibilities
are defined. Existing sessions and temporary password accounts are not revoked
when this mapping changes.
The Open Cloud fallback requires `ROBLOX_API_KEY` with read access to group
memberships and roles. It resolves the assigned role resource paths to actual
names and ranks and selects the highest rank, following the
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

1. Select an active session and station in DIS.
2. Create daily train schedules in **Tvorba GVD**, using station IDs from the
   station picker. Check conflicts before using them. Conflicting schedules may
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
