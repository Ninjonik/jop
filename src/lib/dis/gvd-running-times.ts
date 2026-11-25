import type { PlanningSection, StockProfile } from './gvd-planning';
import { clockMinutes, formatMinute, unfoldStops, type TimetableInput } from './timetable';

export type RunningTimeResult = {
  fingerprint: string;
  quality: 'estimated' | 'calibrated';
  legs: {
    from: string;
    to: string;
    technicalSeconds: number;
    allowanceSeconds: number;
    plannedSeconds: number;
    peakSpeedKmh: number;
  }[];
  samples: { distanceM: number; speedKmh: number }[];
};
type Cell = { length: number; speed: number; gradient: number; leg: number; stop: boolean };
function effort(profile: StockProfile, speed: number): number {
  let force = profile.maxEffortKN * 1000;
  const curve = profile.effortCurve;
  if (curve.length) {
    const upper = curve.findIndex((p) => p.speedKmh >= speed * 3.6);
    if (upper === 0) force = curve[0].effortKN * 1000;
    else if (upper < 0) force = curve.at(-1)!.effortKN * 1000;
    else {
      const a = curve[upper - 1],
        b = curve[upper];
      force =
        (a.effortKN +
          ((b.effortKN - a.effortKN) * (speed * 3.6 - a.speedKmh)) / (b.speedKmh - a.speedKmh)) *
        1000;
    }
  }
  return Math.min(
    force,
    (profile.powerKW * 1000) / Math.max(speed, 0.1),
    profile.adhesion * profile.locomotiveMassT * 1000 * 9.80665,
  );
}
export function calculationFingerprint(train: TimetableInput, sections: PlanningSection[]): string {
  const text = JSON.stringify([
    train.maxSpeed,
    train.trainLength,
    train.stops.map((s) => [s.station, s.kind, s.speedLimit]),
    train.planning?.stock,
    train.planning?.allowancePercent,
    train.planning?.allowanceSeconds,
    sections,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `gvd1-${(hash >>> 0).toString(16)}`;
}
/** Spatial integration in SI units. Brake delay is conservatively represented
 * as coasting for the full build-up interval before full service deceleration.
 * Brake weight is deliberately not interpreted as a force. */
export function calculateRunningTimes(
  train: TimetableInput,
  sections: PlanningSection[],
): RunningTimeResult {
  const p = train.planning?.stock;
  if (!p) throw new Error('Vyberte profil súpravy.');
  if (train.planning?.mode === 'calibrated' && (p.quality !== 'calibrated' || !p.source.trim()))
    throw new Error('Chýba overený profil súpravy.');
  const cells: Cell[] = [];
  for (let leg = 0; leg < train.stops.length - 1; leg++) {
    const from = train.stops[leg].station,
      to = train.stops[leg + 1].station;
    const section = sections.find((s) => s.from === from && s.to === to);
    if (!section) throw new Error(`Chýba smerový profil úseku ${from} – ${to}.`);
    if (train.planning?.mode === 'calibrated' && !section.source.trim())
      throw new Error(`Chýba zdroj úseku ${from} – ${to}.`);
    for (const segment of section.segments) {
      const count = Math.ceil(segment.lengthM / 20);
      if (cells.length + count > 20000)
        throw new Error('Trasa prekračuje rozsah výpočtu (400 km pri základnom kroku).');
      for (let i = 0; i < count; i++)
        cells.push({
          length: segment.lengthM / count,
          speed:
            Math.min(
              segment.speedKmh,
              train.maxSpeed,
              p.maxSpeedKmh,
              train.stops[leg].speedLimit || Infinity,
            ) / 3.6,
          gradient: segment.gradientPermille / 1000,
          leg,
          stop: false,
        });
    }
    cells.at(-1)!.stop = leg === train.stops.length - 2 || train.stops[leg + 1].kind !== 'pass';
  }
  const positions = [0];
  for (const c of cells) positions.push(positions.at(-1)! + c.length);
  // Keep a preceding restriction until the rear of the train has cleared it.
  const limits = cells.map((c, i) => {
    let limit = c.speed;
    for (let j = i - 1; j >= 0 && positions[i] - positions[j + 1] < train.trainLength; j--)
      limit = Math.min(limit, cells[j].speed);
    return limit;
  });
  const braking = new Array<number>(cells.length + 1).fill(0);
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    const a = p.serviceBrakeMps2 + 9.80665 * c.gradient;
    if (a <= 0) throw new Error('Zvolená prevádzková brzda nestačí pre sklon trate.');
    const next = c.stop ? 0 : braking[i + 1];
    braking[i] = Math.min(limits[i], Math.sqrt(next * next + 2 * a * c.length));
  }
  const mass = (p.locomotiveMassT + p.hauledMassT) * 1000;
  let speed = 0,
    elapsedSinceStop = 0,
    distance = 0;
  const seconds = new Array<number>(train.stops.length - 1).fill(0);
  const peaks = [...seconds];
  const samples = [{ distanceM: 0, speedKmh: 0 }];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const resistance = p.resistanceA + p.resistanceB * speed + p.resistanceC * speed * speed;
    let ramp =
      p.tractionBuildUpSeconds === 0
        ? 1
        : Math.min(1, (elapsedSinceStop + 0.5) / p.tractionBuildUpSeconds);
    let launchDelay = 0;
    if (speed < 0.01 && p.tractionBuildUpSeconds > 0) {
      const full = effort(p, 0),
        load = resistance + mass * 9.80665 * c.gradient;
      if (full <= load) throw new Error('Súprava sa v danom sklone nedokáže rozbehnúť.');
      // At standstill wait for sufficient effort, then integrate the linear
      // traction ramp in time. A fixed spatial-step ramp otherwise makes
      // uphill starts fail and exaggerates the first 20 m running time.
      const tau = p.tractionBuildUpSeconds;
      launchDelay = Math.max(0, (tau * Math.max(0, load)) / full - elapsedSinceStop);
      const start = elapsedSinceStop + launchDelay;
      const a0 = (full * Math.min(1, start / tau) - load) / (mass * p.rotatingMassFactor);
      const jerk = full / (tau * mass * p.rotatingMassFactor);
      const remaining = Math.max(0, tau - start);
      const at = (time: number) => {
        const t = Math.min(time, remaining),
          coast = Math.max(0, time - remaining);
        const v = a0 * t + (jerk * t * t) / 2;
        return (
          (a0 * t * t) / 2 +
          (jerk * t * t * t) / 6 +
          v * coast +
          (((full - load) / (mass * p.rotatingMassFactor)) * coast * coast) / 2
        );
      };
      let low = 0,
        high = 1;
      while (at(high) < c.length && high < 86400) high *= 2;
      for (let n = 0; n < 40; n++) {
        const mid = (low + high) / 2;
        if (at(mid) < c.length) low = mid;
        else high = mid;
      }
      const time = high,
        t = Math.min(time, remaining);
      const exit =
        a0 * t +
        (jerk * t * t) / 2 +
        ((full - load) / (mass * p.rotatingMassFactor)) * Math.max(0, time - remaining);
      // Equivalent work over the cell; its time correction is applied below.
      ramp = (((exit * exit) / (2 * c.length)) * mass * p.rotatingMassFactor + load) / full;
      launchDelay += Math.max(0, time - (2 * c.length) / exit);
    }
    const acceleration =
      (effort(p, speed) * ramp - resistance - mass * 9.80665 * c.gradient) /
      (mass * p.rotatingMassFactor);
    if (speed < 0.01 && acceleration <= 0)
      throw new Error('Súprava sa v danom sklone nedokáže rozbehnúť.');
    let next = Math.sqrt(Math.max(0, speed * speed + 2 * acceleration * c.length));
    next = Math.min(next, limits[i], c.stop ? 0 : braking[i + 1]);
    if (!c.stop && p.brakeBuildUpSeconds > 0) {
      let low = 0,
        high = next;
      for (let k = 0; k < 16; k++) {
        const candidate = (low + high) / 2;
        const look = positions[i + 1] + candidate * p.brakeBuildUpSeconds;
        let ahead = i + 1;
        while (ahead < cells.length && positions[ahead + 1] < look && !cells[ahead - 1]?.stop)
          ahead++;
        const atStop = ahead >= cells.length || !!cells[ahead - 1]?.stop;
        const fraction = atStop
          ? 0
          : Math.max(0, Math.min(1, (look - positions[ahead]) / cells[ahead].length));
        const safe = atStop
          ? 0
          : Math.sqrt(
              Math.max(
                0,
                braking[ahead] ** 2 + (braking[ahead + 1] ** 2 - braking[ahead] ** 2) * fraction,
              ),
            );
        if (candidate <= safe) low = candidate;
        else high = candidate;
      }
      next = low;
    }
    // A cell bounded by two stops must still contain an acceleration/braking
    // triangle; subdivision prevents zero/zero endpoints hiding a short run.
    let dt: number;
    if (speed + next < 0.001) {
      const a = Math.max(0.001, acceleration),
        b = p.serviceBrakeMps2 + 9.80665 * c.gradient;
      const peak = Math.sqrt((2 * c.length) / (1 / a + 1 / b));
      dt = peak / a + peak / b;
      peaks[c.leg] = Math.max(peaks[c.leg], Math.min(peak, limits[i]) * 3.6);
    } else dt = (2 * c.length) / (speed + next);
    dt += launchDelay;
    seconds[c.leg] += dt;
    elapsedSinceStop += dt;
    distance += c.length;
    peaks[c.leg] = Math.max(peaks[c.leg], speed * 3.6, next * 3.6);
    if (i % Math.max(1, Math.ceil(cells.length / 2000)) === 0 || c.stop)
      samples.push({ distanceM: distance, speedKmh: next * 3.6 });
    speed = next;
    if (c.stop) elapsedSinceStop = 0;
  }
  return {
    fingerprint: calculationFingerprint(train, sections),
    quality: train.planning?.mode === 'calibrated' ? 'calibrated' : 'estimated',
    samples,
    legs: seconds.map((technicalSeconds, i) => {
      const allowanceSeconds =
        (technicalSeconds * (train.planning?.allowancePercent || 0)) / 100 +
        (train.planning?.allowanceSeconds || 0);
      return {
        from: train.stops[i].station,
        to: train.stops[i + 1].station,
        technicalSeconds,
        allowanceSeconds,
        plannedSeconds: technicalSeconds + allowanceSeconds,
        peakSpeedKmh: peaks[i],
      };
    }),
  };
}
export function applyRunningTimes(
  train: TimetableInput,
  result: RunningTimeResult,
): TimetableInput {
  if (
    result.legs.length !== train.stops.length - 1 ||
    result.legs.some(
      (leg, i) =>
        leg.from !== train.stops[i].station ||
        leg.to !== train.stops[i + 1].station ||
        !Number.isFinite(leg.plannedSeconds) ||
        leg.plannedSeconds <= 0,
    )
  )
    throw new Error('Výpočet nepatrí k tejto trase. Prepočítajte jazdné časy.');
  const original = unfoldStops(train.stops);
  let minute = original[0].departureMinute;
  const stops = train.stops.map((stop, i) => {
    if (i === 0) return { ...stop };
    const arrival = minute + Math.ceil(result.legs[i - 1].plannedSeconds / 60);
    if (stop.lockArrival && original[i].arrivalMinute < arrival)
      throw new Error(`Uzamknutý príchod: ${stop.station}.`);
    const actualArrival = stop.lockArrival ? original[i].arrivalMinute : arrival;
    const dwell =
      stop.kind === 'pass' ? 0 : original[i].departureMinute - original[i].arrivalMinute;
    const departure = actualArrival + dwell;
    if (stop.lockDeparture && original[i].departureMinute < departure)
      throw new Error(`Uzamknutý odchod: ${stop.station}.`);
    minute = stop.lockDeparture ? original[i].departureMinute : departure;
    return { ...stop, arrival: formatMinute(actualArrival), departure: formatMinute(minute) };
  });
  if (minute - original[0].arrivalMinute >= 1440)
    throw new Error('Vypočítaná jazda prekračuje jeden prevádzkový deň.');
  return {
    ...train,
    stops,
    planning: train.planning
      ? { ...train.planning, calculationFingerprint: result.fingerprint }
      : undefined,
  };
}
export { parseCompactClock } from './clock';
export function shiftFromStop(
  train: TimetableInput,
  index: number,
  minutes: number,
): TimetableInput {
  return {
    ...train,
    stops: train.stops.map((s, i) =>
      i < index
        ? s
        : {
            ...s,
            arrival: formatMinute(clockMinutes(s.arrival) + minutes),
            departure: formatMinute(clockMinutes(s.departure) + minutes),
          },
    ),
  };
}
