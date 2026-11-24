import type { RailwayLine } from './lines';
import {
  clockMinutes,
  formatMinute,
  normalizeTimetable,
  shiftTimetable,
  unfoldStops,
  type TimetableInput,
} from './timetable';

export function lineStationPositions(line?: RailwayLine): Record<string, number> | undefined {
  if (!line || line.stations.length < 2) return;
  const positions: Record<string, number> = { [line.stations[0]]: 0 };
  let distance = 0;
  for (let i = 1; i < line.stations.length; i++) {
    const section = line.sections?.find(
      (s) => s.from === line.stations[i - 1] && s.to === line.stations[i],
    );
    if (!section) return;
    distance += section.segments.reduce((n, s) => n + s.lengthM, 0);
    positions[line.stations[i]] = distance;
  }
  return positions;
}

export function duplicateWorking(
  train: TimetableInput,
  number: string,
  delta: number,
  reverse = false,
): TimetableInput {
  const shifted = shiftTimetable(train, delta);
  const timed = unfoldStops(train.stops);
  let minute = clockMinutes(shifted.stops[0].departure);
  const reversed = [...train.stops].reverse().map((stop, i) => {
    if (i)
      minute += timed[timed.length - i].arrivalMinute - timed[timed.length - i - 1].departureMinute;
    const arrival = minute;
    if (i > 0 && i < timed.length - 1) {
      const original = timed[timed.length - i - 1];
      minute += original.departureMinute - original.arrivalMinute;
    }
    return {
      ...stop,
      arrival: formatMinute(arrival),
      departure: formatMinute(minute),
      track: '',
      lockArrival: false,
      lockDeparture: false,
      speedLimit: undefined,
      kind: i === 0 || i === timed.length - 1 ? ('stop' as const) : stop.kind,
    };
  });
  return {
    ...shifted,
    trainNumber: number,
    nextTrainId: undefined,
    planning: shifted.planning
      ? { ...shifted.planning, calculationFingerprint: undefined }
      : undefined,
    stops: reverse ? reversed : shifted.stops,
  };
}
export function exportGvd(trains: TimetableInput[]): string {
  return JSON.stringify({ format: 'dis-gvd', version: 1, trains }, null, 2);
}
export function importGvd(text: string): TimetableInput[] {
  if (text.length > 5_000_000) throw new Error('Import prekračuje 5 MB.');
  const value = JSON.parse(text);
  if (
    !value ||
    value.format !== 'dis-gvd' ||
    value.version !== 1 ||
    !Array.isArray(value.trains) ||
    value.trains.length > 500
  )
    throw new Error('Neplatný formát GVD.');
  return value.trains.map(normalizeTimetable);
}
export function csvTimetable(train: TimetableInput, names: Map<string, string>): string {
  const quote = (s: unknown) => `"${String(s ?? '').replaceAll('"', '""')}"`;
  // Prefix formula characters to keep spreadsheet imports from executing cells.
  const safe = (s: unknown) =>
    typeof s === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(s) ? `'${s}` : s;
  const rows = [
    ['Vlak', 'Dopravňa', 'Príchod', 'Odchod', 'Koľaj', 'Poznámka'],
    ...train.stops.map((s) => [
      train.trainNumber,
      names.get(s.station) || s.station,
      s.arrival,
      s.departure,
      s.track,
      s.notes || '',
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map((s) => quote(safe(s))).join(';')).join('\r\n');
}
export function downloadGvd(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
