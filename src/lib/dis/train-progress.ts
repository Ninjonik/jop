import type { EddEntry } from './edd';
import {
  alignClockMinute,
  formatMinute,
  stationKey,
  unfoldStops,
  type Timetable,
} from './timetable';

export type TrainStopProgress = {
  station: string;
  index: number;
  plannedArrival: number;
  plannedDeparture: number;
  arrival: number;
  departure: number;
  arrivalRecorded: boolean;
  departureRecorded: boolean;
  arrivalAcknowledged: boolean;
  departureAcknowledged: boolean;
  dwell: boolean;
  record?: EddEntry;
};
/** Forecasts never overwrite actuals. Early stopping trains wait until their planned departure. */
export function trainProgress(
  train: Timetable,
  records: EddEntry[],
  nowMinute?: number,
): TrainStopProgress[] {
  const trainRecords = records.filter(
    (r) =>
      r.trainNumber === train.trainNumber &&
      (!r.timetableId || r.timetableId === train.$id) &&
      r.status !== 'cancelled',
  );
  let delay = 0;
  let previousDeparture = -Infinity;
  return unfoldStops(train.stops).map((stop, index) => {
    const candidates = trainRecords.filter(
      (r) => stationKey(r.stationId) === stationKey(stop.station),
    );
    const record =
      candidates.find(
        (r) => r.schedArrival === stop.arrival && r.schedDeparture === stop.departure,
      ) || (candidates.length === 1 ? candidates[0] : undefined);
    const actualArrival = record?.actualArrival;
    const actualDeparture = record?.actualDeparture;
    let arrival = Math.max(stop.arrivalMinute + delay, previousDeparture);
    if (actualArrival) {
      arrival = alignClockMinute(actualArrival, stop.arrivalMinute);
      delay = arrival - stop.arrivalMinute;
    }
    let departure = Math.max(arrival, stop.departureMinute + delay);
    if (index === 0 || stop.kind !== 'pass') departure = Math.max(departure, stop.departureMinute);
    const dwell = !!record?.dwell && !actualDeparture;
    if (dwell && nowMinute !== undefined) {
      const now = nowMinute + Math.round((arrival - nowMinute) / 1440) * 1440;
      departure = Math.max(departure, now);
    }
    if (actualDeparture) departure = alignClockMinute(actualDeparture, stop.departureMinute);
    // Departure is authoritative for all later estimates, including recovery of early running.
    delay = departure - stop.departureMinute;
    previousDeparture = departure;
    return {
      station: stop.station,
      index,
      plannedArrival: stop.arrivalMinute,
      plannedDeparture: stop.departureMinute,
      arrival,
      departure,
      arrivalRecorded: !!actualArrival,
      departureRecorded: !!actualDeparture,
      arrivalAcknowledged: !!record?.lockedEvents?.arrival,
      departureAcknowledged: !!record?.lockedEvents?.departure,
      dwell,
      record,
    };
  });
}
export function lastReportedStop(progress: TrainStopProgress[]) {
  return [...progress].reverse().find((stop) => stop.arrivalRecorded || stop.departureRecorded);
}
export function forecastTimetable(
  train: Timetable,
  records: EddEntry[],
  nowMinute?: number,
): Timetable {
  const progress = trainProgress(train, records, nowMinute);
  return {
    ...train,
    stops: train.stops.map((stop, index) => ({
      ...stop,
      arrival: index === 0 ? stop.arrival : formatMinute(progress[index].arrival),
      departure:
        index === train.stops.length - 1 ? stop.departure : formatMinute(progress[index].departure),
    })),
  };
}
export function trainDelay(minute: number, planned: number) {
  return Math.round(minute - planned);
}
export function isFreightTrain(category: string) {
  return ['Nex', 'Rn', 'Zn', 'Pn', 'Vn', 'Mn', 'Pv', 'Vleč', 'P', 'Pos'].includes(category);
}

export type RecordedGraphPoint = { station: string; minute: number };
/** Only recorded events establish completed paths; the clock alone confirms nothing. */
export function recordedTrainSegments(
  train: Timetable,
  records: EddEntry[],
  nowMinute?: number,
): RecordedGraphPoint[][] {
  const progress = trainProgress(train, records, nowMinute);
  const segments: RecordedGraphPoint[][] = [];
  progress.forEach((stop, index) => {
    if (stop.arrivalRecorded && stop.departureRecorded)
      segments.push([
        { station: stop.station, minute: stop.arrival },
        { station: stop.station, minute: stop.departure },
      ]);
    else if (stop.arrivalRecorded && stop.dwell && nowMinute !== undefined) {
      const now = nowMinute + Math.round((stop.arrival - nowMinute) / 1440) * 1440;
      segments.push([
        { station: stop.station, minute: stop.arrival },
        { station: stop.station, minute: Math.max(stop.arrival, now) },
      ]);
    }
    const next = progress[index + 1];
    if (stop.departureRecorded && next?.arrivalRecorded)
      segments.push([
        { station: stop.station, minute: stop.departure },
        { station: next.station, minute: next.arrival },
      ]);
  });
  return segments;
}
