'use client';
import { getBrowserSettings, setBrowserSettings } from '@/lib/dis/browser-settings';
import { useUserPreference } from '@/lib/dis/use-user-preference';
import { useEffect, useRef, useState } from 'react';
export function AccountSettingsSync() {
  const [initial] = useState(() => {
    const c = getBrowserSettings();
    return {
      trainTooltips: c.trainTooltips,
      radioSimulation: c.radioSimulation,
      volume: c.volume,
      incomingMessageSounds: c.incomingMessageSounds,
      outgoingMessageSounds: c.outgoingMessageSounds,
      messageVolume: c.messageVolume,
      echoCancellation: c.echoCancellation,
      noiseSuppression: c.noiseSuppression,
    };
  });
  const [preferences, update] = useUserPreference('website-settings', initial);
  const applying = useRef(false);
  useEffect(() => {
    applying.current = true;
    setBrowserSettings(preferences);
    applying.current = false;
  }, [preferences]);
  useEffect(() => {
    const changed = () => {
      if (applying.current) return;
      const {
        trainTooltips,
        radioSimulation,
        volume,
        incomingMessageSounds,
        outgoingMessageSounds,
        messageVolume,
        echoCancellation,
        noiseSuppression,
      } = getBrowserSettings();
      update({
        trainTooltips,
        radioSimulation,
        volume,
        incomingMessageSounds,
        outgoingMessageSounds,
        messageVolume,
        echoCancellation,
        noiseSuppression,
      });
    };
    window.addEventListener('dis-audio-settings', changed);
    return () => window.removeEventListener('dis-audio-settings', changed);
  }, [update]);
  return null;
}
