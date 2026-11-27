import { getStationDisplayName } from '../station/display-name';
import type { EddEntry } from './edd';
import { networkPath, pointKind, type RailwayNetwork } from './railway-network';
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
    (r) => r.trainNumber === train.trainNumber && (!r.timetableId || r.timetableId === train.$id),
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
    if (index === 0 && actualDeparture)
      arrival = alignClockMinute(actualDeparture, stop.departureMinute);
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
    // Endpoint clocks are normalized for storage, but are not two separate events.
    if (index === train.stops.length - 1) departure = arrival;
    if (index === 0)
      arrival = record?.dwellStartedTime
        ? Math.min(departure, alignClockMinute(record.dwellStartedTime, stop.departureMinute))
        : record?.dwell
          ? Math.min(departure, stop.departureMinute)
          : departure;
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
      arrival: formatMinute(progress[index].arrival),
      departure: formatMinute(progress[index].departure),
    })),
  };
}
export function trainDelay(minute: number, planned: number) {
  return Math.round(minute - planned);
}
export function isFreightTrain(category: string) {
  return ['Nex', 'Rn', 'Zn', 'Pn', 'Vn', 'Mn', 'Pv', 'Vleč', 'P', 'Pos'].includes(category);
}

export type RecordedGraphPoint = {
  station: string;
  minute: number;
  toward?: string;
  fraction?: number;
};
/** Reports establish completed legs between controlled points. Minor halts require no report. */
export function recordedTrainSegments(
  train: Timetable,
  records: EddEntry[],
  nowMinute?: number,
): RecordedGraphPoint[][] {
  const progress = trainProgress(train, records, nowMinute);
  const segments: RecordedGraphPoint[][] = [];
  const cancellation = trainCancellation(train, records);
  const cutoff = cancellation
    ? progress.findIndex(
        (stop) => stationKey(stop.station) === stationKey(cancellation.fromStation),
      )
    : -1;
  progress.forEach((stop, index) => {
    if (
      stop.departureRecorded &&
      (stop.arrivalRecorded || (index === 0 && !!stop.record?.dwellStartedTime))
    )
      segments.push([
        { station: stop.station, minute: stop.arrival },
        { station: stop.station, minute: stop.departure },
      ]);
    else if (stop.dwell && (stop.arrivalRecorded || index === 0) && nowMinute !== undefined) {
      const now = nowMinute + Math.round((stop.arrival - nowMinute) / 1440) * 1440;
      segments.push([
        { station: stop.station, minute: stop.arrival },
        { station: stop.station, minute: Math.max(stop.arrival, now) },
      ]);
    }
    if (!stop.departureRecorded || (cutoff >= 0 && index >= cutoff)) return;
    // EDD entries identify dispatchable points even when no event has been recorded there yet.
    let nextIndex = progress.findIndex(
      (item, i) =>
        i > index &&
        (!!item.record ||
          i === progress.length - 1 ||
          ['Stanica', 'Odbočka', 'Výhybňa'].includes(
            pointKind(getStationDisplayName(item.station)),
          )),
    );
    if (cutoff > index && nextIndex > cutoff) nextIndex = cutoff;
    if (nextIndex < 0) return;
    const path: RecordedGraphPoint[] = [
      { station: stop.station, minute: stop.departure },
      ...progress
        .slice(index + 1, nextIndex + 1)
        .flatMap((item) => [
          { station: item.station, minute: item.arrival },
          ...(item.index < nextIndex ? [{ station: item.station, minute: item.departure }] : []),
        ]),
    ];
    if (progress[nextIndex].arrivalRecorded) {
      segments.push(path);
      return;
    }
    // A departure confirms only the first half of the controlled section. Advancing
    // the clock must never substitute for the next dispatcher's arrival report.
    const middle = (index + nextIndex) / 2;
    const beforeMiddle = Math.floor(middle);
    const completed: RecordedGraphPoint[] = [{ station: stop.station, minute: stop.departure }];
    for (let i = index + 1; i <= beforeMiddle; i++) {
      completed.push({ station: progress[i].station, minute: progress[i].arrival });
      if (i < middle)
        completed.push({ station: progress[i].station, minute: progress[i].departure });
    }
    if (middle > beforeMiddle) {
      const from = progress[beforeMiddle],
        to = progress[beforeMiddle + 1];
      completed.push({
        station: from.station,
        toward: to.station,
        minute: (from.departure + to.arrival) / 2,
        fraction: 0.5,
      });
    }
    if (completed.length > 1) segments.push(completed);
  });
  return segments;
}

/** Keep service-day coordinates numerical: an early event is not a midnight rollover. */
export function graphTrainStops(train: Timetable, records: EddEntry[], nowMinute?: number) {
  const progress = trainProgress(train, records, nowMinute);
  return unfoldStops(train.stops).map((stop, index) => ({
    ...stop,
    arrival: formatMinute(progress[index].arrival),
    departure: formatMinute(progress[index].departure),
    arrivalMinute: progress[index].arrival,
    departureMinute: progress[index].departure,
  }));
}

export function trainCancellation(train: Timetable, records: EddEntry[]) {
  const matches = records.filter(
    (record) =>
      record.trainNumber === train.trainNumber &&
      (!record.timetableId || record.timetableId === train.$id),
  );
  return (
    matches.find((record) => record.cancellation)?.cancellation ||
    matches
      .filter((record) => record.status === 'cancelled')
      .map((record) => ({ fromStation: record.stationId, reason: record.notes || '' }))[0]
  );
}

/** Insert topology-only points without inventing arrival/departure times. */
export function trainOverviewPoints(train: Timetable, network?: RailwayNetwork) {
  const points: { station: string; index?: number }[] = [];
  train.stops.forEach((stop, index) => {
    if (network && index > 0) {
      const path = networkPath(network, train.stops[index - 1].station, stop.station);
      points.push(...path.slice(1, -1).map((station) => ({ station })));
    }
    points.push({ station: stop.station, index });
  });
  return points;
}
