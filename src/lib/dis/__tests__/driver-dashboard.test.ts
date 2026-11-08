import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getStationDisplayName } from '../../station/display-name';
import { isPublicStation } from '../../station/visibility';
import { mergeChatMessages, type ChatMessage } from '../chat';
import { driverTrainInputSchema } from '../driver-train';
import { checkTimetableConflicts, normalizeTimetable } from '../timetable';

test('chat confirmation replaces its pending copy and reconnects never duplicate it', () => {
  const pending: ChatMessage & { delivery?: string } = {
    _id: 'pending-1',
    sessionId: 's',
    clientMessageId: 'client-1',
    senderUserId: 'u',
    senderName: 'U',
    sender: { kind: 'station', id: 'a', name: 'A' },
    recipient: { kind: 'session', id: 'all', name: 'All' },
    content: 'Hello',
    createdAt: '2026-11-08T10:00:00Z',
    delivery: 'sending',
  };
  const saved: ChatMessage = { ...pending, _id: 'saved-1' };
  delete (saved as typeof pending).delivery;
  const confirmed = mergeChatMessages([pending], [saved]);
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]._id, 'saved-1');
  assert.equal('delivery' in confirmed[0], false);
  assert.equal(mergeChatMessages(confirmed, [saved]).length, 1);
  assert.equal(
    mergeChatMessages([pending], [{ ...saved, senderUserId: 'someone-else' }]).length,
    2,
    'Another sender cannot reconcile your pending message',
  );
});

test('Pos, custom numbers and optional consist details are valid driver inputs', () => {
  const input = {
    sessionId: 's',
    trainNumber: '90001',
    trainType: 'Pos',
    timetableId: null,
    endStation: '',
    length: null,
    tonnage: 140.5,
    wagons: 0,
  };
  assert.equal(driverTrainInputSchema.parse(input).trainType, 'Pos');
  assert.equal(
    driverTrainInputSchema.parse({ ...input, trainNumber: 'EXTRA-42' }).timetableId,
    null,
  );
  assert.throws(() => driverTrainInputSchema.parse({ ...input, wagons: -1 }));
});

test('GVD normalization retains notes and next-leg links; unknown tracks are not invented conflicts', () => {
  const timetable = normalizeTimetable({
    trainNumber: '1',
    trainType: 'Os',
    trainLength: 100,
    maxSpeed: 100,
    notes: 'Train note',
    nextTrainId: 'next',
    stops: [
      { station: 'a', arrival: '08:00', departure: '08:00', notes: 'Stop note' },
      { station: 'b', arrival: '08:10', departure: '08:10' },
    ],
  });
  assert.equal(timetable.stops[0].notes, 'Stop note');
  assert.equal(timetable.stops[0].track, '');
  assert.equal(timetable.nextTrainId, 'next');
  assert.equal(
    checkTimetableConflicts(timetable, [{ ...timetable, trainNumber: '2' }]).conflicts.length,
    0,
  );
});

test('only the exact internal helper station is hidden', () => {
  assert(!isPublicStation('inter'));
  assert(!isPublicStation(' INTER '));
  assert(isPublicStation('intercity'));
  assert(isPublicStation('kolarovo'));
});

test('station display names keep the canonical ID separate from Slovak labels', () => {
  assert.equal(getStationDisplayName('kolarovo'), 'Kolárovo');
  assert.equal(getStationDisplayName('vesele'), 'Veselé');
  assert.equal(getStationDisplayName('borinka'), 'Borinka');
});
