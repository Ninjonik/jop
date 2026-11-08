'use client';
import { useLocaleTag, useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { clearDisToken, disFetch, getDisToken } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import {
  chatEndpointKey,
  globalChatContact,
  mergeChatMessages,
  type ChatClientEvents,
  type ChatContact,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import type { DriverTrain } from '@/lib/dis/driver-train';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { VoiceCall } from './VoiceCall';

type DisplayMessage = ChatMessage & { delivery?: 'sending' | 'failed' };

export function SessionChatView({
  sessionId,
  stationId,
  driverTrain,
}: {
  sessionId: string;
  stationId: string;
  driverTrain?: DriverTrain | null;
}) {
  const t = useTranslation();
  const localeTag = useLocaleTag();
  const { profile, canOperateStation, canDriveTrain } = useDisAuth();
  const [mode, setMode] = useState<'station' | 'driver'>(
    canOperateStation && stationId ? 'station' : 'driver',
  );
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [voiceSocket, setVoiceSocket] = useState<Socket<ChatServerEvents, ChatClientEvents> | null>(
    null,
  );
  const [contacts, setContacts] = useState<ChatContact[]>([globalChatContact]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [target, setTarget] = useState(chatEndpointKey(globalChatContact));
  const [tabs, setTabs] = useState<ChatContact[]>([globalChatContact]);
  const [activeCall, setActiveCall] = useState<ChatContact | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = drafts[target] ?? '';
  const [error, setError] = useState('');
  const [selfName, setSelfName] = useState('');
  const seen = useRef(new Set<string>());
  const confirmed = useRef(new Set<string>());
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
      setVoiceSocket(socket);
      socket.emit('chat:subscribe', { sessionId, endpoint: { kind: mode, id: endpointId } });
    });
    socket.on('chat:snapshot', (snapshot) => {
      if (!active) return;
      setConnected(true);
      setError('');
      setContacts(snapshot.contacts);
      setSelfName(snapshot.self?.name || '');
      for (const message of snapshot.messages) {
        seen.current.add(message._id);
        if (message.clientMessageId) confirmed.current.add(message.clientMessageId);
      }
      setMessages((previous) => mergeChatMessages(previous, snapshot.messages));
    });
    socket.on('chat:message', (message) => {
      if (!active || message.sessionId !== sessionId) return;
      if (seen.current.has(message._id)) return;
      seen.current.add(message._id);
      if (message.clientMessageId) confirmed.current.add(message.clientMessageId);
      setMessages((previous) => mergeChatMessages(previous, [message]));
      if (
        message.senderUserId !== profile.userId &&
        (chatEndpointKey(message.recipient) === endpointKey || message.recipient.kind === 'session')
      ) {
        const key =
          message.recipient.kind === 'session'
            ? chatEndpointKey(globalChatContact)
            : chatEndpointKey(message.sender);
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

  const recipient =
    contacts.find((contact) => chatEndpointKey(contact) === target) ??
    tabs.find((contact) => chatEndpointKey(contact) === target);
  const conversation = messages.filter(
    (message) =>
      chatEndpointKey(message.sender) === target || chatEndpointKey(message.recipient) === target,
  );
  useEffect(() => {
    if (follow.current && view.current) view.current.scrollTop = view.current.scrollHeight;
  }, [messages, target, expanded]);
  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0);

  const chooseTarget = useCallback((value: string) => {
    setTarget(value);
    setUnread((previous) => ({ ...previous, [value]: 0 }));
    follow.current = true;
  }, []);
  const openConversation = useCallback(
    (contact: ChatContact) => {
      const key = chatEndpointKey(contact);
      setTabs((previous) =>
        previous.some((item) => chatEndpointKey(item) === key) ? previous : [...previous, contact],
      );
      chooseTarget(key);
    },
    [chooseTarget],
  );
  const onCallChange = useCallback(
    (contact: ChatContact | null, incoming?: boolean) => {
      setActiveCall(contact);
      if (contact && incoming) {
        openConversation(contact);
        setExpanded(true);
      }
    },
    [openConversation],
  );
  function closeTab(key: string) {
    const remaining = tabs.filter((tab) => chatEndpointKey(tab) !== key);
    setTabs(remaining);
    if (target === key)
      chooseTarget(chatEndpointKey(remaining[remaining.length - 1] ?? globalChatContact));
  }
  async function deliver(message: DisplayMessage) {
    setMessages((previous) =>
      previous.map((item) => (item._id === message._id ? { ...item, delivery: 'sending' } : item)),
    );
    try {
      const result = await disFetch<{ message: ChatMessage }>('/api/dis/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: message.sessionId,
          endpoint: { kind: message.sender.kind, id: message.sender.id },
          recipient: { kind: message.recipient.kind, id: message.recipient.id },
          content: message.content,
          messageId: message.clientMessageId,
        }),
      });
      setMessages((previous) => mergeChatMessages(previous, [result.message]));
    } catch (error) {
      if (message.clientMessageId && confirmed.current.has(message.clientMessageId)) return;
      setMessages((previous) =>
        previous.map((item) => (item._id === message._id ? { ...item, delivery: 'failed' } : item)),
      );
      setError(
        error instanceof Error
          ? error.message
          : 'Správa nebola odoslaná. Môžete ju skúsiť odoslať znova.',
      );
    }
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!recipient || !text.trim() || !profile) return;
    setError('');
    const clientMessageId = crypto.randomUUID();
    const message: DisplayMessage = {
      _id: `pending-${clientMessageId}`,
      clientMessageId,
      sessionId,
      sender: {
        kind: mode,
        id: endpointId,
        name:
          mode === 'station'
            ? getStationDisplayName(stationId)
            : driverTrain
              ? `${driverTrain.trainType} ${driverTrain.trainNumber}`
              : driverTrain === null
                ? profile.name
                : selfName || profile.name,
      },
      recipient,
      senderUserId: profile.userId,
      senderName: profile.name,
      content: text.trim(),
      createdAt: new Date().toISOString(),
      delivery: 'sending',
    };
    follow.current = true;
    setMessages((previous) => mergeChatMessages(previous, [message]));
    setDrafts((previous) => ({ ...previous, [target]: '' }));
    void deliver(message);
  }

  return (
    <section className="session-chat" aria-label={t('Komunikácia medzi stanicami a rušňovodičmi')}>
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
          <AeroIcon name="quote" /> {t('Komunikácia')}
          {totalUnread > 0 ? t(' ({0} nových)', totalUnread) : ''}
          <AeroIcon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <span role="status">{connected ? t('Pripojené naživo') : t('Pripájam…')}</span>
        <span>
          {mode === 'station'
            ? stationId || t('Vyberte stanicu')
            : t('Rušňovodič: {0}', profile?.name)}
        </span>
      </div>
      {activeCall && (!expanded || chatEndpointKey(activeCall) !== target) && (
        <button
          type="button"
          className="aero-btn session-chat-active-call"
          onClick={() => {
            openConversation(activeCall);
            setExpanded(true);
          }}
        >
          <AeroIcon name="network" /> {t('Hovor: {0}', activeCall.name)}
        </button>
      )}
      <div className="session-chat-workspace" hidden={!expanded}>
        <aside className="session-chat-contacts" aria-label={t('Kontakty')}>
          <div className="session-chat-contacts-title">{t('Kontakty')}</div>
          {(['station', 'driver'] as const).map((kind) => {
            const group = contacts.filter((contact) => contact.kind === kind);
            return (
              <div key={kind} className="session-chat-contact-group">
                <strong>{kind === 'station' ? t('Stanice') : t('Rušňovodiči')}</strong>
                {group.length ? (
                  group.map((contact) => {
                    const key = chatEndpointKey(contact);
                    return (
                      <button
                        key={key}
                        type="button"
                        className="session-chat-contact"
                        onClick={() => openConversation(contact)}
                      >
                        <AeroIcon name={kind === 'station' ? 'network' : 'train'} />
                        <span>{contact.name}</span>
                        {unread[key] ? <strong>{unread[key]}</strong> : null}
                      </button>
                    );
                  })
                ) : (
                  <span className="session-chat-empty">{t('Žiadne kontakty')}</span>
                )}
              </div>
            );
          })}
        </aside>
        <div className="session-chat-conversations">
          <div className="session-chat-toolbar">
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
                <AeroIcon name="refresh" /> {t('Znova pripojiť')}
              </button>
            )}
            {canOperateStation && canDriveTrain && (
              <label>
                {t('Komunikujem ako')}{' '}
                <select
                  aria-label={t('Komunikujem ako')}
                  className="aero-select"
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as 'station' | 'driver');
                    seen.current.clear();
                    setMessages([]);
                    setContacts([globalChatContact]);
                    setUnread({});
                    setTabs([globalChatContact]);
                    setDrafts({});
                    chooseTarget(chatEndpointKey(globalChatContact));
                    setConnected(false);
                  }}
                >
                  <option value="station" disabled={!stationId}>
                    {t('Stanica')} {stationId}
                  </option>
                  <option value="driver">
                    {t('Rušňovodič')} {profile?.name}
                  </option>
                </select>
              </label>
            )}
          </div>
          <div className="session-chat-tabs" role="group" aria-label={t('Rozhovory')}>
            {tabs.map((tab) => {
              const key = chatEndpointKey(tab);
              const currentContact =
                contacts.find((contact) => chatEndpointKey(contact) === key) ?? tab;
              const name =
                currentContact.kind === 'session' ? t('Celá relácia') : currentContact.name;
              return (
                <div
                  key={key}
                  className={`session-chat-tab ${key === target ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    aria-pressed={key === target}
                    onClick={() => chooseTarget(key)}
                  >
                    {name}
                    {unread[key] ? ` (${unread[key]})` : ''}
                    {activeCall && chatEndpointKey(activeCall) === key ? ' •' : ''}
                  </button>
                  {tab.kind !== 'session' && (
                    <button
                      type="button"
                      className="session-chat-tab-close"
                      aria-label={t('Zavrieť rozhovor {0}', name)}
                      title={t('Zavrieť rozhovor')}
                      onClick={() => closeTab(key)}
                    >
                      <AeroIcon name="close" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div
            className="session-chat-voice"
            hidden={!!activeCall && chatEndpointKey(activeCall) !== target}
          >
            <VoiceCall
              socket={voiceSocket}
              recipient={recipient}
              connected={connected}
              mode={mode}
              onCallChange={onCallChange}
            />
          </div>
          {error && (
            <p role="alert" className="text-red-700">
              {t(error)}
            </p>
          )}
          {!endpointId && <p>{t('Pre staničnú komunikáciu najprv vyberte stanicu.')}</p>}
          <div
            className="session-chat-log"
            ref={view}
            role="log"
            aria-live="polite"
            aria-label={t('Správy vo vybranom rozhovore')}
            onScroll={() => {
              if (view.current)
                follow.current =
                  view.current.scrollHeight - view.current.scrollTop - view.current.clientHeight <
                  60;
            }}
          >
            {!recipient ? (
              <p>{t('Vyberte príjemcu. Správy sú oddelené podľa relácie a rozhovoru.')}</p>
            ) : !conversation.length ? (
              <p>
                {t('Zatiaľ žiadne správy. Napíšte prvú správu pre')}{' '}
                {recipient.kind === 'session' ? t('Celá relácia') : recipient.name}.
              </p>
            ) : (
              conversation.map((message) => (
                <div key={message._id} className="session-chat-message">
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString(localeTag, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>{' '}
                  <strong>
                    {message.sender.kind === 'station'
                      ? getStationDisplayName(message.sender.id)
                      : message.sender.name}
                  </strong>
                  {(message.sender.kind === 'station' ||
                    message.sender.name !== message.senderName) && (
                    <span> ({message.senderName})</span>
                  )}
                  : <span className="whitespace-pre-wrap break-words">{message.content}</span>
                  {message.delivery === 'sending' && (
                    <span className="ml-2 text-[var(--aero-text-muted)]">{t('Odosielam…')}</span>
                  )}
                  {message.delivery === 'failed' && (
                    <button
                      type="button"
                      className="aero-btn ml-2"
                      onClick={() => void deliver(message)}
                    >
                      <AeroIcon name="refresh" /> {t('Odoslať znova')}{' '}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <form className="flex gap-2" onSubmit={send}>
            <input
              className="aero-input min-w-0 flex-1"
              aria-label={t('Text správy')}
              placeholder={t('Napíšte správu…')}
              required
              maxLength={1000}
              disabled={!recipient}
              value={text}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((previous) => ({ ...previous, [target]: value }));
              }}
            />
            <button className="aero-btn" disabled={!recipient || !text.trim() || !endpointId}>
              <AeroIcon name="send" /> {t('Odoslať')}{' '}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
