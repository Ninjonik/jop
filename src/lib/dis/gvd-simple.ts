import { newPlanning } from './gvd-planning';
import type { RailwayLine } from './lines';
import { clockMinutes, normalizeTimetable, shiftTimetable, type TimetableInput } from './timetable';

/** Keep legacy metadata readable while the game editor authors daily, manual services. */
export function dailyTimetable(train: TimetableInput): TimetableInput {
  return {
    ...train,
    stops: train.stops.map((stop) => ({
      ...stop,
      lockArrival: undefined,
      lockDeparture: undefined,
    })),
    planning: {
      ...(train.planning || newPlanning()),
      daily: true,
      mode: 'manual',
      calculationFingerprint: undefined,
    },
  };
}

export function applyMeasuredRoute(
  train: TimetableInput,
  line: RailwayLine,
  start: string,
): TimetableInput {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new Error('Čas musí mať formát HH:mm.');
  const stops = line.measuredStops;
  if (!stops) {
    // No invented travel times: an unmeasured route starts with editable equal clocks.
    return dailyTimetable({
      ...train,
      planning: { ...(train.planning || newPlanning()), lineId: line.id },
      stops: line.stations.map((station) => ({
        station,
        arrival: start,
        departure: start,
        track: '',
      })),
    });
  }
  const template = normalizeTimetable({
    ...train,
    trainNumber: train.trainNumber || 'template',
    stops,
  });
  const shifted = shiftTimetable(template, clockMinutes(start) - clockMinutes(stops[0].departure));
  return dailyTimetable({
    ...train,
    planning: { ...(train.planning || newPlanning()), lineId: line.id },
    stops: shifted.stops.map((stop) => ({
      ...stop,
      lockArrival: undefined,
      lockDeparture: undefined,
    })),
  });
}
