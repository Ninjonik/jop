import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  chatEndpointKey,
  chatScopeSchema,
  globalChatContact,
  sendChatSchema,
  type ChatContact,
  type ChatMessage,
  type ChatRecipient,
} from '@/lib/dis/chat';
import type { DriverTrain } from '@/lib/dis/driver-train';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { getStationDisplayName } from '@/lib/station/display-name';
import { isPublicStation } from '@/lib/station/visibility';
import { MongoServerError } from 'mongodb';
import { AppwriteException } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { databaseId, disDatabase, DisError } from './appwrite';
import { loadStaff } from './personnel';

export async function chatMessagesCollection() {
  return (await getMongoDb()).collection<ChatMessage>('session_chat_messages');
}

async function requireChatSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.status !== 'active')
    throw new DisError(404, 'Aktívna relácia neexistuje.');
}

async function driverChatName(sessionId: string, userId: string, fallback: string) {
  const train = await (
    await getMongoDb()
  )
    .collection<DriverTrain>('session_driver_trains')
    .findOne({ sessionId, userId });
  return train ? `${train.trainType} ${train.trainNumber}` : fallback;
}

export async function resolveContact(
  sessionId: string,
  endpoint: ChatRecipient,
): Promise<ChatContact> {
  if (endpoint.kind === 'session') return globalChatContact;
  if (endpoint.kind === 'station') {
    if (!isPublicStation(endpoint.id))
      throw new DisError(400, 'Interná stanica nie je určená na komunikáciu.');
    const station = await stationRepository.findBySessionAndStationId(sessionId, endpoint.id);
    if (!station) throw new DisError(404, 'Stanica nepatrí do vybranej relácie.');
    return { ...endpoint, name: getStationDisplayName(station.stationId) };
  }
  let profile: UserProfile;
  try {
    profile = (await disDatabase().getDocument(
      databaseId,
      'profiles',
      endpoint.id,
    )) as unknown as UserProfile;
  } catch (error) {
    if (error instanceof AppwriteException && error.code === 404)
      throw new DisError(404, 'Rušňovodič nie je dostupný.');
    throw new DisError(503, 'Zoznam rušňovodičov je dočasne nedostupný.');
  }
  if (profile.userId !== endpoint.id || !canAssignShiftRole(profile, 'driver'))
    throw new DisError(400, 'Vybraný zamestnanec nie je rušňovodič.');
  return { ...endpoint, name: await driverChatName(sessionId, profile.userId, profile.name) };
}

export async function authorizeChatScope(body: unknown, profile: UserProfile) {
  const scope = chatScopeSchema.parse(body);
  await requireChatSession(scope.sessionId);
  if (scope.endpoint.kind === 'driver') {
    if (scope.endpoint.id !== profile.userId || !canAssignShiftRole(profile, 'driver'))
      throw new DisError(403, 'Môžete otvoriť iba vlastnú komunikáciu rušňovodiča.');
    return {
      ...scope,
      contact: {
        ...scope.endpoint,
        name: await driverChatName(scope.sessionId, profile.userId, profile.name),
      },
    };
  }
  if (!canAssignShiftRole(profile, 'dispatcher'))
    throw new DisError(403, 'Staničná komunikácia je určená výpravcom.');
  const contact = await resolveContact(scope.sessionId, scope.endpoint);
  return { ...scope, contact: { ...scope.endpoint, name: contact.name } };
}

export async function loadChat(body: unknown, profile: UserProfile) {
  const scope = await authorizeChatScope(body, profile);
  const [stations, staff, messages] = await Promise.all([
    stationRepository.listBySessionId(scope.sessionId),
    scope.endpoint.kind === 'station' ? loadStaff() : Promise.resolve({ profiles: [] }),
    (await chatMessagesCollection())
      .find({
        sessionId: scope.sessionId,
        $or: [
          { 'recipient.kind': 'session', 'recipient.id': 'all' },
          { 'sender.kind': scope.endpoint.kind, 'sender.id': scope.endpoint.id },
          { 'recipient.kind': scope.endpoint.kind, 'recipient.id': scope.endpoint.id },
        ],
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .toArray(),
  ]);
  const contacts: ChatContact[] = [
    globalChatContact,
    ...stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => ({
        kind: 'station' as const,
        id: station.stationId,
        name: getStationDisplayName(station.stationId),
      })),
    ...staff.profiles
      .filter((person) => canAssignShiftRole(person, 'driver'))
      .map((person) => ({ kind: 'driver' as const, id: person.userId, name: person.name })),
  ].filter((contact) => chatEndpointKey(contact) !== chatEndpointKey(scope.endpoint));
  return { contacts, messages: messages.reverse(), self: scope.contact };
}

export async function sendChat(body: unknown, profile: UserProfile) {
  const command = sendChatSchema.parse(body);
  const scope = await authorizeChatScope(command, profile);
  if (chatEndpointKey(command.endpoint) === chatEndpointKey(command.recipient))
    throw new DisError(400, 'Vyberte iného príjemcu.');
  if (
    command.endpoint.kind === 'driver' &&
    !['station', 'session'].includes(command.recipient.kind)
  )
    throw new DisError(400, 'Rušňovodič môže písať staniciam.');
  const recipient = await resolveContact(command.sessionId, command.recipient);
  const message: ChatMessage = {
    _id: createHash('sha256')
      .update(JSON.stringify([profile.userId, command.messageId]))
      .digest('hex'),
    sessionId: command.sessionId,
    sender: scope.contact,
    recipient,
    senderUserId: profile.userId,
    senderName: profile.name,
    content: command.content,
    createdAt: new Date().toISOString(),
    clientMessageId: command.messageId,
  };
  const collection = await chatMessagesCollection();
  try {
    await collection.insertOne(message);
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    const existing = await collection.findOne({ _id: message._id });
    if (
      !existing ||
      existing.sessionId !== message.sessionId ||
      existing.content !== message.content ||
      chatEndpointKey(existing.sender) !== chatEndpointKey(message.sender) ||
      chatEndpointKey(existing.recipient) !== chatEndpointKey(message.recipient)
    )
      throw new DisError(409, 'Táto správa už bola odoslaná s iným obsahom.');
    return { message: existing };
  }
  return { message };
}
