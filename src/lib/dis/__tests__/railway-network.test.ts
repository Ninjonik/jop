import { Account, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { POST as savePreference } from '../../../../apps/api/src/app/api/dis/preferences/route';
import {
  GET as getNetwork,
  POST as saveNetwork,
} from '../../../../apps/api/src/app/api/dis/railway-network/route';
import { bookletRows } from '../booklet';
import {
  networkPath,
  pointKind,
  railwayNetworkSchema,
  seedRailwayNetwork,
} from '../railway-network';
import { normalizeTimetable } from '../timetable';
const network = () => seedRailwayNetwork('113144512557419');
test('map boundaries, both AH points and double-track lower Dvorníky are explicit', () => {
  const n = network();
  assert.equal(n.points.length, 18);
  assert.ok(n.points.some((p) => p.id === 'klenov'));
  assert.ok(n.points.some((p) => p.id === 'chym'));
  assert.ok(!n.points.some((p) => ['prilohy', 'strezenice', 'kamenany'].includes(p.id)));
  assert.equal(pointKind('AH Brekov'), 'Hradlo');
  assert.ok(n.points.every((p) => !p.name.includes('AHr.')));
  const path = networkPath(n, 'klenov', 'nadezdovo');
  assert.deepEqual(path, ['klenov', 'dvorniky-zastavka', 'nadezdovo']);
  for (let i = 1; i < path.length; i++)
    assert.equal(n.sections.find((s) => s.from === path[i - 1] && s.to === path[i])?.tracks, 2);
  assert.deepEqual(networkPath(n, 'nadezdovo', 'klenov'), [...path].reverse());
  assert.deepEqual(seedRailwayNetwork('999').points, []);
});
test('invalid topology and contradictory signalling cannot be saved', () => {
  const a = network();
  a.sections.push({ ...a.sections[0], id: 'other' });
  assert.equal(railwayNetworkSchema.safeParse(a).success, false);
  const b = network();
  b.sections[0].to = 'missing';
  assert.equal(railwayNetworkSchema.safeParse(b).success, false);
  const c = network();
  c.points[0].symbols = ['speed', 'P'];
  assert.equal(railwayNetworkSchema.safeParse(c).success, false);
  const d = network();
  d.points[0].symbols = ['S', 'B'];
  assert.equal(railwayNetworkSchema.safeParse(d).success, false);
  assert.equal(railwayNetworkSchema.safeParse(network()).success, true);
});
test('ZCP follows direction, includes operating points and uses configured speed/brake requirements', () => {
  const n = network();
  n.points.find((p) => p.id === 'nadezdovo')!.symbols = ['speed', 'dispatch'];
  n.sections.find((s) => s.from === 'nadezdovo' && s.to === 'chym')!.speed = 120;
  n.sections.find((s) => s.from === 'nadezdovo' && s.to === 'chym')!.requiredBrakePercent = 85;
  const train = normalizeTimetable({
    trainNumber: '1',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 100,
    stops: [
      { station: 'Nadeždovo', arrival: '08:00', departure: '08:00' },
      { station: 'chym', arrival: '08:02:30', departure: '08:02:30' },
    ],
  });
  const rows = bookletRows(train, n);
  assert.equal(rows[0].id, 'nadezdovo');
  assert.equal(rows[0].speed, '100/85');
  assert.equal(rows[0].section?.tracks, 2);
  const t = normalizeTimetable({
    ...train,
    stops: [
      { station: 'teriakovce', arrival: '08:00', departure: '08:00' },
      { station: 'nadezdovo', arrival: '08:20', departure: '08:20' },
    ],
  });
  assert.ok(bookletRows(t, n).some((row) => row.id === 'ah-brekov' && row.operating));
  assert.ok(bookletRows(t, n).some((row) => row.id === 'ah-prilesie' && row.operating));
});
function authorize(ctx: TestContext, role: string) {
  process.env.APPWRITE_API_KEY = 'synthetic-test-key';
  ctx.mock.method(Account.prototype, 'get', async () => ({ $id: 'test-user' }));
  ctx.mock.method(Databases.prototype, 'getDocument', async () => ({ userId: 'test-user', role }));
}
test('network and preference APIs require authentication; drivers cannot edit shared infrastructure', async (ctx) => {
  assert.equal(
    (
      await getNetwork(
        new Request('http://localhost/api/dis/railway-network?placeId=113144512557419'),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await savePreference(
        new Request('http://localhost/api/dis/preferences', { method: 'POST', body: '{}' }),
      )
    ).status,
    401,
  );
  authorize(ctx, 'driver');
  assert.equal(
    (
      await saveNetwork(
        new Request('http://localhost/api/dis/railway-network', {
          method: 'POST',
          headers: { Authorization: 'Bearer synthetic' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
});
