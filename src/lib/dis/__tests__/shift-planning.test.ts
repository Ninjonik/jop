import { Account, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { POST } from '../../../app/api/dis/shifts/route';
import { readShiftPlan } from '../../server/dis/shift-planning';

function authorize(context: TestContext, role: string) {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  context.mock.method(Account.prototype, 'get', async () => ({ $id: 'test-user' }));
  context.mock.method(Databases.prototype, 'getDocument', async () => ({
    userId: 'test-user',
    role,
  }));
}

function request(command: string, authenticated = true) {
  return new Request('http://localhost/api/dis/shifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer synthetic-test-token' } : {}),
    },
    body: JSON.stringify({
      command,
      id: 'shift',
      role: 'dispatcher',
      targetId: 'A',
      userId: 'test-user',
      placeId: '123',
      timetableIds: ['train'],
    }),
  });
}

test('planning and assignment require authentication', async () => {
  for (const command of ['plan', 'assign'])
    assert.equal((await POST(request(command, false))).status, 401);
});

test('ordinary staff cannot change a shift timetable or assignments', async (context) => {
  authorize(context, 'driver');
  const write = context.mock.method(Databases.prototype, 'updateDocument', async () => {
    throw new Error('Unexpected write');
  });
  for (const command of ['plan', 'assign'])
    assert.equal((await POST(request(command))).status, 403);
  assert.equal(write.mock.callCount(), 0);
});

test('legacy plans normalize to null and corrupted plans fail explicitly', () => {
  assert.equal(readShiftPlan(undefined), null);
  assert.equal(readShiftPlan(null), null);
  assert.throws(() => readShiftPlan('{'));
  assert.throws(() => readShiftPlan('{}'));
});
