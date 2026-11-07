'use client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { clearDisToken, disFetch, getDisToken } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import {
  chatEndpointKey,
  mergeChatMessages,
  type ChatClientEvents,
  type ChatContact,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export function SessionChatView({
  sessionId,
  stationId,
}: {
  sessionId: string;
  stationId: string;
}) {
  const { profile, canOperateStation, canDriveTrain } = useDisAuth();
  const [mode, setMode] = useState<'station' | 'driver'>(
    canOperateStation && stationId ? 'station' : 'driver',
  );
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [target, setTarget] = useState('');
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draftId = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const connection = useRef<Socket<ChatServerEvents, ChatClientEvents> | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const current = useRef({ expanded, target });
  const endpointId = mode === 'station' ? stationId : profile?.userId || '';
  const endpointKey = `${mode}:${endpointId}`;
  useEffect(() => {
    current.current = { expanded, target };
  }, [expanded, target]);

  useEffect(() => {
    if (!endpointId || !profile) return;
    let active = true;
    const socket: Socket<ChatServerEvents, ChatClientEvents> = io('/chat', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: (callback) => {
        void getDisToken()
          .then((token) => callback({ token }))
          .catch(() => callback({}));
      },
    });
    connection.current = socket;
    socket.on('connect', () => {
      socket.emit('chat:subscribe', { sessionId, endpoint: { kind: mode, id: endpointId } });
    });
    socket.on('chat:snapshot', (snapshot) => {
      if (!active) return;
      setConnected(true);
      setError('');
      setContacts(snapshot.contacts);
      for (const message of snapshot.messages) seen.current.add(message._id);
      setMessages((previous) => mergeChatMessages(previous, snapshot.messages));
    });
    socket.on('chat:message', (message) => {
      if (!active || message.sessionId !== sessionId) return;
      if (seen.current.has(message._id)) return;
      seen.current.add(message._id);
      setMessages((previous) => mergeChatMessages(previous, [message]));
      if (chatEndpointKey(message.recipient) === endpointKey) {
        const key = chatEndpointKey(message.sender);
        if (!current.current.expanded || current.current.target !== key)
          setUnread((previous) => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
      }
    });
    socket.on('chat:error', (message) => {
      setError(message);
      setConnected(false);
    });
    socket.on('connect_error', (error) => {
      setError(error.message);
      setConnected(false);
    });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (active && reason === 'io server disconnect') {
        clearDisToken();
        socket.connect();
      }
    });
    return () => {
      active = false;
      socket.disconnect();
      connection.current = null;
    };
  }, [sessionId, mode, endpointId, endpointKey, profile]);

  const recipient = contacts.find((contact) => chatEndpointKey(contact) === target);
  const conversation = messages.filter(
    (message) =>
      chatEndpointKey(message.sender) === target || chatEndpointKey(message.recipient) === target,
  );
  useEffect(() => {
    if (follow.current && view.current) view.current.scrollTop = view.current.scrollHeight;
  }, [messages, target, expanded]);
  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0);

  function chooseTarget(value: string) {
    setTarget(value);
    setUnread((previous) => ({ ...previous, [value]: 0 }));
    follow.current = true;
    draftId.current = null;
  }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!recipient || !text.trim() || busy) return;
    setBusy(true);
    setError('');
    draftId.current ??= crypto.randomUUID();
    try {
      const result = await disFetch<{ message: ChatMessage }>('/api/dis/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          endpoint: { kind: mode, id: endpointId },
          recipient: { kind: recipient.kind, id: recipient.id },
          content: text,
          messageId: draftId.current,
        }),
      });
      setMessages((previous) => mergeChatMessages(previous, [result.message]));
      setText('');
      draftId.current = null;
      follow.current = true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Správa nebola odoslaná.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="session-chat" aria-label="Komunikácia medzi stanicami a rušňovodičmi">
      <div className="authoring-caption">
        <button
          className="aero-btn"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            follow.current = true;
            if (!expanded) setUnread((previous) => ({ ...previous, [target]: 0 }));
          }}
        >
          <AeroIcon name="quote" />
          Komunikácia{totalUnread > 0 ? ` (${totalUnread} nových)` : ''}
          <AeroIcon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <span role="status">{connected ? 'Pripojené naživo' : 'Pripájam…'}</span>
        <span>
          {mode === 'station' ? stationId || 'Vyberte stanicu' : `Rušňovodič: ${profile?.name}`}
        </span>
      </div>
      {expanded && (
        <div className="flex min-h-0 flex-col gap-2 overflow-auto p-2">
          <div className="flex flex-wrap items-center gap-2">
            {!connected && (
              <button
                type="button"
                className="aero-btn"
                onClick={() => {
                  clearDisToken();
                  setError('');
                  connection.current?.disconnect().connect();
                }}
              >
                <AeroIcon name="refresh" />
                Znova pripojiť
              </button>
            )}
            {canOperateStation && canDriveTrain && (
              <label>
                Komunikujem ako{' '}
                <select
                  aria-label="Komunikujem ako"
                  className="aero-select"
                  value={mode}
                  disabled={busy}
                  onChange={(event) => {
                    setMode(event.target.value as 'station' | 'driver');
                    seen.current.clear();
                    setMessages([]);
                    setContacts([]);
                    setUnread({});
                    chooseTarget('');
                    setConnected(false);
                  }}
                >
                  <option value="station" disabled={!stationId}>
                    Stanica {stationId}
                  </option>
                  <option value="driver">Rušňovodič {profile?.name}</option>
                </select>
              </label>
            )}
            <label>
              Príjemca{' '}
              <select
                className="aero-select"
                aria-label="Príjemca správy"
                value={target}
                disabled={busy}
                onChange={(event) => chooseTarget(event.target.value)}
              >
                <option value="">Vyberte stanicu alebo rušňovodiča</option>
                {(['station', 'driver'] as const).map((kind) => (
                  <optgroup key={kind} label={kind === 'station' ? 'Stanice' : 'Rušňovodiči'}>
                    {contacts
                      .filter((contact) => contact.kind === kind)
                      .map((contact) => {
                        const key = chatEndpointKey(contact);
                        return (
                          <option key={key} value={key}>
                            {contact.name}
                            {unread[key] ? ` (${unread[key]} nových)` : ''}
                          </option>
                        );
                      })}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {!endpointId && <p>Pre staničnú komunikáciu najprv vyberte stanicu.</p>}
          <div
            className="session-chat-log"
            ref={view}
            role="log"
            aria-live="polite"
            aria-label="Správy vo vybranom rozhovore"
            onScroll={() => {
              if (view.current)
                follow.current =
                  view.current.scrollHeight - view.current.scrollTop - view.current.clientHeight <
                  60;
            }}
          >
            {!recipient ? (
              <p>Vyberte príjemcu. Správy sú oddelené podľa relácie a rozhovoru.</p>
            ) : !conversation.length ? (
              <p>Zatiaľ žiadne správy. Napíšte prvú správu pre {recipient.name}.</p>
            ) : (
              conversation.map((message) => (
                <div key={message._id} className="session-chat-message">
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString('sk-SK', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>{' '}
                  <strong>{message.sender.name}</strong>
                  {message.sender.kind === 'station' && <span> ({message.senderName})</span>}:{' '}
                  <span className="whitespace-pre-wrap break-words">{message.content}</span>
                </div>
              ))
            )}
          </div>
          <form className="flex gap-2" onSubmit={send}>
            <input
              className="aero-input min-w-0 flex-1"
              aria-label="Text správy"
              placeholder="Napíšte správu…"
              required
              maxLength={1000}
              disabled={busy || !recipient}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                draftId.current = null;
              }}
            />
            <button
              className="aero-btn"
              disabled={busy || !connected || !recipient || !text.trim()}
            >
              <AeroIcon name="send" />
              {busy ? 'Odosielam…' : 'Odoslať'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
