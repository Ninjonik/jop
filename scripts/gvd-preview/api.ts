import { newPlanning } from '@/lib/dis/gvd-planning';
import { railwayLineSchema, type RailwayLine } from '@/lib/dis/lines';
import { checkTimetableConflicts, normalizeTimetable, type Timetable } from '@/lib/dis/timetable';

const placeId = '113144512557419';
const routeId = '11111111-1111-4111-8111-111111111111';
let trains: Timetable[] = [
  {
    trainNumber: '90001',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 100,
    stops: [
      { station: 'kolarovo', arrival: '08:00', departure: '08:00', track: '1' },
      { station: 'vesele', arrival: '08:12', departure: '08:13', track: '1' },
      { station: 'hlavna', arrival: '08:25', departure: '08:25', track: '2' },
    ],
    planning: { ...newPlanning(), daily: true, lineId: routeId },
    $id: 'fixture-90001',
    $updatedAt: '2026-11-25T10:00:00.000Z',
  },
  {
    trainNumber: '99001',
    trainType: 'Mn',
    maxSpeed: 60,
    trainLength: 180,
    stops: [
      { station: 'kolarovo', arrival: '09:00', departure: '09:00', track: '2' },
      { station: 'vesele', arrival: '09:20', departure: '09:25', track: '2' },
      { station: 'hlavna', arrival: '09:45', departure: '09:45', track: '1' },
    ],
    $id: 'fixture-99001',
    $updatedAt: '2026-11-25T10:00:00.000Z',
  },
];
let lines: RailwayLine[] = [
  {
    id: routeId,
    placeId,
    name: 'Kolárovo → Kameňansko (ukážkové časy)',
    stations: ['kolarovo', 'vesele', 'hlavna'],
    measuredStops: structuredClone(trains[0].stops),
  },
];

/** Fixture transport. This module never calls fetch or a real service. */
export async function disFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const path = new URL(url, location.origin).pathname;
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  let response: unknown;
  if (path === '/api/dis/lines') {
    if (body) {
      if (init.method === 'DELETE') lines = lines.filter((line) => line.id !== body.id);
      else {
        const line = railwayLineSchema.parse(body);
        lines = [...lines.filter((item) => item.id !== line.id), line];
      }
    }
    response = { lines: structuredClone(lines) };
  } else if (path === '/api/dis/timetables' || path === '/api/dis/timetables/check') {
    if (init.method === 'DELETE') {
      const old = trains.find((train) => train.$id === body.id);
      if (!old) throw new Error('Vlak neexistuje.');
      if (body.expectedUpdatedAt !== old.$updatedAt)
        throw new Error('Vlak medzitým zmenil iný používateľ.');
      const timetable: Timetable = {
        ...old,
        $updatedAt: new Date().toISOString(),
        planning: { ...(old.planning || newPlanning()), daily: true, status: 'retired' },
      };
      trains = trains.map((train) => (train.$id === body.id ? timetable : train));
      response = { timetable, report: { conflicts: [], warnings: [] } };
    } else if (body) {
      const train = normalizeTimetable(body.timetable);
      const report = checkTimetableConflicts(
        train,
        trains.filter(
          (item) => item.$id !== body.id && (!item.planning || item.planning.status === 'active'),
        ),
      );
      if (path.endsWith('/check')) response = { report };
      else {
        const old = trains.find((item) => item.$id === body.id);
        if (old && body.expectedUpdatedAt !== old.$updatedAt)
          throw new Error('Vlak medzitým zmenil iný používateľ.');
        if (!old && trains.some((item) => item.trainNumber === train.trainNumber))
          throw new Error('Vlak s týmto číslom už existuje.');
        const saved = {
          ...train,
          $id: old?.$id || crypto.randomUUID(),
          $updatedAt: new Date().toISOString(),
        };
        trains = [...trains.filter((item) => item.$id !== saved.$id), saved];
        response = { timetable: saved, report };
      }
    } else response = { timetables: structuredClone(trains) };
  } else throw new Error('This isolated preview does not support this operation.');
  return response as T;
}
