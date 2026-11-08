import { Account, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireDisProfile } from '../../server/dis/appwrite';
import type { UserProfile, UserRole } from '../appwrite-client';
import { hasDisRole, isDisAdministrator } from '../permissions';
import { canAssignShiftRole } from '../shift-plan';

test('department heads have the same permissions and shift eligibility as administrators', () => {
  for (const role of ['admin', 'driver_manager', 'dispatcher_manager'] as const) {
    const profile = { role } as UserProfile;
    assert.equal(isDisAdministrator(role), true);
    assert.equal(hasDisRole(role, ['admin']), true);
    assert.equal(canAssignShiftRole(profile, 'dispatcher'), true);
    assert.equal(canAssignShiftRole(profile, 'driver'), true);
  }
  for (const role of [
    'driver',
    'dispatcher',
    'driver_instructor',
    'dispatcher_instructor',
  ] as UserRole[]) {
    assert.equal(isDisAdministrator(role), false);
    assert.equal(hasDisRole(role, ['admin']), false);
  }
  assert.equal(hasDisRole(undefined, ['admin']), false);
});

test('server grants admin-only operations to department heads and rejects other staff', async (context) => {
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = 'test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  let role: UserRole = 'driver_manager';
  context.mock.method(Account.prototype, 'get', async () => ({ $id: 'test-user' }));
  context.mock.method(Databases.prototype, 'getDocument', async () => ({
    userId: 'test-user',
    role,
  }));
  const request = new Request('http://localhost/', {
    headers: { Authorization: 'Bearer test-token' },
  });
  for (role of ['driver_manager', 'dispatcher_manager', 'admin'] as const) {
    assert.equal((await requireDisProfile(request, ['admin'])).role, role);
  }
  role = 'driver_instructor';
  await assert.rejects(requireDisProfile(request, ['admin']), { status: 403 });
});
