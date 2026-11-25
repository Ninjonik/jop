import { z } from 'zod';
import { parseCompactClock } from './clock';
import { calendarsOverlap, planningSchema } from './gvd-planning';
import { trainCategorySchema } from './train-categories';

export const clockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::30)?$/, 'Čas musí mať formát HH:mm alebo HH:mm:30.');
export const stopSchema = z.object({
  station: z.string().trim().min(1).max(128),
  arrival: clockSchema,
  departure: clockSchema,
  track: z.string().trim().max(16).default(''),
  notes: z.string().trim().max(500).optional(),
  dwell: z.number().optional(),
  kilometer: z.number().min(0).max(100000).optional(),
  speedLimit: z.number().int().min(1).max(300).optional(),
  kind: z.enum(['stop', 'pass', 'operational']).optional(),
  lockArrival: z.boolean().optional(),
  lockDeparture: z.boolean().optional(),
});
/** Endpoint events are implicit; persisted stops still contain both clocks. */
export function completeEndpointTimes(stops: z.infer<typeof stopSchema>[]) {
  return stops.map((stop, index) => {
    const arrival =
      typeof stop.arrival === 'string' ? parseCompactClock(stop.arrival) : stop.arrival;
    const departure =
      typeof stop.departure === 'string' ? parseCompactClock(stop.departure) : stop.departure;
    return {
      ...stop,
      arrival: index === 0 && !arrival ? departure : arrival,
      departure: index === stops.length - 1 && !departure ? arrival : departure,
    };
  });
}
export const timetableSchema = z.object({
  trainNumber: z.string().trim().min(1).max(32),
  trainType: trainCategorySchema,
  maxSpeed: z.number().int().min(1).max(300),
  trainLength: z.number().int().min(1).max(1000),
  stops: z.preprocess(
    (value) =>
      Array.isArray(value) && value.every((stop) => stop && typeof stop === 'object')
        ? completeEndpointTimes(value as z.infer<typeof stopSchema>[])
        : value,
    z.array(stopSchema).min(2).max(100),
  ),
  nextTrainId: z.string().max(36).optional(),
  notes: z.string().trim().max(1000).optional(),
  planning: planningSchema.optional(),
});
export type TimetableInput = z.infer<typeof timetableSchema>;
export type Timetable = TimetableInput & { $id: string; $updatedAt?: string; sessionId?: string };
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
export const clockMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 +
  Number(time.slice(3, 5)) +
  (time.length === 8 && time.endsWith(':30') ? 0.5 : 0);
export const formatDwell = (minutes: number) =>
  `${Math.floor(minutes)}${minutes % 1 >= 0.5 ? '⁵' : ''}`;
export function alignClockMinute(time: string, reference: number) {
  const minute = clockMinutes(time);
  return minute + Math.round((reference - minute) / 1440) * 1440;
}

export function formatMinute(minute: number) {
  const time = (((Math.round(minute * 2) / 2) % 1440) + 1440) % 1440;
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}${time % 1 ? ':30' : ''}`;
}

// Stops are ordered. A decreasing clock is the next day, never a reordering of stops.
export function unfoldStops(stops: TimetableInput['stops']): TimedStop[] {
  let previous = -1;
  let day = 0;
  return completeEndpointTimes(stops).map((stop) => {
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
    stops: stops.map((stop, index) => ({
      ...parsed.stops[index],
      station: stop.station,
      arrival: stop.arrival,
      departure: stop.departure,
      track: stop.track,
      dwell: stop.dwell,
      ...(stop.kilometer !== undefined ? { kilometer: stop.kilometer } : {}),
      ...(stop.speedLimit !== undefined ? { speedLimit: stop.speedLimit } : {}),
      ...(stop.notes !== undefined ? { notes: stop.notes } : {}),
    })),
  };
}

export function timetableWindowsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  a?: TimetableInput['planning'],
  b?: TimetableInput['planning'],
) {
  // Daily schedules also interact with yesterday's / tomorrow's service across midnight.
  return [-1440, 0, 1440].some(
    (offset) =>
      aStart < Math.max(bEnd, bStart + 1) + offset &&
      bStart + offset < Math.max(aEnd, aStart + 1) &&
      calendarsOverlap(a, b, offset / 1440),
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
          !!stop.track &&
          !!peer.track &&
          stationKey(stop.track) === stationKey(peer.track) &&
          timetableWindowsOverlap(
            stop.arrivalMinute,
            stop.departureMinute,
            peer.arrivalMinute,
            peer.departureMinute,
            candidate.planning,
            other.planning,
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
          timetableWindowsOverlap(
            from.departureMinute,
            to.arrivalMinute,
            peerFrom.departureMinute,
            peerTo.arrivalMinute,
            candidate.planning,
            other.planning,
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

/** Move every stop by the same minute delta, preserving midnight rollover. */
export function shiftTimetable(timetable: TimetableInput, minutes: number): TimetableInput {
  return {
    ...timetable,
    stops: completeEndpointTimes(timetable.stops).map((stop) => ({
      ...stop,
      arrival: formatMinute(clockMinutes(stop.arrival) + minutes),
      departure: formatMinute(clockMinutes(stop.departure) + minutes),
    })),
  };
}

/** An origin has only departure, a terminus only arrival; pass points share a clock. */
export function changeStopTime(
  train: TimetableInput,
  index: number,
  field: 'arrival' | 'departure',
  time: string,
): TimetableInput {
  return {
    ...train,
    stops: train.stops.map((stop, i) =>
      i === index
        ? {
            ...stop,
            [field]: time,
            ...(index === 0 && field === 'departure' ? { arrival: time } : {}),
            ...(index === train.stops.length - 1 && field === 'arrival' ? { departure: time } : {}),
            ...(stop.kind === 'pass' ? { arrival: time, departure: time } : {}),
          }
        : stop,
    ),
  };
}
