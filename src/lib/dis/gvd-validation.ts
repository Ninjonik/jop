import { calculateRunningTimes, calculationFingerprint } from './gvd-running-times';
import type { RailwayLine } from './lines';
import {
  checkTimetableConflicts,
  timetableWindowsOverlap,
  unfoldStops,
  type ConflictReport,
  type Timetable,
  type TimetableInput,
} from './timetable';

/** Authoring checks supplement, never operate, the interlocking. Unknown
 * infrastructure remains a warning rather than an invented capacity rule. */
export function validateGvdPlan(
  train: TimetableInput,
  others: Timetable[],
  lines: RailwayLine[],
): ConflictReport {
  const report = checkTimetableConflicts(train, others);
  const line = train.planning?.lineId
    ? lines.find((l) => l.id === train.planning?.lineId)
    : lines[0];
  const sections = line?.sections || [];
  const stops = unfoldStops(train.stops);
  // Cache each train once: validation is also run for large import batches.
  const peerStops = new Map(others.map((t) => [t.$id, unfoldStops(t.stops)]));
  const add = (severity: 'conflicts' | 'warnings', location: string, message: string, peer = '') =>
    report[severity].push({
      kind: 'section',
      trains: [train.trainNumber, ...(peer ? [peer] : [])],
      location,
      message,
    });
  if (!train.planning || train.planning.daily || train.planning.status === 'retired') return report;
  for (const stop of stops) {
    if (stop.kind === 'pass' && stop.departureMinute !== stop.arrivalMinute)
      add('conflicts', stop.station, `${stop.station}: prejazd nesmie obsahovať pobyt.`);
    const track = line?.stationTracks?.find(
      (t) => t.station === stop.station && t.track === stop.track,
    );
    if (track && train.trainLength > track.lengthM)
      add(
        'conflicts',
        stop.station,
        `${stop.station}: vlak (${train.trainLength} m) presahuje použiteľnú dĺžku koľaje ${stop.track} (${track.lengthM} m).`,
      );
    if (stop.track && !track)
      add(
        'warnings',
        stop.station,
        `${stop.station}: použiteľná dĺžka a uvoľnenie koľaje ${stop.track} nie sú zadané.`,
      );
  }
  if (train.planning.stock && train.planning.mode !== 'manual') {
    try {
      const result = calculateRunningTimes(train, sections);
      for (const [i, leg] of result.legs.entries()) {
        const available = (stops[i + 1].arrivalMinute - stops[i].departureMinute) * 60;
        if (available + 1 < leg.technicalSeconds)
          add(
            train.planning.mode === 'calibrated' ? 'conflicts' : 'warnings',
            `${leg.from} – ${leg.to}`,
            `${leg.from} – ${leg.to}: zadaných ${available} s, vypočítané minimum ${Math.ceil(leg.technicalSeconds)} s (${result.quality}).`,
          );
      }
      if (
        train.planning.calculationFingerprint &&
        train.planning.calculationFingerprint !== calculationFingerprint(train, sections)
      )
        add(
          'warnings',
          train.trainNumber,
          'Technické podklady sa zmenili. Prepočítajte jazdné časy.',
        );
    } catch (error) {
      add(
        'warnings',
        train.trainNumber,
        error instanceof Error ? error.message : 'Výpočet nie je dostupný.',
      );
    }
  }
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1],
      to = stops[i];
    const section = sections.find((s) => s.from === from.station && s.to === to.station);
    if (!section) {
      add(
        'warnings',
        `${from.station} – ${to.station}`,
        'Chýba smerový profil; nemožno overiť kapacitu ani jazdný čas.',
      );
      continue;
    }
    if (!section.headwaySeconds)
      add('warnings', `${from.station} – ${to.station}`, 'Plánovacie medzidobie nie je zadané.');
    const stock = train.planning.stock;
    if (stock?.brakedWeightT && stock.axles && stock.brakeMode) {
      const rules = section.brakeRequirements
        ?.filter(
          (r) =>
            r.mode === stock.brakeMode &&
            r.maxAxles >= stock.axles! &&
            r.maxSpeedKmh >= train.maxSpeed,
        )
        .sort((a, b) => a.maxAxles - b.maxAxles || a.maxSpeedKmh - b.maxSpeedKmh);
      const rule = rules?.[0];
      if (rule && section.source.trim()) {
        const actual = (stock.brakedWeightT / (stock.locomotiveMassT + stock.hauledMassT)) * 100;
        if (actual < rule.requiredPercent)
          add(
            'conflicts',
            `${from.station} – ${to.station}`,
            `Nedostatok brzdiacich percent: ${actual.toFixed(1)} %, požadované ${rule.requiredPercent} %.`,
          );
      } else
        add(
          'warnings',
          `${from.station} – ${to.station}`,
          'Chýba zdrojovaná tabuľka potrebných brzdiacich percent pre režim, nápravy a rýchlosť.',
        );
    }
    for (const other of others) {
      if (other.planning?.status === 'retired') continue;
      const peers = peerStops.get(other.$id)!;
      for (let j = 1; j < peers.length; j++) {
        const a = peers[j - 1],
          b = peers[j];
        const opposite = a.station === to.station && b.station === from.station;
        const same = a.station === from.station && b.station === to.station;
        if (!opposite && !same) continue;
        const overlap = timetableWindowsOverlap(
          from.departureMinute,
          to.arrivalMinute + section.headwaySeconds / 60,
          a.departureMinute,
          b.arrivalMinute + section.headwaySeconds / 60,
          train.planning,
          other.planning,
        );
        if (opposite && section.tracks === 1 && overlap)
          add(
            'conflicts',
            `${from.station} – ${to.station}`,
            `${train.trainNumber} / ${other.trainNumber}: protismerné jazdy v jednokoľajnom úseku.`,
            other.trainNumber,
          );
        if (same && overlap && !section.blocks?.length)
          add(
            'warnings',
            `${from.station} – ${to.station}`,
            `${train.trainNumber} / ${other.trainNumber}: súčasné obsadenie úseku; overte oddiely a dobehnutie vlaku.`,
            other.trainNumber,
          );
        if (same && overlap && section.blocks?.length) {
          // Use the timetable's actual scheduled duration. A linear position
          // estimate is intentionally only a warning, never a safety verdict.
          const length = section.segments.reduce((n, p) => n + p.lengthM, 0);
          for (const block of section.blocks) {
            const start =
              from.departureMinute +
              ((to.arrivalMinute - from.departureMinute) * block.startM) / length;
            const end =
              from.departureMinute +
              (to.arrivalMinute - from.departureMinute) *
                Math.min(1, (block.endM + train.trainLength) / length) +
              block.clearanceSeconds / 60;
            const peerStart =
              a.departureMinute + ((b.arrivalMinute - a.departureMinute) * block.startM) / length;
            const peerEnd =
              a.departureMinute +
              (b.arrivalMinute - a.departureMinute) *
                Math.min(1, (block.endM + other.trainLength) / length) +
              block.clearanceSeconds / 60;
            if (
              timetableWindowsOverlap(
                start,
                end,
                peerStart,
                peerEnd,
                train.planning,
                other.planning,
              )
            )
              add(
                'warnings',
                `${from.station} – ${to.station} / ${block.id}`,
                `${train.trainNumber} / ${other.trainNumber}: možné spoločné obsadenie oddielu ${block.id} (odhad podľa časov; overte návestné a uvoľňovacie doby).`,
                other.trainNumber,
              );
          }
        }
        if (
          same &&
          section.headwaySeconds &&
          timetableWindowsOverlap(
            from.departureMinute,
            from.departureMinute + section.headwaySeconds / 60,
            a.departureMinute,
            a.departureMinute + section.headwaySeconds / 60,
            train.planning,
            other.planning,
          )
        )
          add(
            'conflicts',
            `${from.station} – ${to.station}`,
            `${train.trainNumber} / ${other.trainNumber}: nedodržané plánovacie medzidobie.`,
            other.trainNumber,
          );
      }
    }
  }
  for (const other of others) {
    if (other.planning?.status === 'retired') continue;
    const peers = peerStops.get(other.$id)!;
    for (const stop of stops) {
      const track = line?.stationTracks?.find(
        (t) => t.station === stop.station && t.track === stop.track,
      );
      if (!track?.clearanceSeconds) continue;
      for (const peer of peers.filter(
        (p) => p.station === stop.station && p.track === stop.track,
      )) {
        if (
          timetableWindowsOverlap(
            stop.arrivalMinute,
            stop.departureMinute + track.clearanceSeconds / 60,
            peer.arrivalMinute,
            peer.departureMinute + track.clearanceSeconds / 60,
            train.planning,
            other.planning,
          )
        )
          add(
            'conflicts',
            stop.station,
            `${train.trainNumber} / ${other.trainNumber}: interval uvoľnenia koľaje ${stop.track}.`,
            other.trainNumber,
          );
      }
    }
  }
  const next = others.find((t) => t.$id === train.nextTrainId);
  if (next) {
    if (stops.at(-1)!.station !== next.stops[0].station)
      add('conflicts', train.trainNumber, 'Nadväzujúci výkon začína v inej dopravni.');
    let departure = unfoldStops(next.stops)[0].departureMinute;
    const arrival = stops.at(-1)!.arrivalMinute;
    while (departure < arrival) departure += 1440;
    if (departure - arrival < train.planning.turnaroundMinutes)
      add('conflicts', train.trainNumber, 'Nedostatočný čas na obrat pred nadväzujúcim výkonom.');
    if (next.planning?.status === 'retired')
      add('warnings', train.trainNumber, 'Nadväzujúci vlak je vyradený.');
  }
  // Several traversals can report the same station clearance; show it once.
  for (const key of ['conflicts', 'warnings'] as const)
    report[key] = report[key].filter(
      (issue, i, list) =>
        list.findIndex((p) => p.location === issue.location && p.message === issue.message) === i,
    );
  return report;
}
