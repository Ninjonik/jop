'use client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { type ChatClientEvents, type ChatContact, type ChatServerEvents } from '@/lib/dis/chat';
import { useTranslation } from '@/lib/i18n/client';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { playCallCue, startCallRing } from './voice-sounds';

type Call = { id: string; contact: ChatContact; incoming: boolean; phase: 'ringing' | 'connected' };
type ChatSocket = Socket<ChatServerEvents, ChatClientEvents>;

export function VoiceCall({
  socket,
  recipient,
  connected,
  mode,
}: {
  socket: ChatSocket | null;
  recipient?: ChatContact;
  connected: boolean;
  mode: 'station' | 'driver';
}) {
  const t = useTranslation();
  const [call, setCall] = useState<Call | null>(null);
  const [notice, setNotice] = useState('');
  const [muted, setMuted] = useState(false);
  const room = useRef<Room | null>(null);
  const callRef = useRef<Call | null>(null);
  const audio = useRef<HTMLDivElement>(null);
  const stopRinging = useRef<(() => void) | null>(null);
  const soundKind = useRef<'telephone' | 'radio'>('telephone');
  const stopSound = useCallback(() => {
    stopRinging.current?.();
    stopRinging.current = null;
  }, []);
  const stop = useCallback(() => {
    stopSound();
    void room.current?.disconnect();
    room.current = null;
    if (audio.current) audio.current.replaceChildren();
    callRef.current = null;
    setCall(null);
    setMuted(false);
  }, [stopSound]);
  useEffect(() => {
    if (!socket) return;
    const onRinging: ChatServerEvents['call:ringing'] = (next) => {
      if (callRef.current) return;
      const active = { ...next, phase: 'ringing' as const };
      callRef.current = active;
      setCall(active);
      setNotice('');
      soundKind.current =
        next.contact.kind === 'driver' || mode === 'driver' ? 'radio' : 'telephone';
      stopRinging.current = startCallRing(soundKind.current, next.incoming, () =>
        setNotice('Pre zvonenie povoľte prehrávanie zvuku v prehliadači.'),
      );
    };
    const onConnected: ChatServerEvents['call:connected'] = (credentials) => {
      if (callRef.current?.id !== credentials.id) return;
      stopSound();
      playCallCue(soundKind.current, 'pickup');
      const active = { ...callRef.current, phase: 'connected' as const };
      callRef.current = active;
      setCall(active);
      const voice = new Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
      });
      room.current = voice;
      voice.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audio.current?.appendChild(track.attach());
      });
      voice.on(RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((element) => element.remove()),
      );
      voice.on(RoomEvent.Disconnected, () => {
        if (room.current === voice) {
          socket.emit('call:end', credentials.id);
          stop();
          setNotice('Hlasové spojenie bolo prerušené.');
        }
      });
      void (async () => {
        try {
          await voice.connect(credentials.url, credentials.token);
          if (room.current !== voice) return;
          await voice.localParticipant.setMicrophoneEnabled(true);
        } catch {
          socket.emit('call:end', credentials.id);
          stop();
          setNotice(
            'Nepodarilo sa pripojiť hlas alebo mikrofón. Skontrolujte povolenia a skúste znova.',
          );
        }
      })();
    };
    const onEnded: ChatServerEvents['call:ended'] = ({ id, reason }) => {
      if (callRef.current?.id !== id) return;
      stop();
      playCallCue(soundKind.current, 'hangup');
      setNotice(reason);
    };
    const onDisconnect = () => {
      if (callRef.current) {
        stop();
        setNotice('Spojenie bolo prerušené.');
      }
    };
    const onError: ChatServerEvents['call:error'] = (message) => setNotice(message);
    socket.on('call:error', onError);
    socket.on('call:ringing', onRinging);
    socket.on('call:connected', onConnected);
    socket.on('call:ended', onEnded);
    socket.on('disconnect', onDisconnect);
    return () => {
      if (callRef.current) socket.emit('call:end', callRef.current.id);
      socket.off('call:error', onError);
      socket.off('call:ringing', onRinging);
      socket.off('call:connected', onConnected);
      socket.off('call:ended', onEnded);
      socket.off('disconnect', onDisconnect);
      stop();
    };
  }, [socket, mode, stop, stopSound]);
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1" aria-live="polite">
      <div ref={audio} />
      {!call && (
        <button
          type="button"
          className="aero-btn"
          disabled={!connected || !recipient || recipient.kind === 'session'}
          onClick={() => {
            if (recipient && recipient.kind !== 'session')
              socket?.emit('call:start', { kind: recipient.kind, id: recipient.id });
          }}
        >
          <AeroIcon name="network" /> {t('Zavolať')}
        </button>
      )}
      {call && (
        <>
          <span>
            {call.contact.kind === 'driver' || mode === 'driver' ? 'GSM-R' : 'Telefón'}:{' '}
            {call.contact.name} —{' '}
            {call.phase === 'connected'
              ? t('Hovor prebieha')
              : call.incoming
                ? t('Prichádzajúci hovor')
                : t('Vyzváňa')}
          </span>
          {call.incoming && call.phase === 'ringing' && (
            <button
              type="button"
              className="aero-btn"
              onClick={() => socket?.emit('call:accept', call.id)}
            >
              <AeroIcon name="confirm" /> {t('Prijať')}
            </button>
          )}
          {call.phase === 'connected' && (
            <button
              type="button"
              className="aero-btn"
              onClick={() => {
                const next = !muted;
                void room.current?.localParticipant
                  .setMicrophoneEnabled(!next)
                  .then(() => setMuted(next))
                  .catch(() => setNotice('Mikrofón sa nepodarilo zmeniť.'));
              }}
            >
              {muted ? t('Zapnúť mikrofón') : t('Stlmiť mikrofón')}
            </button>
          )}
          <button
            type="button"
            className="aero-btn"
            onClick={() => {
              socket?.emit('call:end', call.id);
              stop();
              playCallCue(soundKind.current, 'hangup');
            }}
          >
            <AeroIcon name="close" /> {t('Ukončiť')}
          </button>
        </>
      )}
      {notice && <span role="status">{t(notice)}</span>}
    </div>
  );
}
