'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { reportAudioPermissionError } from '@/lib/dis/audio-permissions';
import { audioCaptureSettings } from '@/lib/dis/browser-settings';
import type { ChatClientEvents, ChatServerEvents } from '@/lib/dis/chat';
import type { RadioTerminalState } from '@/lib/dis/radio';
import { useTranslation } from '@/lib/i18n/client';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { ChannelVolume } from './ChannelVolume';
import { attachRadioAudio } from './radio-audio';
import { VoiceLevelMeter } from './VoiceLevelMeter';

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
  const [tracks, setTracks] = useState<Record<string, MediaStreamTrack>>({});
  const stop = useCallback((id: string) => {
    const room = rooms.current.get(id);
    if (!room) return;
    rooms.current.delete(id);
    setTracks((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
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
      setNotice('');
      voice.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio && audio.current) {
          setTracks((previous) => ({ ...previous, [credentials.id]: track.mediaStreamTrack }));
          room.cleanups.add(
            attachRadioAudio(track, audio.current, {
              volume: () => volumeRef.current[credentials.id] ?? 1,
            }),
          );
        }
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
            const publication = await voice.localParticipant.setMicrophoneEnabled(true);
            if (rooms.current.get(credentials.id) !== room) {
              await voice.disconnect();
              return;
            }
            const microphone = publication?.track?.mediaStreamTrack;
            if (!microphone || microphone.readyState !== 'live')
              throw new Error('No live microphone track');
            setTracks((previous) => ({ ...previous, [credentials.id]: microphone }));
          }
          try {
            await voice.startAudio();
          } catch {
            setBlocked(true);
          }
        } catch (error) {
          reportAudioPermissionError(error);
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
      for (const [id, { voice, outgoing }] of rooms.current) {
        if (!outgoing) continue;
        const settings = audioCaptureSettings();
        void voice
          .switchActiveDevice('audioinput', settings.deviceId || 'default')
          .then(() =>
            voice.localParticipant
              .getTrackPublication(Track.Source.Microphone)
              ?.track?.restartTrack(settings),
          )
          .then(() => {
            const track = voice.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
              ?.mediaStreamTrack;
            if (rooms.current.get(id)?.voice === voice && track)
              setTracks((previous) => ({ ...previous, [id]: track }));
          })
          .catch((error) => {
            reportAudioPermissionError(error);
            setNotice('Mikrofón sa nepodarilo zmeniť.');
          });
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
    const playbackBlocked = () => setBlocked(true);
    container?.addEventListener('audio-device-error', failed);
    container?.addEventListener('audio-playback-blocked', playbackBlocked);
    return () => {
      container?.removeEventListener('audio-device-error', failed);
      container?.removeEventListener('audio-playback-blocked', playbackBlocked);
    };
  }, []);
  return (
    <div
      className="radiostop-controls border-b border-[var(--aero-panel-border)] px-2 py-1"
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
        <div className="radiostop-actions">
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
        </div>
      )}
      {terminal.emergencies.map((call) => (
        <div key={call.id} className="flex flex-wrap items-center gap-2 font-semibold">
          {call.outgoing
            ? tracks[call.id]
              ? t('Vysielate')
              : t('Pripájam…')
            : t('Príjem tiesňového vysielania')}
          : {call.origin.name} · {call.scope === 'session' ? t('Celá relácia') : t('Stanica')}
          <VoiceLevelMeter
            key={tracks[call.id]?.id || call.id}
            label={t(call.outgoing ? 'Mikrofón' : 'Príjem')}
            track={tracks[call.id] ?? null}
          />
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
