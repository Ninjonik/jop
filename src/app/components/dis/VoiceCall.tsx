'use client';
import { audioCaptureSettings } from '@/lib/dis/browser-settings';
import type { RadioNormalCall as Call, RadioTerminalState } from '@/lib/dis/radio';
import { voiceReconnectPolicy } from '@/lib/reconnect';
import { ChannelVolume } from './ChannelVolume';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { reportAudioPermissionError } from '@/lib/dis/audio-permissions';
import { type ChatClientEvents, type ChatContact, type ChatServerEvents } from '@/lib/dis/chat';
import { useTranslation } from '@/lib/i18n/client';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { attachRadioAudio } from './radio-audio';
import { playCallCue, startCallRing } from './voice-sounds';
import { VoiceLevelMeter } from './VoiceLevelMeter';

type ChatSocket = Socket<ChatServerEvents, ChatClientEvents>;

export function VoiceCall({
  socket,
  recipient,
  connected,
  enabled,
  terminalRef,
  mode,
  onCallChange,
}: {
  socket: ChatSocket | null;
  recipient?: ChatContact;
  connected: boolean;
  enabled: boolean;
  terminalRef: RefObject<RadioTerminalState>;
  mode: 'station' | 'driver';
  onCallChange: (contact: ChatContact | null, incoming?: boolean) => void;
}) {
  const t = useTranslation();
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [call, setCall] = useState<Call | null>(null);
  const [notice, setNotice] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [microphoneTrack, setMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const [incomingTrack, setIncomingTrack] = useState<MediaStreamTrack | null>(null);
  const room = useRef<Room | null>(null);
  const callRef = useRef<Call | null>(null);
  const audio = useRef<HTMLDivElement>(null);
  const radioTracks = useRef(new Map<RemoteTrack, () => void>());
  const stopRinging = useRef<(() => void) | null>(null);
  const soundKind = useRef<'telephone' | 'radio'>('telephone');
  const stopSound = useCallback(() => {
    stopRinging.current?.();
    stopRinging.current = null;
  }, []);
  const stop = useCallback(() => {
    stopSound();
    const previousRoom = room.current;
    room.current = null;
    void previousRoom?.disconnect();
    for (const cleanup of radioTracks.current.values()) cleanup();
    radioTracks.current.clear();
    if (audio.current) audio.current.replaceChildren();
    callRef.current = null;
    setCall(null);
    onCallChange(null);
    setMuted(false);
    setMicrophoneTrack(null);
    setIncomingTrack(null);
  }, [stopSound, onCallChange]);
  useEffect(() => {
    if (!socket) return;
    const onRinging: ChatServerEvents['call:ringing'] = (next) => {
      if (terminalRef.current.ownerSocketId !== socket.id || callRef.current) return;
      const active = { ...next, phase: 'ringing' as const };
      callRef.current = active;
      setCall(active);
      onCallChange(next.contact, next.incoming);
      setNotice('');
      soundKind.current =
        next.contact.kind === 'driver' || mode === 'driver' ? 'radio' : 'telephone';
      stopRinging.current = startCallRing(soundKind.current, next.incoming, () =>
        setNotice('Pre zvonenie povoľte prehrávanie zvuku v prehliadači.'),
      );
    };
    const onConnected: ChatServerEvents['call:connected'] = (credentials) => {
      if (terminalRef.current.ownerSocketId !== socket.id || callRef.current?.id !== credentials.id)
        return;
      stopSound();
      playCallCue(soundKind.current, 'pickup');
      const active = { ...callRef.current, phase: 'connected' as const };
      callRef.current = active;
      setCall(active);
      const voice = new Room({
        reconnectPolicy: voiceReconnectPolicy,
        audioCaptureDefaults: audioCaptureSettings(),
      });
      room.current = voice;
      voice.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!voice.canPlaybackAudio) setAudioBlocked(true);
      });
      voice.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio || !audio.current) return;
        setIncomingTrack(track.mediaStreamTrack);
        radioTracks.current.set(
          track,
          attachRadioAudio(track, audio.current, {
            radio: soundKind.current === 'radio',
            volume: () => volumeRef.current,
          }),
        );
      });
      voice.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio)
          setIncomingTrack((current) => (current === track.mediaStreamTrack ? null : current));
        const cleanup = radioTracks.current.get(track);
        if (cleanup) {
          cleanup();
          radioTracks.current.delete(track);
        } else {
          track.detach().forEach((element) => element.remove());
        }
      });
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
          if (room.current !== voice) {
            await voice.disconnect();
            return;
          }
          try {
            await voice.startAudio();
          } catch {
            setAudioBlocked(true);
          }
          const microphone = await voice.localParticipant.setMicrophoneEnabled(true);
          if (room.current === voice)
            setMicrophoneTrack(microphone?.track?.mediaStreamTrack ?? null);
          else await voice.disconnect();
        } catch (error) {
          reportAudioPermissionError(error);
          if (room.current !== voice) {
            await voice.disconnect();
            return;
          }
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
  }, [socket, terminalRef, mode, stop, stopSound, onCallChange]);
  useEffect(() => {
    // Revoking the lease must stop the external microphone immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) stop();
  }, [enabled, stop]);
  useEffect(() => {
    const update = () => {
      const voice = room.current;
      if (!voice) return;
      const settings = audioCaptureSettings();
      void voice
        .switchActiveDevice('audioinput', settings.deviceId || 'default')
        .then(() =>
          voice.localParticipant
            .getTrackPublication(Track.Source.Microphone)
            ?.track?.restartTrack(settings),
        )
        .catch(() => setNotice('Mikrofón sa nepodarilo zmeniť.'));
    };
    window.addEventListener('dis-input-settings', update);
    return () => window.removeEventListener('dis-input-settings', update);
  }, []);
  useEffect(() => {
    const container = audio.current;
    const failed = () =>
      setNotice('Výstup zvuku sa nepodarilo zmeniť. Skontrolujte vybrané reproduktory.');
    const playbackBlocked = () => setAudioBlocked(true);
    container?.addEventListener('audio-device-error', failed);
    container?.addEventListener('audio-playback-blocked', playbackBlocked);
    return () => {
      container?.removeEventListener('audio-device-error', failed);
      container?.removeEventListener('audio-playback-blocked', playbackBlocked);
    };
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 py-1" aria-live="polite">
      <div ref={audio} />
      {!call && (
        <button
          type="button"
          className="aero-btn"
          disabled={!enabled || !connected || !recipient || recipient.kind === 'session'}
          onClick={() => {
            if (recipient && recipient.kind !== 'session')
              socket?.emit('call:start', { kind: recipient.kind, id: recipient.id });
          }}
        >
          <AeroIcon name="call" /> {t('Zavolať')}
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
              <AeroIcon name="call" /> {t('Prijať')}
            </button>
          )}
          {call.phase === 'connected' && (
            <ChannelVolume
              value={volume}
              onChange={(value) => {
                volumeRef.current = value;
                setVolume(value);
                window.dispatchEvent(new Event('dis-audio-settings'));
              }}
            />
          )}
          {call.phase === 'connected' && (
            <div className="voice-levels" aria-live="off" aria-label={t('Úrovne zvuku')}>
              <VoiceLevelMeter
                key={microphoneTrack?.id ?? 'microphone'}
                label={t('Mikrofón')}
                track={microphoneTrack}
                muted={muted}
              />
              <VoiceLevelMeter
                key={incomingTrack?.id ?? 'incoming'}
                label={t('Druhý účastník')}
                track={incomingTrack}
              />
            </div>
          )}
          {call.phase === 'connected' && (
            <button
              type="button"
              className="aero-btn"
              onClick={() => {
                const next = !muted;
                void room.current?.localParticipant
                  .setMicrophoneEnabled(!next)
                  .then((microphone) => {
                    if (!next) setMicrophoneTrack(microphone?.track?.mediaStreamTrack ?? null);
                    setMuted(next);
                  })
                  .catch((error) => {
                    reportAudioPermissionError(error);
                    setNotice('Mikrofón sa nepodarilo zmeniť.');
                  });
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
            <AeroIcon name="hangup" /> {t('Ukončiť')}
          </button>
        </>
      )}
      {audioBlocked && (
        <button
          className="aero-btn"
          onClick={() => {
            void room.current
              ?.startAudio()
              .then(() => setAudioBlocked(false))
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
