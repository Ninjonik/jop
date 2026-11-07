import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { z } from 'zod';

export const chatEndpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('station'), id: stationIdSchema }),
  z.object({ kind: z.literal('driver'), id: z.string().min(1).max(64) }),
]);
export type ChatEndpoint = z.infer<typeof chatEndpointSchema>;
export type ChatContact = ChatEndpoint & { name: string };
export const chatScopeSchema = z.object({
  sessionId: sessionIdSchema,
  endpoint: chatEndpointSchema,
});
export const sendChatSchema = chatScopeSchema.extend({
  recipient: chatEndpointSchema,
  content: z.string().trim().min(1).max(1000),
  messageId: z.uuid(),
});
export type ChatMessage = {
  _id: string;
  sessionId: string;
  sender: ChatContact;
  recipient: ChatContact;
  senderUserId: string;
  senderName: string;
  content: string;
  createdAt: string;
};
export type ChatSnapshot = { messages: ChatMessage[]; contacts: ChatContact[] };
export function chatEndpointKey(endpoint: ChatEndpoint) {
  return `${endpoint.kind}:${endpoint.id}`;
}
export function chatRoom(sessionId: string, endpoint: ChatEndpoint) {
  return JSON.stringify(['chat', sessionId, endpoint.kind, endpoint.id]);
}
export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map((message) => [message._id, message]));
  for (const message of incoming) messages.set(message._id, message);
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
