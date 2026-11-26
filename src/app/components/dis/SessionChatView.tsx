'use client';
import { ResizablePanel, useResizablePanel } from '@/app/components/ui/ResizablePanel';
import { apiOrigin } from '@/lib/api-client';
import { canPublishAnnouncements } from '@/lib/dis/permissions';
import { useTranslation } from '@/lib/i18n/client';
import { EmergencyAudio } from './EmergencyAudio';
import { RadioTerminalControls, useRadioTerminal } from './RadioTerminal';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { clearDisToken, disFetch, getDisToken } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import {
  chatConversationKey,
  chatEndpointKey,
  globalChatContact,
  mergeChatMessages,
  type ChatClientEvents,
  type ChatContact,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { EddReply } from '@/lib/dis/edd';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { VoiceCall } from './VoiceCall';

import { ChatMessageView, type DisplayMessage } from './ChatMessageView';
import { playMessageSound } from './message-sounds';

export function SessionChatView({
  sessionId,
  stationId,
  driverTrain,
  contactToOpen,
  onEddReply,
}: {
  sessionId: string;
  stationId: string;
  driverTrain?: DriverTrain | null;
  contactToOpen?: { stationId: string; request: number };
  onEddReply?: (reply: EddReply) => void;
}) {
  const t = useTranslation();
  const { profile, canOperateStation } = useDisAuth();
  const mode = canOperateStation && stationId ? 'station' : 'driver';
  const { collapsed: panelCollapsed, expand: expandPanel } = useResizablePanel();
  const expanded = !panelCollapsed;
  const [announcement, setAnnouncement] = useState<'' | 'info' | 'warning' | 'alarm'>('');
  const [connected, setConnected] = useState(false);
  const [voiceSocket, setVoiceSocket] = useState<Socket<ChatServerEvents, ChatClientEvents> | null>(
    null,
  );
  const terminal = useRadioTerminal(voiceSocket, connected);
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
  const current = useRef({ expanded: expanded && !panelCollapsed, target });
  const endpointId = mode === 'station' ? stationId : profile?.userId || '';
  const endpointKey = `${mode}:${endpointId}`;
  useEffect(() => {
    current.current = { expanded: expanded && !panelCollapsed, target };
  }, [expanded, panelCollapsed, target]);

  useEffect(() => {
    if (!endpointId || !profile) return;
    let active = true;
    const socket: Socket<ChatServerEvents, ChatClientEvents> = io(`${apiOrigin}/chat`, {
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
      const alreadySeen = seen.current.has(message._id);
      seen.current.add(message._id);
      if (message.clientMessageId) confirmed.current.add(message.clientMessageId);
      setMessages((previous) => mergeChatMessages(previous, [message]));
      if (alreadySeen) return;
      if (
        message.senderUserId !== profile.userId &&
        (chatEndpointKey(message.recipient) === endpointKey || message.recipient.kind === 'session')
      ) {
        const key =
          message.recipient.kind === 'session'
            ? chatEndpointKey(globalChatContact)
            : chatEndpointKey(message.sender);
        if (!current.current.expanded || current.current.target !== key) {
          setUnread((previous) => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
          playMessageSound('incoming');
        }
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
    const refreshAuth = setInterval(
      () => {
        clearDisToken();
        void getDisToken()
          .then((token) => {
            if (socket.connected) socket.emit('chat:refresh-auth', token);
          })
          .catch(() => socket.disconnect());
      },
      5 * 60 * 1000,
    );
    return () => {
      clearInterval(refreshAuth);
      active = false;
      socket.disconnect();
      connection.current = null;
    };
  }, [sessionId, mode, endpointId, endpointKey, profile]);

  const recipient =
    contacts.find((contact) => chatEndpointKey(contact) === target) ??
    tabs.find((contact) => chatEndpointKey(contact) === target);
  const conversation = messages.filter(
    (message) => chatConversationKey(message, { kind: mode, id: endpointId }) === target,
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
  const openedRequest = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!contactToOpen || mode !== 'station' || openedRequest.current === contactToOpen.request)
      return;
    let live = true;
    const contact = contacts.find(
      (item) => item.kind === 'station' && item.id === contactToOpen.stationId,
    );
    if (contact)
      void Promise.resolve().then(() => {
        if (!live) return;
        openedRequest.current = contactToOpen.request;
        openConversation(contact);
        expandPanel();
      });
    return () => {
      live = false;
    };
  }, [contactToOpen, contacts, mode, openConversation, expandPanel]);
  const receipts = useRef(new Set<string>());
  useEffect(() => {
    if (mode !== 'station' || !expanded) return;
    for (const item of conversation) {
      const message = item.edd;
      if (
        !message ||
        message.toStation !== stationId ||
        message.deliveredAt ||
        receipts.current.has(message.id)
      )
        continue;
      receipts.current.add(message.id);
      void disFetch('/api/dis/edd', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          stationId,
          command: 'receive',
          id: message.id,
        }),
      }).catch(() => receipts.current.delete(message.id));
    }
  }, [conversation, mode, expanded, sessionId, stationId]);
  async function acknowledge(id: string) {
    try {
      const result = await disFetch<{ message: NonNullable<ChatMessage['edd']> }>('/api/dis/edd', {
        method: 'POST',
        body: JSON.stringify({ sessionId, stationId, command: 'receive', id, acknowledge: true }),
      });
      setMessages((previous) =>
        previous.map((message) =>
          message.edd?.id === id ? { ...message, edd: result.message } : message,
        ),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Úkon zlyhal.');
    }
  }
  const onCallChange = useCallback(
    (contact: ChatContact | null, incoming?: boolean) => {
      setActiveCall(contact);
      if (contact && incoming) {
        expandPanel();
        openConversation(contact);
      }
    },
    [openConversation, expandPanel],
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
          announcement: message.announcement,
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
      senderRobloxUsername: profile.robloxUsername,
      senderRole: profile.role,
      ...(announcement && recipient.kind === 'session' ? { announcement } : {}),
      content: text.trim(),
      createdAt: new Date().toISOString(),
      delivery: 'sending',
    };
    follow.current = true;
    setMessages((previous) => mergeChatMessages(previous, [message]));
    setDrafts((previous) => ({ ...previous, [target]: '' }));
    playMessageSound('outgoing');
    void deliver(message);
  }

  return (
    <section className="session-chat" aria-label={t('Komunikácia medzi stanicami a rušňovodičmi')}>
      <div className="authoring-caption">
        <span>{totalUnread > 0 ? t(' ({0} nových)', totalUnread) : ''}</span>
        <span role="status">{connected ? t('Pripojené naživo') : t('Pripájam…')}</span>
        <span>
          {mode === 'station'
            ? stationId || t('Vyberte stanicu')
            : t('Rušňovodič: {0}', profile?.name)}
        </span>
        <RadioTerminalControls terminal={terminal} connected={connected} />
      </div>
      <EmergencyAudio
        socket={voiceSocket}
        enabled={terminal.isOwner}
        terminal={terminal.state}
        terminalRef={terminal.current}
      />
      {activeCall && (!expanded || chatEndpointKey(activeCall) !== target) && (
        <button
          type="button"
          className="aero-btn session-chat-active-call"
          onClick={() => {
            openConversation(activeCall);
          }}
        >
          <AeroIcon name="phone" /> {t('Hovor: {0}', activeCall.name)}
        </button>
      )}
      <div className="session-chat-workspace" hidden={!expanded}>
        <ResizablePanel id="chat-contacts" title={t('Kontakty')} edge="top" defaultSize={150}>
          <div className="session-chat-contacts !basis-auto !overflow-visible">
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
                          title={
                            contact.robloxUsername
                              ? t('Roblox: {0}', contact.robloxUsername)
                              : contact.name
                          }
                          onClick={() => openConversation(contact)}
                        >
                          <AeroIcon name={kind === 'station' ? 'network' : 'train'} />
                          <span>
                            {contact.name}
                            {contact.robloxUsername && (
                              <small className="chat-roblox-name">
                                {t('Roblox: {0}', contact.robloxUsername)}
                              </small>
                            )}
                          </span>
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
          </div>
        </ResizablePanel>
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
                    title={
                      currentContact.robloxUsername
                        ? t('Roblox: {0}', currentContact.robloxUsername)
                        : name
                    }
                    onClick={() => chooseTarget(key)}
                  >
                    <span>{name}</span>
                    {currentContact.robloxUsername && (
                      <small className="chat-roblox-name">
                        {t('Roblox: {0}', currentContact.robloxUsername)}
                      </small>
                    )}
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
              terminalRef={terminal.current}
              enabled={
                terminal.isOwner && !terminal.state.emergencies.some((call) => call.outgoing)
              }
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
                <ChatMessageView
                  key={message._id}
                  message={message}
                  onRetry={() => void deliver(message)}
                  stationId={mode === 'station' ? stationId : undefined}
                  onAcknowledge={(id) => void acknowledge(id)}
                  onEddReply={onEddReply}
                  offerAnswered={messages.some(
                    (reply) =>
                      reply.edd?.replyToId === message.edd?.id &&
                      ['accept', 'wait', 'cancel'].includes(reply.edd?.kind || ''),
                  )}
                />
              ))
            )}
          </div>
          <form className="flex gap-2 flex-wrap" onSubmit={send}>
            {profile && canPublishAnnouncements(profile.role) && recipient?.kind === 'session' && (
              <select
                aria-label={t('Druh oznamu')}
                className="aero-select"
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value as typeof announcement)}
              >
                <option value="">{t('Bežná správa')}</option>
                <option value="info">{t('Oznam')}</option>
                <option value="warning">{t('Upozornenie')}</option>
                <option value="alarm">{t('Poplach')}</option>
              </select>
            )}
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
