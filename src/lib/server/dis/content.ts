import type { UserProfile } from '@/lib/dis/appwrite-client';
import type { DisDocument, RadioMessage } from '@/lib/dis/records';
import { ID, Query, type Models } from 'node-appwrite';
import { z } from 'zod';
import { databaseId, disDatabase, listDocuments } from './appwrite';
import { requireStation } from './edd';

export async function loadDisDocuments(canEdit: boolean) {
  return listDocuments<Models.Document & DisDocument>(
    'documents',
    canEdit ? [] : [Query.equal('isPublished', true)],
  );
}
const documentSchema = z.object({
  id: z.string().max(36).optional(),
  title: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(64),
  contentMarkdown: z.string().max(50000),
  isPublished: z.boolean(),
});
export async function saveDisDocument(body: unknown, profile: UserProfile) {
  const { id, ...input } = documentSchema.parse(body);
  const payload = { ...input, authorName: profile.name };
  const db = disDatabase();
  return {
    document: id
      ? await db.updateDocument(databaseId, 'documents', id, payload)
      : await db.createDocument(databaseId, 'documents', ID.unique(), payload),
  };
}
export async function loadRadio(sessionId: string) {
  return (
    await disDatabase().listDocuments<Models.Document & RadioMessage>(
      databaseId,
      'radio_messages',
      [Query.equal('sessionId', sessionId), Query.orderDesc('$createdAt'), Query.limit(100)],
    )
  ).documents.reverse();
}
export async function sendRadio(body: unknown, profile: UserProfile) {
  const command = z
    .object({
      sessionId: z.string().trim().min(1).max(64),
      stationId: z.string().trim().min(1).max(64),
      targetRecipient: z.string().trim().min(1).max(64),
      content: z.string().trim().min(1).max(1000),
      isUrgentOrder: z.boolean().default(false),
    })
    .parse(body);
  await requireStation(command);
  const payload = {
    sessionId: command.sessionId,
    targetRecipient: command.targetRecipient,
    content: command.content,
  };
  return {
    message: await disDatabase().createDocument(databaseId, 'radio_messages', ID.unique(), {
      ...payload,
      isUrgentOrder:
        command.isUrgentOrder && ['admin', 'dispatcher_manager'].includes(profile.role),
      channel: 'general',
      senderId: profile.userId,
      senderName: profile.name,
      senderRole: profile.role,
    }),
  };
}
