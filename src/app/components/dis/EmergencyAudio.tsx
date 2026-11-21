'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { audioCaptureSettings } from '@/lib/dis/browser-settings';
import type { ChatClientEvents, ChatServerEvents } from '@/lib/dis/chat';
import type { RadioTerminalState } from '@/lib/dis/radio';
import { useTranslation } from '@/lib/i18n/client';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { ChannelVolume } from './ChannelVolume';
import { attachRadioAudio } from './radio-audio';

type ChatSocket = Socket<ChatServerEvents, ChatClientEvents>;
type EmergencyRoom = { voice: Room; cleanups: Set<() => void>; outgoing: boolean };
export function EmergencyAudio({
  socket,
  enabled,
  terminal,
  terminalRef,
}: {
  socket: ChatSocket | null;
  enabled: boolean;
  terminal: RadioTerminalState;
  terminalRef: RefObject<RadioTerminalState>;
}) {
  const t = useTranslation();
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const volumeRef = useRef<Record<string, number>>({});
  const rooms = useRef(new Map<string, EmergencyRoom>());
  const audio = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const stop = useCallback((id: string) => {
    const room = rooms.current.get(id);
    if (!room) return;
    rooms.current.delete(id);
    for (const cleanup of room.cleanups) cleanup();
    void room.voice.disconnect();
  }, []);
  useEffect(() => {
    if (!socket) return;
    const activeRooms = rooms.current;
    const connected: ChatServerEvents['radio:emergency-connected'] = (credentials) => {
      if (terminalRef.current.ownerSocketId !== socket.id) return;
      stop(credentials.id);
      const voice = new Room({
        audioCaptureDefaults: audioCaptureSettings(),
      });
      const room: EmergencyRoom = { voice, cleanups: new Set(), outgoing: credentials.outgoing };
      rooms.current.set(credentials.id, room);
      voice.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio && audio.current)
          room.cleanups.add(
            attachRadioAudio(track, audio.current, {
              volume: () => volumeRef.current[credentials.id] ?? 1,
            }),
          );
      });
      voice.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!voice.canPlaybackAudio) setBlocked(true);
      });
      voice.on(RoomEvent.Disconnected, () => {
        if (rooms.current.get(credentials.id) !== room) return;
        stop(credentials.id);
        socket.emit('radio:emergency-failed', credentials.id);
        setNotice('Tiesňové hlasové spojenie bolo prerušené.');
      });
      void (async () => {
        try {
          await voice.connect(credentials.url, credentials.token);
          if (rooms.current.get(credentials.id) !== room) {
            await voice.disconnect();
            return;
          }
          // Listeners never request microphone access. LiveKit also rejects any
          // attempted publishing with their receive-only server-issued grants.
          if (credentials.outgoing) {
            await voice.localParticipant.setMicrophoneEnabled(true);
            if (rooms.current.get(credentials.id) !== room) {
              await voice.disconnect();
              return;
            }
          }
          try {
            await voice.startAudio();
          } catch {
            setBlocked(true);
          }
        } catch {
          if (rooms.current.get(credentials.id) !== room) return;
          stop(credentials.id);
          socket.emit('radio:emergency-failed', credentials.id);
          setNotice(
            'Tiesňové vysielanie sa nepodarilo pripojiť. Skontrolujte mikrofón a spojenie.',
          );
        }
      })();
    };
    const ended: ChatServerEvents['radio:emergency-ended'] = ({ id }) => stop(id);
    socket.on('radio:emergency-connected', connected);
    socket.on('radio:emergency-ended', ended);
    return () => {
      socket.off('radio:emergency-connected', connected);
      socket.off('radio:emergency-ended', ended);
      for (const id of [...activeRooms.keys()]) stop(id);
    };
  }, [socket, terminalRef, stop]);
  useEffect(() => {
    if (!enabled) for (const id of [...rooms.current.keys()]) stop(id);
  }, [enabled, stop]);
  useEffect(() => {
    const update = () => {
      for (const { voice, outgoing } of rooms.current.values()) {
        if (!outgoing) continue;
        const settings = audioCaptureSettings();
        void voice
          .switchActiveDevice('audioinput', settings.deviceId || 'default')
          .then(() =>
            voice.localParticipant
              .getTrackPublication(Track.Source.Microphone)
              ?.track?.restartTrack(settings),
          )
          .catch(() => setNotice('Mikrofón sa nepodarilo zmeniť.'));
      }
    };
    window.addEventListener('dis-input-settings', update);
    return () => window.removeEventListener('dis-input-settings', update);
  }, []);
  const outgoing = terminal.emergencies.find((call) => call.outgoing);
  useEffect(() => {
    const container = audio.current;
    const failed = () =>
      setNotice('Výstup zvuku sa nepodarilo zmeniť. Skontrolujte vybrané reproduktory.');
    container?.addEventListener('audio-device-error', failed);
    return () => container?.removeEventListener('audio-device-error', failed);
  }, []);
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-[var(--aero-panel-border)] px-2 py-1"
      aria-live="polite"
    >
      <div ref={audio} />
      {outgoing ? (
        <button
          className="aero-btn"
          disabled={!enabled}
          onClick={() => socket?.emit('radio:emergency-stop')}
        >
          <AeroIcon name="close" /> {t('Ukončiť tiesňové vysielanie')}
        </button>
      ) : (
        <>
          <button
            className="aero-btn"
            disabled={!enabled}
            onClick={() => socket?.emit('radio:emergency-start', 'session')}
          >
            <AeroIcon name="warning" /> {t('RADIOSTOP: celá relácia')}
          </button>
          <button
            className="aero-btn"
            disabled={!enabled}
            onClick={() => socket?.emit('radio:emergency-start', 'station')}
          >
            <AeroIcon name="warning" /> {t('RADIOSTOP: miestna oblasť')}
          </button>
        </>
      )}
      {terminal.emergencies.map((call) => (
        <div key={call.id} className="flex items-center gap-2 font-semibold">
          {call.outgoing ? t('Vysielate') : t('Príjem tiesňového vysielania')}: {call.origin.name} ·{' '}
          {call.scope === 'session' ? t('Celá relácia') : t('Stanica')}
          {!call.outgoing && (
            <ChannelVolume
              value={volumes[call.id] ?? 1}
              onChange={(value) => {
                volumeRef.current[call.id] = value;
                setVolumes({ ...volumeRef.current });
                window.dispatchEvent(new Event('dis-audio-settings'));
              }}
            />
          )}
        </div>
      ))}
      {blocked && (
        <button
          className="aero-btn"
          onClick={() => {
            void Promise.all([...rooms.current.values()].map(({ voice }) => voice.startAudio()))
              .then(() => setBlocked(false))
              .catch(() => setNotice('Povoľte prehrávanie zvuku v prehliadači.'));
          }}
        >
          {t('Povoliť zvuk')}
        </button>
      )}
      {notice && <span role="status">{t(notice)}</span>}
    </div>
  );
}
