import type { TestContext } from 'node:test';
import { personnelCallsignRepository } from '../../server/repositories/personnel-callsign-repository';

/** Unit callers use fixtures; verify-callsigns.ts covers actual Mongo arbitration. */
export function mockCallsignReservations(context: TestContext) {
  const numbers = new Map<string, string>();
  context.mock.method(
    personnelCallsignRepository,
    'findByUser',
    async (userId: string) => [...numbers].find(([, owner]) => owner === userId)?.[0] ?? null,
  );
  context.mock.method(personnelCallsignRepository, 'listNumbers', async () => [...numbers.keys()]);
  context.mock.method(
    personnelCallsignRepository,
    'reserve',
    async (userId: string, number: string) => {
      const existing = [...numbers].find(([, owner]) => owner === userId)?.[0];
      if (existing) return existing;
      if (numbers.has(number)) return null;
      numbers.set(number, userId);
      return number;
    },
  );
}
