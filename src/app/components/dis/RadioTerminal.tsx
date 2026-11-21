'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import type { ChatClientEvents, ChatServerEvents } from '@/lib/dis/chat';
import { emptyRadioTerminal, type RadioTerminalState } from '@/lib/dis/radio';
import { useTranslation } from '@/lib/i18n/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type ChatSocket = Socket<ChatServerEvents, ChatClientEvents>;
export function useRadioTerminal(socket: ChatSocket | null, ready: boolean) {
  const [state, setState] = useState<RadioTerminalState>(emptyRadioTerminal);
  const [notice, setNotice] = useState('');
  const [claiming, setClaiming] = useState(false);
  const current = useRef(state);
  const autoEnabled = useRef(true);
  const autoAttemptedSocket = useRef<string | null>(null);
  useEffect(() => {
    if (!socket) return;
    const changed = (next: RadioTerminalState) => {
      current.current = next;
      setState(next);
      setClaiming(false);
      setNotice('');
    };
    const disconnected = () => {
      current.current = emptyRadioTerminal;
      setState(emptyRadioTerminal);
      setClaiming(false);
    };
    const heartbeat = () => {
      socket.emit('radio:heartbeat');
    };
    const failed = (message: string) => {
      setNotice(message);
      setClaiming(false);
    };
    socket.on('radio:terminal', changed);
    socket.on('radio:heartbeat-request', heartbeat);
    socket.on('disconnect', disconnected);
    socket.on('call:error', failed);
    if (socket.connected) socket.emit('radio:status');
    const expiration = setInterval(() => {
      if (current.current.expiresAt && current.current.expiresAt <= Date.now()) {
        current.current = emptyRadioTerminal;
        setState(emptyRadioTerminal);
      }
    }, 1000);
    return () => {
      clearInterval(expiration);
      socket.off('radio:terminal', changed);
      socket.off('radio:heartbeat-request', heartbeat);
      socket.off('disconnect', disconnected);
      socket.off('call:error', failed);
    };
  }, [socket]);
  useEffect(() => {
    if (!ready || !socket?.connected || !socket.id || !autoEnabled.current) return;
    if (autoAttemptedSocket.current === socket.id) return;
    autoAttemptedSocket.current = socket.id;
    // Claim once after the authenticated inbox is ready. Mongo arbitrates tabs;
    // status/heartbeat updates must never reclaim a deliberately released terminal.
    if (!current.current.ownerSocketId) socket.emit('radio:claim');
  }, [socket, ready]);
  const claim = useCallback(async () => {
    if (!socket?.connected || claiming) return;
    setClaiming(true);
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Mikrofón vyžaduje zabezpečené HTTPS pripojenie.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (socket.connected) {
        autoEnabled.current = true;
        socket.emit('radio:claim');
      } else throw new Error('Spojenie bolo prerušené.');
    } catch (error) {
      setClaiming(false);
      setNotice(error instanceof Error ? error.message : 'Povoľte mikrofón pre hlasový terminál.');
    }
  }, [socket, claiming]);
  return {
    state,
    current,
    notice,
    claiming,
    claim,
    isOwner: !!socket?.connected && state.ownerSocketId === socket.id,
    release: () => {
      autoEnabled.current = false;
      socket?.emit('radio:release');
    },
  };
}
export function RadioTerminalControls({
  terminal,
  connected,
}: {
  terminal: ReturnType<typeof useRadioTerminal>;
  connected: boolean;
}) {
  const t = useTranslation();
  const occupied = !!terminal.state.ownerSocketId;
  const unavailable = !connected || terminal.claiming || (occupied && !terminal.isOwner);
  const status = !connected
    ? t('Hlasový terminál je odpojený')
    : terminal.claiming
      ? t('Aktivujem terminál…')
      : terminal.isOwner
        ? t('Hlasový terminál aktívny v tejto karte')
        : occupied
          ? t('Hlasový terminál používa iná karta')
          : t('Hlasový terminál nie je aktívny');
  const action = terminal.isOwner
    ? t('Kliknutím uvoľníte terminál.')
    : occupied
      ? t('Počkajte na uvoľnenie terminálu alebo vypršanie spojenia.')
      : t('Kliknutím aktivujete terminál v tejto karte.');
  const indicator = terminal.notice
    ? 'error'
    : terminal.isOwner
      ? 'active'
      : occupied
        ? 'occupied'
        : 'inactive';
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="aero-btn session-chat-terminal"
            aria-label={status}
            aria-pressed={terminal.isOwner}
            aria-disabled={unavailable}
            onClick={() => {
              if (!unavailable) {
                if (terminal.isOwner) terminal.release();
                else void terminal.claim();
              }
            }}
          >
            <AeroIcon name="headset" />
            <span
              className="session-chat-terminal-indicator"
              data-state={indicator}
              aria-hidden="true"
            />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="session-chat-terminal-tooltip"
            side="top"
            align="end"
            sideOffset={6}
          >
            <strong>{status}</strong>
            <p>{action}</p>
            {!terminal.isOwner && terminal.state.call && (
              <p>
                {t('Hovor prebieha v inej karte')}: {terminal.state.call.contact.name}
              </p>
            )}
            {(terminal.notice || terminal.state.notice) && (
              <p>{t(terminal.notice || terminal.state.notice)}</p>
            )}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      <span className="sr-only" role="status">
        {status}
        {terminal.notice ? `: ${t(terminal.notice)}` : ''}
      </span>
    </Tooltip.Provider>
  );
}
