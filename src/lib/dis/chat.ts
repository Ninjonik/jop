import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { z } from 'zod';

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
export type ChatContact = ChatRecipient & { name: string };
export const globalChatContact = { kind: 'session', id: 'all', name: 'Celá relácia' } as const;
export const chatScopeSchema = z.object({
  sessionId: sessionIdSchema,
  endpoint: chatEndpointSchema,
});
export const sendChatSchema = chatScopeSchema.extend({
  recipient: chatRecipientSchema,
  content: z.string().trim().min(1).max(1000),
  messageId: z.uuid(),
});
export type ChatMessage = {
  _id: string;
  sessionId: string;
  sender: ChatEndpoint & { name: string };
  recipient: ChatContact;
  senderUserId: string;
  senderName: string;
  content: string;
  createdAt: string;
  clientMessageId?: string;
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
  'chat:subscribe': (scope: z.infer<typeof chatScopeSchema>) => void;
}
export interface ChatServerEvents {
  'chat:snapshot': (snapshot: ChatSnapshot) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:error': (message: string) => void;
}
