import type { DriverTrain } from '@/lib/dis/driver-train';
import type { EddEntry } from '@/lib/dis/edd';
import type { EddRecord } from '@/lib/dis/records';
import { listDocuments, requireDisProfile } from '@/lib/server/dis/appwrite';
import { requireLiveSession } from '@/lib/server/dis/claims';
import { disResponse } from '@/lib/server/dis/http';
import { sessionClockSnapshot } from '@/lib/server/dis/session-clock';
import { loadOperatingTimetables } from '@/lib/server/dis/session-timetables';
import { getMongoDb } from '@/lib/server/mongo';
import { sessionIdSchema } from '@/lib/station/domain';
import { Query, type Models } from 'node-appwrite';

/** One bounded session read for the shared train window, forecasts and TPV. No runtime writes. */
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const sessionId = sessionIdSchema.parse(new URL(request.url).searchParams.get('sessionId'));
    await requireLiveSession(sessionId);
    const db = await getMongoDb();
    const [timetables, legacy, overlay, drivers, clock] = await Promise.all([
      loadOperatingTimetables(sessionId),
      listDocuments<Models.Document & EddRecord>('edd_records', [
        Query.equal('sessionId', sessionId),
      ]),
      db
        .collection<EddEntry>('edd_diary_entries')
        .find({ sessionId }, { projection: { history: 0 } })
        .toArray(),
      db
        .collection<DriverTrain>('session_driver_trains')
        .find({ sessionId, expiresAt: { $gt: Date.now() } })
        .toArray(),
      sessionClockSnapshot(sessionId),
    ]);
    const records: EddEntry[] = legacy.map((record) => ({
      ...record,
      revision: 0,
      movement: !record.schedArrival ? 'origin' : !record.schedDeparture ? 'terminus' : 'stop',
      notes: '',
      history: [],
      eventDates: {},
    }));
    const indexed = new Map(records.map((record) => [record.$id, record]));
    for (const record of overlay) indexed.set(record.$id, { ...record, history: [] });
    return { timetables, records: [...indexed.values()], drivers, clock };
  });
}
