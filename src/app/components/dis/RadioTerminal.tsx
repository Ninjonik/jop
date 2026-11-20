'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import type { ChatClientEvents, ChatServerEvents } from '@/lib/dis/chat';
import { emptyRadioTerminal, type RadioTerminalState } from '@/lib/dis/radio';
import { useTranslation } from '@/lib/i18n/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type ChatSocket = Socket<ChatServerEvents, ChatClientEvents>;
export function useRadioTerminal(socket: ChatSocket | null) {
  const [state, setState] = useState<RadioTerminalState>(emptyRadioTerminal);
  const [notice, setNotice] = useState('');
  const [claiming, setClaiming] = useState(false);
  const current = useRef(state);
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
      if (current.current.ownerSocketId === socket.id) socket.emit('radio:heartbeat');
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
  const claim = useCallback(async () => {
    if (!socket?.connected || claiming) return;
    setClaiming(true);
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Mikrofón vyžaduje zabezpečené HTTPS pripojenie.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (socket.connected) socket.emit('radio:claim');
      else throw new Error('Spojenie bolo prerušené.');
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
    release: () => socket?.emit('radio:release'),
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
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-panel-border)] px-2 py-1 text-[var(--aero-text)]"
      aria-live="polite"
    >
      <AeroIcon name="network" />
      <strong>
        {terminal.isOwner
          ? t('Hlasový terminál aktívny v tejto karte')
          : occupied
            ? t('Hlasový terminál používa iná karta')
            : t('Hlasový terminál nie je aktívny')}
      </strong>
      <button
        className="aero-btn"
        disabled={!connected || terminal.claiming || (occupied && !terminal.isOwner)}
        onClick={() => (terminal.isOwner ? terminal.release() : void terminal.claim())}
      >
        {terminal.isOwner
          ? t('Uvoľniť terminál')
          : terminal.claiming
            ? t('Aktivujem terminál…')
            : t('Aktivovať terminál v tejto karte')}
      </button>
      {!terminal.isOwner && terminal.state.call && (
        <span>
          {terminal.state.call.contact.name} · {t('Hovor prebieha v inej karte')}
        </span>
      )}
      {(terminal.notice || terminal.state.notice) && (
        <span role="status">{t(terminal.notice || terminal.state.notice)}</span>
      )}
    </div>
  );
}
