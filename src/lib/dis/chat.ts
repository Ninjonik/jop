import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { z } from 'zod';
import type { UserRole } from './appwrite-client';
import type { ChatSystemEvent } from './chat-system';
import type { DriverTrain } from './driver-train';
import type { RadioCredentials, RadioEmergency, RadioTerminalState } from './radio';

export const chatEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('station'), id: stationIdSchema }),
  z.object({ kind: z.literal('driver'), id: z.string().min(1).max(64) }),
]);
export type ChatEndpoint = z.infer<typeof chatEndpointSchema>;
export const chatRecipientSchema = z.union([
  chatEndpointSchema,
  z.object({ kind: z.literal('session'), id: z.literal('all') }),
]);
export type ChatRecipient = z.infer<typeof chatRecipientSchema>;
export type ChatContact = ChatRecipient & { name: string; robloxUsername?: string };
export const globalChatContact = { kind: 'session', id: 'all', name: 'Celá relácia' } as const;
export const chatScopeSchema = z.object({
  sessionId: sessionIdSchema,
  endpoint: chatEndpointSchema,
});
export const sendChatSchema = chatScopeSchema.extend({
  recipient: chatRecipientSchema,
  content: z.string().trim().min(1).max(1000),
  messageId: z.uuid(),
  announcement: z.enum(['info', 'warning', 'alarm']).optional(),
});
export type ChatMessage = {
  _id: string;
  sessionId: string;
  sender: ChatEndpoint & { name: string };
  recipient: ChatContact;
  senderUserId: string;
  senderName: string;
  senderRobloxUsername?: string;
  senderRole?: UserRole;
  announcement?: 'info' | 'warning' | 'alarm';
  content: string;
  createdAt: string;
  clientMessageId?: string;
  system?: ChatSystemEvent;
  /** Local RADIOSTOP history is visible only to these captured endpoints. */
  audience?: ChatEndpoint[];
};
export type ChatSnapshot = {
  messages: ChatMessage[];
  contacts: ChatContact[];
  self?: ChatMessage['sender'];
};
export function chatEndpointKey(endpoint: ChatRecipient) {
  return `${endpoint.kind}:${endpoint.id}`;
}
export function chatRoom(sessionId: string, endpoint: ChatRecipient) {
  return JSON.stringify(['chat', sessionId, endpoint.kind, endpoint.id]);
}
export function chatConversationKey(message: ChatMessage, self: ChatEndpoint) {
  if (message.recipient.kind === 'session') return chatEndpointKey(globalChatContact);
  return chatEndpointKey(
    chatEndpointKey(message.sender) === chatEndpointKey(self) ? message.recipient : message.sender,
  );
}
export function driverChatDisplayName(
  userId: string,
  trains: Pick<DriverTrain, 'userId' | 'trainType' | 'trainNumber' | 'expiresAt'>[],
  fallback: string,
  now = Date.now(),
) {
  const names = trains
    .filter((train) => train.userId === userId && (train.expiresAt || 0) > now)
    .map((train) => `${train.trainType} ${train.trainNumber}`);
  return (
    [...new Set(names)].sort((a, b) => a.localeCompare(b, 'sk', { numeric: true })).join(' / ') ||
    fallback
  );
}
export function mergeChatMessages<T extends ChatMessage>(current: T[], incoming: T[]): T[] {
  const messages = new Map(current.map((message) => [message._id, message]));
  for (const message of incoming) {
    if (message.clientMessageId) {
      for (const [id, previous] of messages) {
        if (
          previous.clientMessageId === message.clientMessageId &&
          previous.senderUserId === message.senderUserId &&
          previous.sessionId === message.sessionId
        )
          messages.delete(id);
      }
    }
    messages.set(message._id, message);
  }
  return [...messages.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a._id.localeCompare(b._id))
    .slice(-200);
}
export interface ChatClientEvents {
  'chat:refresh-auth': (token: string) => void;
  'radio:status': () => void;
  'radio:claim': () => void;
  'radio:release': () => void;
  'radio:heartbeat': () => void;
  'radio:emergency-start': (scope: 'session' | 'station') => void;
  'radio:emergency-stop': () => void;
  'radio:emergency-failed': (id: string) => void;
  'chat:subscribe': (scope: z.infer<typeof chatScopeSchema>) => void;
  'call:start': (recipient: ChatEndpoint) => void;
  'call:accept': (id: string) => void;
  'call:end': (id: string) => void;
}
export interface ChatServerEvents {
  'radio:terminal': (state: RadioTerminalState) => void;
  'radio:heartbeat-request': () => void;
  'radio:emergency-connected': (call: RadioEmergency & RadioCredentials) => void;
  'radio:emergency-ended': (call: { id: string; reason: string }) => void;
  'chat:snapshot': (snapshot: ChatSnapshot) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:error': (message: string) => void;
  'call:ringing': (call: { id: string; contact: ChatContact; incoming: boolean }) => void;
  'call:connected': (call: RadioCredentials) => void;
  'call:error': (message: string) => void;
  'call:ended': (call: { id: string; reason: string }) => void;
}
