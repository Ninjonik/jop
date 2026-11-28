'use client';
import type { DisplayMessage } from '@/app/components/dis/ChatMessageView';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useCallback, useRef, useState } from 'react';
import { disFetch } from './api-client';
import type { UserProfile } from './appwrite-client';
import type { ChatMessage } from './chat';
import { formatEddMessage, type EddMessage, type EddSendCommand } from './edd';

/** Only the local sender display is predicted. Receipt and diary state remain server-owned. */
export function useEddOutbox(profile: UserProfile | null) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const submissions = useRef(
    new Map<string, { command: EddSendCommand; message: DisplayMessage }>(),
  );
  const inFlight = useRef(new Set<string>());
  const confirmed = useRef(new Set<string>());

  const confirm = useCallback((message: ChatMessage) => {
    const id = message.clientMessageId;
    const submission = id ? submissions.current.get(id) : undefined;
    if (
      !id ||
      !submission ||
      confirmed.current.has(id) ||
      message.sessionId !== submission.message.sessionId ||
      message.senderUserId !== submission.message.senderUserId
    )
      return;
    confirmed.current.add(id);
    setMessages((previous) => previous.filter((item) => item.clientMessageId !== id));
    if (!inFlight.current.has(id)) {
      submissions.current.delete(id);
      confirmed.current.delete(id);
    }
  }, []);

  const retry = useCallback(async (id: string) => {
    const submission = submissions.current.get(id);
    if (!submission || inFlight.current.has(id)) return false;
    inFlight.current.add(id);
    setMessages((previous) =>
      previous.map((item) =>
        item.clientMessageId === id
          ? { ...item, delivery: 'sending', deliveryError: undefined }
          : item,
      ),
    );
    try {
      const result = await disFetch<{ message: EddMessage }>('/api/dis/edd', {
        method: 'POST',
        body: JSON.stringify({ ...submission.command, command: 'send' }),
      });
      if (!confirmed.current.has(id))
        setMessages((previous) =>
          previous.map((item) =>
            item.clientMessageId === id
              ? {
                  ...submission.message,
                  _id: result.message.id,
                  edd: result.message,
                  delivery: undefined,
                }
              : item,
          ),
        );
      return true;
    } catch (error) {
      // A socket confirmation is stronger evidence than a lost HTTP response.
      if (confirmed.current.has(id)) return true;
      setMessages((previous) =>
        previous.map((item) =>
          item.clientMessageId === id
            ? {
                ...item,
                delivery: 'failed',
                deliveryError: error instanceof Error ? error.message : '\u00dakon zlyhal.',
              }
            : item,
        ),
      );
      return false;
    } finally {
      inFlight.current.delete(id);
      if (confirmed.current.has(id)) {
        submissions.current.delete(id);
        confirmed.current.delete(id);
      }
    }
  }, []);

  const send = useCallback(
    (command: EddSendCommand, preview: EddMessage) => {
      if (!profile || submissions.current.has(command.requestId)) return Promise.resolve(false);
      const createdAt = new Date().toISOString();
      const message: DisplayMessage = {
        _id: `pending-${command.requestId}`,
        clientMessageId: command.requestId,
        sessionId: command.sessionId,
        sender: {
          kind: 'station',
          id: command.stationId,
          name: getStationDisplayName(command.stationId),
        },
        recipient: {
          kind: 'station',
          id: command.toStation,
          name: getStationDisplayName(command.toStation),
        },
        senderUserId: profile.userId,
        senderName: profile.name,
        senderRole: profile.role,
        senderRobloxUsername: profile.robloxUsername,
        createdAt,
        content: formatEddMessage(preview, 'sk'),
        edd: {
          ...preview,
          id: command.requestId,
          createdAt,
          ...(command.replyToId ? { replyToId: command.replyToId } : {}),
        },
        delivery: 'sending',
      };
      submissions.current.set(command.requestId, { command: { ...command }, message });
      setMessages((previous) => [...previous, message]);
      return retry(command.requestId);
    },
    [profile, retry],
  );
  return { messages, send, retry, confirm };
}
