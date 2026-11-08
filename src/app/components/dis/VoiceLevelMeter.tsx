'use client';

import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useState } from 'react';

/** Measures the existing media track without opening another microphone or playing it locally. */
export function VoiceLevelMeter({
  label,
  track,
  muted = false,
}: {
  label: string;
  track: MediaStreamTrack | null;
  muted?: boolean;
}) {
  const t = useTranslation();
  const [level, setLevel] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!track || muted) return;
    let context: AudioContext | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = true;
    try {
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      const source = context.createMediaStreamSource(new MediaStream([track]));
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const audioContext = context;
      void audioContext
        .resume()
        .then(() => {
          if (!active) return;
          setUnavailable(audioContext.state !== 'running');
        })
        .catch(() => {
          if (active) setUnavailable(true);
        });
      timer = setInterval(() => {
        if (
          audioContext.state !== 'running' ||
          track.readyState !== 'live' ||
          !track.enabled ||
          track.muted
        ) {
          setLevel(0);
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        // Scale normal speech into a readable meter without implying a calibrated volume.
        setLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 350)));
      }, 120);
    } catch {
      queueMicrotask(() => {
        if (active) setUnavailable(true);
      });
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      if (context && context.state !== 'closed') void context.close();
    };
  }, [track, muted]);
  const displayed = muted || !track || unavailable ? 0 : level;
  const status = muted
    ? t('Stlmený')
    : !track
      ? t('Čakám na zvuk')
      : unavailable
        ? t('Merač nie je dostupný')
        : displayed > 3
          ? t('Zvuk')
          : t('Ticho');
  return (
    <div className="voice-level">
      <span>{label}</span>
      <span
        className="voice-level-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={displayed}
        aria-valuetext={status}
      >
        <span className="voice-level-fill" style={{ width: `${displayed}%` }} />
      </span>
      <span className="voice-level-status">{status}</span>
    </div>
  );
}
