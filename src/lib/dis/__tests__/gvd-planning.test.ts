import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarsOverlap,
  estimated750,
  newPlanning,
  operatesOn,
  planningSchema,
  sectionSchema,
  type PlanningSection,
} from '../gvd-planning';
import {
  applyRunningTimes,
  calculateRunningTimes,
  calculationFingerprint,
  parseCompactClock,
} from '../gvd-running-times';
import { csvTimetable, duplicateWorking, exportGvd, importGvd } from '../gvd-tools';
import { validateGvdPlan } from '../gvd-validation';
import { checkTimetableConflicts, normalizeTimetable, type TimetableInput } from '../timetable';
const section = (lengthM = 2000, speedKmh = 80, gradientPermille = 0): PlanningSection => ({
  from: 'A',
  to: 'B',
  source: '',
  version: 1,
  tracks: 1,
  headwaySeconds: 60,
  segments: [{ lengthM, speedKmh, gradientPermille }],
});
const train = (): TimetableInput => ({
  trainNumber: '90001',
  trainType: 'Os',
  maxSpeed: 100,
  trainLength: 100,
  stops: [
    { station: 'A', arrival: '08:00', departure: '08:00', track: '1' },
    { station: 'B', arrival: '08:10', departure: '08:11', track: '1' },
  ],
  planning: { ...newPlanning(), mode: 'estimated', stock: { ...estimated750, effortCurve: [] } },
});

test('SI integration agrees with an analytic 1 m/s² acceleration/brake run', () => {
  const a = train();
  a.maxSpeed = 36;
  Object.assign(a.planning!.stock!, {
    locomotiveMassT: 100,
    hauledMassT: 0,
    powerKW: 50000,
    maxEffortKN: 100,
    adhesion: 0.5,
    rotatingMassFactor: 1,
    resistanceA: 0,
    resistanceB: 0,
    resistanceC: 0,
    tractionBuildUpSeconds: 0,
    brakeBuildUpSeconds: 0,
    serviceBrakeMps2: 1,
  });
  const result = calculateRunningTimes(a, [section(2000, 36)]);
  // 50 m accelerating + 1900 m at 10 m/s + 50 m braking = 210 s.
  assert.ok(Math.abs(result.legs[0].technicalSeconds - 210) < 3);
  const short = calculateRunningTimes(a, [section(5, 36)]);
  assert.ok(Math.abs(short.legs[0].technicalSeconds - 2 * Math.sqrt(5)) < 0.01);
  assert.ok(short.legs[0].peakSpeedKmh > 0);
});

test('traction can build before an uphill launch and insufficient effort still fails', () => {
  const a = train();
  a.planning!.stock!.tractionBuildUpSeconds = 30;
  assert.ok(calculateRunningTimes(a, [section(2000, 80, 8)]).legs[0].technicalSeconds > 0);
  a.planning!.stock!.maxEffortKN = 1;
  assert.throws(() => calculateRunningTimes(a, [section(2000, 80, 8)]), /rozbehnúť/);
});

test('directional blocks validate bounds, overlap and identity', () => {
  const s = section(2000);
  assert.equal(
    sectionSchema.safeParse({
      ...s,
      blocks: [{ id: '1', startM: 0, endM: 2100, clearanceSeconds: 0 }],
    }).success,
    false,
  );
  assert.equal(
    sectionSchema.safeParse({
      ...s,
      blocks: [
        { id: '1', startM: 0, endM: 1100, clearanceSeconds: 0 },
        { id: '2', startM: 1000, endM: 2000, clearanceSeconds: 0 },
      ],
    }).success,
    false,
  );
});

test('unavailable explicit line IDs never fall back to another line', () => {
  const a = train();
  a.planning!.lineId = '11111111-1111-4111-8111-111111111111';
  const report = validateGvdPlan(
    a,
    [],
    [
      {
        id: '22222222-2222-4222-8222-222222222222',
        placeId: '1',
        name: 'wrong',
        stations: ['A', 'B'],
        sections: [section()],
      },
    ],
  );
  assert.ok(report.warnings.some((w) => w.message.includes('Chýba smerový profil')));
});

test('normalization retains authoring fields but excludes derived absolute minutes', () => {
  const a = train();
  a.stops[0].lockArrival = true;
  a.stops[0].kind = 'operational';
  const parsed = normalizeTimetable(a);
  assert.equal(parsed.stops[0].lockArrival, true);
  assert.equal('arrivalMinute' in parsed.stops[0], false);
  assert.throws(() => importGvd('null'), /formát/);
});
test('running times include acceleration and service braking instead of distance / speed', () => {
  const result = calculateRunningTimes(train(), [section()]);
  assert.ok(result.legs[0].technicalSeconds > 2000 / (80 / 3.6));
  assert.ok(Number.isFinite(result.legs[0].technicalSeconds));
  assert.equal(result.samples[0].speedKmh, 0);
  assert.equal(result.samples.at(-1)!.speedKmh, 0);
  assert.ok(result.legs[0].peakSpeedKmh <= 80.001);
});
test('a short section never jumps to maximum speed', () => {
  const result = calculateRunningTimes(train(), [section(40)]);
  assert.ok(result.legs[0].peakSpeedKmh < 40);
  assert.ok(result.legs[0].technicalSeconds > 0);
});
test('more mass and uphill gradients increase running time', () => {
  const light = train(),
    heavy = train();
  heavy.planning!.stock!.hauledMassT = 500;
  const base = calculateRunningTimes(light, [section(4000)]).legs[0].technicalSeconds;
  assert.ok(calculateRunningTimes(heavy, [section(4000)]).legs[0].technicalSeconds > base);
  assert.ok(calculateRunningTimes(light, [section(4000, 80, 10)]).legs[0].technicalSeconds > base);
});
test('unknown direction and unsourced calibration are explicit errors', () => {
  assert.throws(() => calculateRunningTimes(train(), []), /Chýba/);
  const calibrated = train();
  calibrated.planning!.mode = 'calibrated';
  assert.throws(() => calculateRunningTimes(calibrated, [section()]), /overený/);
});
test('brake build-up starts braking earlier and changes running time', () => {
  const quick = train(),
    slow = train();
  quick.planning!.stock!.brakeBuildUpSeconds = 0;
  slow.planning!.stock!.brakeBuildUpSeconds = 8;
  const a = calculateRunningTimes(quick, [section(4000)]),
    b = calculateRunningTimes(slow, [section(4000)]);
  assert.ok(b.legs[0].technicalSeconds > a.legs[0].technicalSeconds);
});
test('a passing point preserves through movement and a stop loses it', () => {
  const a = train();
  a.stops.push({ ...a.stops[1], station: 'C', arrival: '08:20', departure: '08:20' });
  a.stops[1].kind = 'pass';
  a.stops[1].departure = a.stops[1].arrival;
  const sections = [section(), { ...section(), from: 'B', to: 'C' }];
  const passing = calculateRunningTimes(a, sections).legs.reduce(
    (n, l) => n + l.technicalSeconds,
    0,
  );
  a.stops[1].kind = 'stop';
  const stopping = calculateRunningTimes(a, sections).legs.reduce(
    (n, l) => n + l.technicalSeconds,
    0,
  );
  assert.ok(stopping > passing);
});
test('applying calculations preserves dwell and detects impossible locked times without mutation', () => {
  const a = train(),
    original = structuredClone(a);
  const result = calculateRunningTimes(a, [section()]);
  const applied = applyRunningTimes(a, result);
  assert.equal(
    applied.stops[1].departure.slice(-2),
    String(Number(applied.stops[1].arrival.slice(-2)) + 1).padStart(2, '0'),
  );
  assert.deepEqual(a, original);
  a.stops[1].arrival = '08:00';
  a.stops[1].departure = '08:00';
  a.stops[1].lockArrival = true;
  assert.throws(() => applyRunningTimes(a, result), /Uzamknutý/);
});
test('calculation fingerprints change with stock, length and infrastructure', () => {
  const a = train(),
    s = section();
  const first = calculationFingerprint(a, [s]);
  a.trainLength += 100;
  assert.notEqual(first, calculationFingerprint(a, [s]));
  a.trainLength -= 100;
  s.version++;
  assert.notEqual(first, calculationFingerprint(a, [s]));
});
test('operating calendars support weekdays, exclusions and inclusions', () => {
  const p = { ...newPlanning(), validFrom: '2005-01-01', validTo: '2005-12-01', weekdays: [1] };
  assert.equal(operatesOn(p, '2005-01-03'), true);
  assert.equal(operatesOn(p, '2005-01-04'), false);
  p.excludedDates = ['2005-01-03'];
  p.includedDates = ['2005-01-04'];
  assert.equal(operatesOn(p, '2005-01-03'), false);
  assert.equal(operatesOn(p, '2005-01-04'), true);
  assert.equal(planningSchema.safeParse({ ...p, validFrom: '2005-02-30' }).success, false);
});
test('opposite weekday calendars still conflict across midnight on the actual overlapping day', () => {
  const a = train(),
    b = train();
  a.planning!.weekdays = [1];
  b.planning!.weekdays = [2];
  a.stops = [
    { station: 'A', arrival: '23:50', departure: '23:55', track: '1' },
    { station: 'B', arrival: '00:10', departure: '00:20', track: '1' },
  ];
  b.stops = [
    { station: 'A', arrival: '00:00', departure: '00:02', track: '1' },
    { station: 'B', arrival: '00:15', departure: '00:25', track: '1' },
  ];
  assert.equal(calendarsOverlap(a.planning, b.planning), false);
  assert.ok(checkTimetableConflicts(a, [b]).conflicts.length > 0);
});
test('legacy schedules remain readable and planning metadata survives round trips', () => {
  const a = train();
  assert.deepEqual(importGvd(exportGvd([a]))[0], normalizeTimetable(a));
  delete a.planning;
  assert.equal(normalizeTimetable(a).planning, undefined);
  assert.throws(() => importGvd('{"version":99,"trains":[]}'));
});
test('duplicate and return workings clear identity links and unsafe track assumptions', () => {
  const a = train();
  a.nextTrainId = 'other';
  const b = duplicateWorking(a, '90002', 30, true);
  assert.equal(b.trainNumber, '90002');
  assert.equal(b.stops[0].station, 'B');
  assert.equal(b.stops[0].departure, '08:30');
  assert.equal(b.nextTrainId, undefined);
  assert.equal(b.stops[0].track, '');
  assert.equal(a.trainNumber, '90001');
});

test('return workings reverse leg durations and keep dwell at its station', () => {
  const a = train();
  a.stops[1] = { ...a.stops[1], arrival: '08:10', departure: '08:12' };
  a.stops.push({ station: 'C', arrival: '08:25', departure: '08:25', track: '2' });
  const b = duplicateWorking(a, '90002', 30, true);
  assert.equal(b.stops[1].station, 'B');
  assert.equal(b.stops[1].arrival, '08:43');
  assert.equal(b.stops[1].departure, '08:45');
  assert.equal(b.stops[2].arrival, '08:55');
});
test('compact clocks are normalized and CSV protects formula-shaped user text', () => {
  assert.equal(parseCompactClock('630'), '06:30');
  assert.equal(parseCompactClock('6.30'), '06:30');
  const a = train();
  a.stops[0].notes = '=SUM(1;2)';
  assert.ok(csvTimetable(a, new Map()).includes("'=SUM"));
});
test('capacity and platform checks depend on explicit infrastructure', () => {
  const a = train(),
    other = { ...train(), $id: 'other', trainNumber: '90002', stops: [...train().stops].reverse() };
  other.stops[0] = { ...other.stops[0], arrival: '08:00', departure: '08:00' };
  other.stops[1] = { ...other.stops[1], arrival: '08:10', departure: '08:11' };
  const report = validateGvdPlan(
    a,
    [other],
    [
      {
        id: '00000000-0000-4000-8000-000000000001',
        placeId: '1',
        name: 'AB',
        stations: ['A', 'B'],
        sections: [section()],
        stationTracks: [{ station: 'A', track: '1', lengthM: 50, clearanceSeconds: 60 }],
      },
    ],
  );
  assert.ok(report.conflicts.some((c) => c.message.includes('jednokoľajnom')));
  assert.ok(report.conflicts.some((c) => c.message.includes('dĺžku')));
});

test('a lower speed limit remains until the train rear clears it', () => {
  const a = train();
  a.trainLength = 300;
  const s = section();
  s.segments = [
    { lengthM: 100, speedKmh: 30, gradientPermille: 0 },
    { lengthM: 1900, speedKmh: 80, gradientPermille: 0 },
  ];
  const result = calculateRunningTimes(a, [s]);
  assert.ok(result.samples.filter((p) => p.distanceM <= 400).every((p) => p.speedKmh <= 30.001));
  assert.ok(result.samples.some((p) => p.distanceM > 500 && p.speedKmh > 40));
});

test('braked weight is checked against source tables without becoming a braking force', () => {
  const a = train();
  const before = calculateRunningTimes(a, [section()]).legs[0].technicalSeconds;
  Object.assign(a.planning!.stock!, { brakeMode: 'P', axles: 20, brakedWeightT: 80 });
  assert.equal(calculateRunningTimes(a, [section()]).legs[0].technicalSeconds, before);
  const report = validateGvdPlan(
    a,
    [],
    [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'AB',
        placeId: '1',
        stations: ['A', 'B'],
        sections: [
          {
            ...section(),
            source: 'Synthetic test table',
            brakeRequirements: [{ mode: 'P', maxAxles: 40, maxSpeedKmh: 100, requiredPercent: 80 }],
          },
        ],
      },
    ],
  );
  assert.ok(report.conflicts.some((c) => c.message.includes('brzdiacich percent')));
});

test('an entirely excluded calendar does not conflict with a legacy daily service', () => {
  const calendar = {
    ...newPlanning(),
    validFrom: '2005-01-03',
    validTo: '2005-01-03',
    weekdays: [1],
    excludedDates: ['2005-01-03'],
  };
  assert.equal(calendarsOverlap(calendar, undefined), false);
  assert.equal(calendarsOverlap(undefined, calendar), false);
});
