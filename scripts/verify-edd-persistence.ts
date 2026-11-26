/** Only a new disposable mock session is changed; all fixtures are removed in finally. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import type { EddRecord } from '../src/lib/dis/records';
import { chatHistoryFilter, chatMessagesCollection, sendChat } from '../src/lib/server/dis/chat';
import { claimStation, requireStationClaim } from '../src/lib/server/dis/claims';
import {
  diaryEntries,
  editDiary,
  listDiaryMessages,
  projectDiary,
  receiveDiaryMessage,
  sendDiaryMessage,
} from '../src/lib/server/dis/edd-diary';
import { setSessionClock } from '../src/lib/server/dis/session-clock';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';

async function main() {
  const session = await stationService.createMockSession();
  const sessionId = session._id,
    stationId = 'kolarovo';
  const a: UserProfile = {
    userId: randomUUID(),
    name: 'Novák QA',
    role: 'dispatcher',
    callsign: 'QA',
    trainingStage: 'certified',
    strikes: 0,
  };
  const b = { ...a, userId: randomUUID(), name: 'Kováč QA' };
  const driver = { ...a, role: 'driver' as const };
  const scope = { sessionId, stationId };
  const mongo = await getMongoDb();
  try {
    await stationService.createStation(sessionId, stationId);
    await stationService.createStation(sessionId, 'vesele');
    await stationService.createStation(sessionId, 'other');
    await claimStation(scope, a);
    await claimStation({ sessionId, stationId: 'vesele' }, b);
    const legacy: EddRecord = {
      $id: 'legacy',
      ...scope,
      trainNumber: '5849',
      trainType: 'Os',
      direction: 'Veselé → Kolárovo',
      schedArrival: '23:59',
      schedDeparture: '00:02',
      actualArrival: '',
      actualDeparture: '',
      track: '1',
      status: 'scheduled',
      delayMinutes: 0,
    };
    const [initial] = await projectDiary([legacy]);
    assert.equal(initial.revision, 0);
    await assert.rejects(
      editDiary(
        { ...scope, id: legacy.$id, expectedRevision: 0, action: 'record', event: 'arrival' },
        driver,
      ),
      /ovládanie/,
    );
    const outcomes = await Promise.allSettled(
      [a, a].map((profile) =>
        editDiary(
          {
            ...scope,
            id: legacy.$id,
            expectedRevision: 0,
            action: 'record',
            event: 'arrival',
            time: '23:59',
            date: '2005-06-01',
          },
          profile,
        ),
      ),
    );
    assert.equal(
      outcomes.filter((r) => r.status === 'fulfilled').length,
      1,
      'Concurrent writes must have one winner',
    );
    await assert.rejects(
      editDiary(
        {
          ...scope,
          id: legacy.$id,
          expectedRevision: 1,
          action: 'record',
          event: 'departure',
          time: '00:02',
          date: '2005-06-01',
        },
        a,
      ),
      /pred príchodom/,
    );
    await editDiary(
      {
        ...scope,
        id: legacy.$id,
        expectedRevision: 1,
        action: 'record',
        event: 'departure',
        time: '00:02',
        date: '2005-06-02',
      },
      a,
    );
    await assert.rejects(
      editDiary(
        {
          ...scope,
          id: legacy.$id,
          expectedRevision: 2,
          action: 'correct',
          event: 'arrival',
          time: '23:58',
          date: '2005-06-01',
        },
        a,
      ),
      /dôvod/,
    );
    await editDiary(
      {
        ...scope,
        id: legacy.$id,
        expectedRevision: 2,
        action: 'correct',
        event: 'arrival',
        time: '23:58',
        date: '2005-06-01',
        reason: 'Oprava zápisu',
      },
      a,
    );
    await setSessionClock({ sessionId, offsetMinutes: -720 });
    const [retained] = await projectDiary([legacy]);
    assert.equal(retained.actualArrival, '23:58');
    assert.equal(retained.eventDates.departure, '2005-06-02');
    assert.equal(retained.history.length, 3);
    const offer = {
      ...scope,
      requestId: randomUUID(),
      toStation: 'vesele',
      trainNumber: '5849',
      kind: 'offer',
      time: '15:00',
    };
    const sent = (await sendDiaryMessage(offer, a)).message!;
    assert.equal(
      (await sendDiaryMessage(offer, a)).message!.id,
      sent.id,
      'Retries must be idempotent',
    );
    await assert.rejects(sendDiaryMessage({ ...offer, time: '15:01' }, a), /už bola/);
    const chat = await chatMessagesCollection();
    const ordinary = (
      await sendChat(
        {
          sessionId,
          endpoint: { kind: 'station', id: stationId },
          recipient: { kind: 'station', id: 'vesele' },
          messageId: randomUUID(),
          content: 'Existing station conversation',
        },
        a,
      )
    ).message;
    const inbox = await chat
      .find(chatHistoryFilter(sessionId, { kind: 'station', id: 'vesele' }))
      .toArray();
    assert(inbox.some((message) => message._id === ordinary._id));
    assert.equal(
      inbox.filter((message) => message.edd?.id === sent.id).length,
      1,
      'EDD preset must appear once in the existing station chat',
    );
    assert.equal(
      (await chat.find(chatHistoryFilter(sessionId, { kind: 'station', id: 'other' })).toArray())
        .length,
      0,
    );
    assert(!ordinary.edd, 'Ordinary messages remain ordinary messages');
    assert.equal(
      await mongo.collection('edd_diary_messages').countDocuments({ sessionId }),
      0,
      'No second EDD conversation collection',
    );
    await assert.rejects(requireStationClaim(sessionId, 'other', a), /ovládanie/);
    await claimStation({ sessionId, stationId: 'other' }, a);
    await requireStationClaim(sessionId, 'other', a);
    await requireStationClaim(sessionId, stationId, a);

    assert.equal((await listDiaryMessages(sessionId, 'other')).length, 0);
    await assert.rejects(
      receiveDiaryMessage({ ...scope, id: sent.id, acknowledge: true }, a),
      /nepatrí/,
    );
    const delivery = (await receiveDiaryMessage({ sessionId, stationId: 'vesele', id: sent.id }, b))
      .message;
    assert(delivery.deliveredAt);
    assert(!delivery.acknowledgedAt);
    const ack = (
      await receiveDiaryMessage(
        { sessionId, stationId: 'vesele', id: sent.id, acknowledge: true },
        b,
      )
    ).message;
    assert.equal(ack.acknowledgedBy, b.name);
    assert.equal(
      (await chat.findOne({ _id: sent.id }))?.edd?.acknowledgedBy,
      b.name,
      'Acknowledgment updates the same shared message',
    );
    const responses = await Promise.allSettled(
      ['accept', 'wait'].map((kind) =>
        sendDiaryMessage(
          {
            sessionId,
            stationId: 'vesele',
            requestId: randomUUID(),
            toStation: stationId,
            trainNumber: '5849',
            kind,
            time: '18:00',
            text: 'Test',
            replyToId: sent.id,
          },
          b,
        ),
      ),
    );
    assert.equal(responses.filter((r) => r.status === 'fulfilled').length, 1);
    const response = responses.find((r) => r.status === 'fulfilled');
    if (response?.status === 'fulfilled' && response.value.message?.kind === 'accept')
      assert.equal(response.value.message.time, '15:00', 'Acceptance must repeat original time');
    await assert.rejects(
      sendDiaryMessage({ ...offer, requestId: randomUUID(), kind: 'odhlaska' }, a),
      /celý vlak/,
    );
    await sendDiaryMessage(
      { ...offer, requestId: randomUUID(), kind: 'odhlaska', wholeTrainConfirmed: true },
      a,
    );
    await mongo
      .collection('session_station_claims')
      .updateOne({ sessionId, stationId }, { $set: { expiresAt: 0 } });
    await assert.rejects(
      editDiary(
        { ...scope, id: legacy.$id, expectedRevision: 3, action: 'details', notes: 'late' },
        a,
      ),
      /ovládanie/,
    );
    const originSeed = { ...legacy, $id: 'origin', notes: 'Existing note' };
    await projectDiary([originSeed]); // TPV can discover a legacy row before the station opens EDD.
    const hints = new Map([['origin', { movement: 'origin' as const, timetableId: 'fixture' }]]);
    const [origin] = await projectDiary([originSeed], hints);
    assert.equal(origin.movement, 'origin');
    assert.equal(origin.notes, 'Existing note');
    await claimStation(scope, a);
    await editDiary(
      { ...scope, id: 'origin', expectedRevision: 0, action: 'record', event: 'departure' },
      a,
    );
    const [preserved] = await projectDiary(
      [originSeed],
      new Map([['origin', { movement: 'terminus' as const, timetableId: 'fixture' }]]),
    );
    assert.equal(preserved.movement, 'origin', 'GVD refresh must preserve an operated entry');
    assert.match(
      preserved.actualDeparture,
      /^\d{2}:\d{2}$/,
      'Quick entries must never include seconds',
    );
    assert.equal((await (await diaryEntries()).find({ sessionId }).toArray()).length, 2);
    console.log(
      'PASS: isolated EDD persistence, concurrent edits, midnight, corrections, offset preservation, idempotent messages, ownership, receipt vs acknowledgment, reply race and odhlaska prerequisites.',
    );
  } finally {
    for (const name of [
      'edd_diary_entries',
      'session_chat_messages',
      'session_station_claims',
      'session_clocks',
      'stations',
      'station_actions',
    ])
      await mongo.collection(name).deleteMany({ sessionId });
    await mongo.collection('sessions').deleteOne({ _id: sessionId as never });
    await (await getMongoClient()).close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
