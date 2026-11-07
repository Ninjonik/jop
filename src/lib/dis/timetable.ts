import { z } from 'zod';
import { trainCategorySchema } from './train-categories';

export const clockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Čas musí mať formát HH:mm.');
export const stopSchema = z.object({
  station: z.string().trim().min(1).max(128),
  arrival: clockSchema,
  departure: clockSchema,
  track: z.string().trim().min(1).max(16),
  dwell: z.number().optional(),
});
export const timetableSchema = z.object({
  trainNumber: z.string().trim().min(1).max(32),
  trainType: trainCategorySchema,
  maxSpeed: z.number().int().min(1).max(300),
  trainLength: z.number().int().min(1).max(1000),
  stops: z.array(stopSchema).min(2).max(100),
});
export type TimetableInput = z.infer<typeof timetableSchema>;
export type Timetable = TimetableInput & { $id: string; $updatedAt?: string };
export type TimedStop = z.infer<typeof stopSchema> & {
  arrivalMinute: number;
  departureMinute: number;
};
export type Conflict = {
  kind: 'track' | 'section';
  trains: string[];
  location: string;
  message: string;
};
export type ConflictReport = { conflicts: Conflict[]; warnings: Conflict[] };

export const stationKey = (station: string) =>
  station.trim().normalize('NFC').toLocaleLowerCase('sk');
export const clockMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function alignClockMinute(time: string, reference: number) {
  const minute = clockMinutes(time);
  return minute + Math.round((reference - minute) / 1440) * 1440;
}

export function formatMinute(minute: number) {
  const time = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
}

// Stops are ordered. A decreasing clock is the next day, never a reordering of stops.
export function unfoldStops(stops: TimetableInput['stops']): TimedStop[] {
  let previous = -1;
  let day = 0;
  return stops.map((stop) => {
    let arrival = clockMinutes(stop.arrival) + day;
    if (arrival < previous) {
      day += 1440;
      arrival += 1440;
    }
    let departure = clockMinutes(stop.departure) + day;
    if (departure < arrival) {
      day += 1440;
      departure += 1440;
    }
    previous = departure;
    return {
      ...stop,
      dwell: departure - arrival,
      arrivalMinute: arrival,
      departureMinute: departure,
    };
  });
}

export function normalizeTimetable(input: unknown): TimetableInput {
  const parsed = timetableSchema.parse(input);
  const stops = unfoldStops(parsed.stops);
  if (stops.at(-1)!.departureMinute - stops[0].arrivalMinute >= 1440) {
    throw new Error(
      'Grafikon musí trvať menej než 24 hodín. Skontrolujte poradie a časy zastavení.',
    );
  }
  return {
    ...parsed,
    stops: stops.map((stop) => ({
      station: stop.station,
      arrival: stop.arrival,
      departure: stop.departure,
      track: stop.track,
      dwell: stop.dwell,
    })),
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  // Daily schedules also interact with yesterday's / tomorrow's service across midnight.
  return [-1440, 0, 1440].some(
    (offset) =>
      aStart < Math.max(bEnd, bStart + 1) + offset && bStart + offset < Math.max(aEnd, aStart + 1),
  );
}

export function checkTimetableConflicts(
  candidate: TimetableInput,
  others: TimetableInput[],
): ConflictReport {
  const result: ConflictReport = { conflicts: [], warnings: [] };
  const stops = unfoldStops(candidate.stops);
  for (const other of others) {
    const otherStops = unfoldStops(other.stops);
    for (const stop of stops)
      for (const peer of otherStops) {
        if (
          stationKey(stop.station) === stationKey(peer.station) &&
          stationKey(stop.track) === stationKey(peer.track) &&
          overlaps(
            stop.arrivalMinute,
            stop.departureMinute,
            peer.arrivalMinute,
            peer.departureMinute,
          )
        ) {
          result.conflicts.push({
            kind: 'track',
            trains: [candidate.trainNumber, other.trainNumber],
            location: stop.station,
            message: `${candidate.trainNumber} a ${other.trainNumber}: súbežné obsadenie koľaje ${stop.track} v stanici ${stop.station} (${stop.arrival}–${stop.departure} / ${peer.arrival}–${peer.departure}).`,
          });
        }
      }
    for (let index = 1; index < stops.length; index++)
      for (let peerIndex = 1; peerIndex < otherStops.length; peerIndex++) {
        const from = stops[index - 1],
          to = stops[index],
          peerFrom = otherStops[peerIndex - 1],
          peerTo = otherStops[peerIndex];
        const sameSection =
          [stationKey(from.station), stationKey(to.station)].sort().join('\0') ===
          [stationKey(peerFrom.station), stationKey(peerTo.station)].sort().join('\0');
        if (
          sameSection &&
          overlaps(
            from.departureMinute,
            to.arrivalMinute,
            peerFrom.departureMinute,
            peerTo.arrivalMinute,
          )
        ) {
          result.warnings.push({
            kind: 'section',
            trains: [candidate.trainNumber, other.trainNumber],
            location: `${from.station} – ${to.station}`,
            message: `${candidate.trainNumber} a ${other.trainNumber}: súbežné jazdy v úseku ${from.station} – ${to.station}. Overte traťovú koľaj a medzidobie.`,
          });
        }
      }
  }
  return result;
}
