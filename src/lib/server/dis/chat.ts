import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  chatEndpointKey,
  chatScopeSchema,
  driverChatDisplayName,
  globalChatContact,
  sendChatSchema,
  type ChatContact,
  type ChatEndpoint,
  type ChatMessage,
  type ChatRecipient,
} from '@/lib/dis/chat';
import type { StationClaim } from '@/lib/dis/claims';
import type { DriverTrain } from '@/lib/dis/driver-train';
import { canPublishAnnouncements } from '@/lib/dis/permissions';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { getStationDisplayName } from '@/lib/station/display-name';
import { isPublicStation } from '@/lib/station/visibility';
import { MongoServerError, type Filter } from 'mongodb';
import { AppwriteException, type Models } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../mongo';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';
import { requireStationClaim } from './claims';

export async function chatMessagesCollection() {
  return (await getMongoDb()).collection<ChatMessage>('session_chat_messages');
}
export function chatHistoryFilter(sessionId: string, endpoint: ChatEndpoint): Filter<ChatMessage> {
  return {
    sessionId,
    $and: [
      {
        $or: [
          { audience: { $exists: false } },
          { audience: { $elemMatch: { kind: endpoint.kind, id: endpoint.id } } },
        ],
      },
      {
        $or: [
          { 'recipient.kind': 'session', 'recipient.id': 'all' },
          { 'sender.kind': endpoint.kind, 'sender.id': endpoint.id },
          { 'recipient.kind': endpoint.kind, 'recipient.id': endpoint.id },
        ],
      },
    ],
  };
}

async function requireChatSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.status !== 'active')
    throw new DisError(404, 'Aktívna relácia neexistuje.');
}

async function driverChatName(sessionId: string, userId: string, fallback: string) {
  const trains = await (
    await getMongoDb()
  )
    .collection<DriverTrain>('session_driver_trains')
    .find({ sessionId, userId, expiresAt: { $gt: Date.now() } })
    .toArray();
  if (trains.length) return driverChatDisplayName(userId, trains, fallback);
  const radio = (await gsmRRepository.list(sessionId)).find(
    (radio) => radio.binding?.userId === userId,
  );
  if (radio?.binding)
    return `${radio.binding.trainType} ${radio.binding.trainNumber}${radio.binding.driverCallsign ? ` (${radio.binding.driverCallsign})` : ''}`;
  return fallback;
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
  return {
    ...endpoint,
    name: await driverChatName(sessionId, profile.userId, profile.name),
    robloxUsername: profile.robloxUsername,
  };
}

export async function authorizeChatScope(body: unknown, profile: UserProfile) {
  const scope = chatScopeSchema.parse(body);
  await requireChatSession(scope.sessionId);
  if (scope.endpoint.kind === 'driver') {
    if (scope.endpoint.id !== profile.userId)
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
  await requireStationClaim(scope.sessionId, scope.endpoint.id, profile);
  const contact = await resolveContact(scope.sessionId, scope.endpoint);
  return { ...scope, contact: { ...scope.endpoint, name: contact.name } };
}

export async function loadChat(body: unknown, profile: UserProfile) {
  const scope = await authorizeChatScope(body, profile);
  const [stations, profiles, messages, selectedTrains, stationClaims] = await Promise.all([
    stationRepository.listBySessionId(scope.sessionId),
    listDocuments<Models.Document & UserProfile>('profiles'),
    (await chatMessagesCollection())
      .find(chatHistoryFilter(scope.sessionId, scope.endpoint))
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .toArray(),
    scope.endpoint.kind === 'station'
      ? (await getMongoDb())
          .collection<DriverTrain>('session_driver_trains')
          .find({ sessionId: scope.sessionId, expiresAt: { $gt: Date.now() } })
          .toArray()
      : Promise.resolve([]),
    (await getMongoDb())
      .collection<StationClaim>('session_station_claims')
      .find({ sessionId: scope.sessionId, expiresAt: { $gt: Date.now() } })
      .toArray(),
  ]);
  const profilesByUser = new Map(profiles.map((person) => [person.userId, person]));
  const stationOwners = new Map(stationClaims.map((claim) => [claim.stationId, claim.userId]));
  const selectedDrivers = new Set(selectedTrains.map((train) => train.userId));
  const conversationDrivers = new Set(
    messages
      .filter((message) => message.recipient.kind !== 'session')
      .flatMap((message) => [message.sender, message.recipient])
      .filter((endpoint) => endpoint.kind === 'driver')
      .map((endpoint) => endpoint.id),
  );
  const contacts: ChatContact[] = [
    globalChatContact,
    ...stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => ({
        kind: 'station' as const,
        id: station.stationId,
        name: getStationDisplayName(station.stationId),
        role: profilesByUser.get(stationOwners.get(station.stationId) || '')?.role,
        robloxUsername: profilesByUser.get(stationOwners.get(station.stationId) || '')
          ?.robloxUsername,
      })),
    ...profiles
      .filter(
        (person) =>
          canAssignShiftRole(person, 'driver') &&
          (selectedDrivers.has(person.userId) || conversationDrivers.has(person.userId)),
      )
      .map((person) => ({
        kind: 'driver' as const,
        id: person.userId,
        role: person.role,
        name: driverChatDisplayName(person.userId, selectedTrains, person.name),
        robloxUsername: person.robloxUsername,
      })),
  ].filter((contact) => chatEndpointKey(contact) !== chatEndpointKey(scope.endpoint));
  return { contacts, messages: messages.reverse(), self: scope.contact };
}

export async function sendChat(
  body: unknown,
  profile: UserProfile,
  operating?: Pick<ChatMessage, 'edd' | 'eddDigest' | 'eddResponseTo'>,
) {
  const command = sendChatSchema.parse(body);
  const scope = await authorizeChatScope(command, profile);
  if (
    command.announcement &&
    (!canPublishAnnouncements(profile.role) || command.recipient.kind !== 'session')
  )
    throw new DisError(403, 'Oznam môže odoslať iba oprávnený pracovník celej relácii.');
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
    senderRobloxUsername: profile.robloxUsername,
    senderRole: profile.role,
    ...(command.announcement ? { announcement: command.announcement } : {}),
    content: command.content,
    createdAt: new Date().toISOString(),
    clientMessageId: command.messageId,
    ...operating,
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
      existing.eddDigest !== message.eddDigest ||
      existing.announcement !== message.announcement ||
      chatEndpointKey(existing.sender) !== chatEndpointKey(message.sender) ||
      chatEndpointKey(existing.recipient) !== chatEndpointKey(message.recipient)
    )
      throw new DisError(409, 'Táto správa už bola odoslaná s iným obsahom.');
    return { message: existing };
  }
  return { message };
}
