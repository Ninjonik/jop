'use client';
import { ActionFeedback } from '@/app/components/ui/DispatcherFeedback';
import {
  audioCaptureSettings,
  setBrowserSettings,
  useBrowserSettings,
} from '@/lib/dis/browser-settings';
import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useRef, useState } from 'react';
import { VoiceLevelMeter } from './VoiceLevelMeter';

export function SettingsView() {
  const t = useTranslation();
  const settings = useBrowserSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [notice, setNotice] = useState('');
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const sound = useRef<HTMLAudioElement | null>(null);
  const refresh = async () => {
    try {
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setNotice(
        'Zvukové zariadenia nie sú dostupné. Použite HTTPS a skontrolujte povolenia prehliadača.',
      );
    }
  };
  useEffect(() => {
    queueMicrotask(() => void refresh());
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      // Invalidate any permission request that finishes after the panel closes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      stream.current?.getTracks().forEach((item) => item.stop());
      sound.current?.pause();
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);
  const stop = () => {
    generation.current++;
    stream.current?.getTracks().forEach((item) => item.stop());
    stream.current = null;
    setTrack(null);
  };
  const testMicrophone = async (meter: boolean) => {
    stop();
    const request = generation.current;
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: audioCaptureSettings() });
      if (generation.current !== request) {
        next.getTracks().forEach((item) => item.stop());
        return;
      }
      setNotice('Prístup k mikrofónu je povolený.');
      if (meter) {
        stream.current = next;
        setTrack(next.getAudioTracks()[0]);
      } else next.getTracks().forEach((item) => item.stop());
      await refresh();
    } catch {
      setNotice(
        'Mikrofón nie je dostupný. Povoľte prístup v prehliadači a skontrolujte vybrané zariadenie.',
      );
    }
  };
  return (
    <section className="m-3 space-y-4 overflow-auto p-3">
      <h2 className="text-sm font-bold">{t('Nastavenia')}</h2>
      <p>{t('Nastavenia sa ukladajú v tomto prehliadači.')}</p>
      <fieldset className="space-y-2 rounded border border-[var(--aero-panel-border)] p-3">
        <legend>{t('Zobrazenie a rádio')}</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.trainTooltips}
            onChange={(event) => setBrowserSettings({ trainTooltips: event.target.checked })}
          />
          {t('Čísla vlakov pri podržaní kurzora nad obsadenou koľajou')}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.radioSimulation}
            onChange={(event) => setBrowserSettings({ radioSimulation: event.target.checked })}
          />
          {t('Simulácia rádia – filter prijímaného hlasu')}
        </label>
      </fieldset>
      <fieldset className="space-y-3 rounded border border-[var(--aero-panel-border)] p-3">
        <legend>{t('Zvukové zariadenia')}</legend>
        <div className="space-y-2 border-b border-[var(--aero-panel-border)] pb-3">
          <strong>{t('Zvuky správ')}</strong>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.incomingMessageSounds}
              onChange={(event) => setBrowserSettings({ incomingMessageSounds: event.target.checked })}
            />
            {t('Zvuk prichádzajúcej správy mimo otvoreného rozhovoru')}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.outgoingMessageSounds}
              onChange={(event) => setBrowserSettings({ outgoingMessageSounds: event.target.checked })}
            />
            {t('Zvuk pri odoslaní správy')}
          </label>
          <label className="flex flex-wrap items-center gap-2">
            {t('Hlasitosť zvukov správ')}
            <input
              aria-label={t('Hlasitosť zvukov správ')}
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.messageVolume}
              onChange={(event) => setBrowserSettings({ messageVolume: Number(event.target.value) })}
            />
            {Math.round(settings.messageVolume * 100)} %
          </label>
        </div>
        {(['microphone', 'speaker'] as const).map((kind) => (
          <label key={kind} className="flex flex-wrap items-center gap-2">
            {t(kind === 'microphone' ? 'Mikrofón' : 'Reproduktory')}
            <select
              className="aero-select max-w-full"
              value={settings[kind]}
              onChange={(event) => {
                if (kind === 'microphone') stop();
                setBrowserSettings({ [kind]: event.target.value });
              }}
            >
              <option value="">{t('Predvolené zariadenie systému')}</option>
              {settings[kind] && !devices.some((device) => device.deviceId === settings[kind]) && (
                <option value={settings[kind]}>{t('Vybrané zariadenie nie je dostupné')}</option>
              )}
              {devices
                .filter(
                  (device) =>
                    device.kind === (kind === 'microphone' ? 'audioinput' : 'audiooutput') &&
                    device.deviceId,
                )
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `${t('Zariadenie')} ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <p>
          {t(
            'Názvy zariadení sa sprístupnia po povolení mikrofónu. Výber reproduktorov závisí od podpory prehliadača.',
          )}
        </p>
        <label className="flex flex-wrap items-center gap-2">
          {t('Celková hlasitosť hovorov')}{' '}
          <input
            aria-label={t('Celková hlasitosť hovorov')}
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={settings.volume}
            onChange={(event) => setBrowserSettings({ volume: Number(event.target.value) })}
          />
          {Math.round(settings.volume * 100)} %
        </label>
        {(['echoCancellation', 'noiseSuppression'] as const).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(event) => setBrowserSettings({ [key]: event.target.checked })}
            />
            {t(key === 'echoCancellation' ? 'Potlačenie ozveny' : 'Potlačenie šumu')}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-3 rounded border border-[var(--aero-panel-border)] p-3">
        <legend>{t('Test zvuku a povolení')}</legend>
        <div className="flex flex-wrap gap-2">
          <button className="aero-btn" onClick={() => void testMicrophone(false)}>
            {t('Overiť povolenie mikrofónu')}
          </button>
          <button className="aero-btn" onClick={() => (track ? stop() : void testMicrophone(true))}>
            {t(track ? 'Zastaviť test mikrofónu' : 'Test mikrofónu')}
          </button>
          <button
            className="aero-btn"
            onClick={() =>
              void (async () => {
                sound.current?.pause();
                const next = new Audio('/sounds/telephone-ring.ogg');
                sound.current = next;
                next.volume = Math.min(1, settings.volume);
                try {
                  if (settings.speaker) {
                    if (!('setSinkId' in next)) throw new Error();
                    await next.setSinkId(settings.speaker);
                  }
                  await next.play();
                  setNotice('Prehráva sa skúšobný zvuk.');
                } catch {
                  setNotice(
                    'Zvuk sa nepodarilo prehrať na vybranom zariadení. Skontrolujte podporu a povolenia prehliadača.',
                  );
                }
              })()
            }
          >
            {t('Test reproduktorov')}
          </button>
          <button
            className="aero-btn"
            onClick={() => {
              sound.current?.pause();
            }}
          >
            {t('Zastaviť zvuk')}
          </button>
        </div>
        <VoiceLevelMeter key={track?.id || 'test'} label={t('Mikrofón')} track={track} />
        <p>{t('Test mikrofónu sa neodosiela ostatným účastníkom. Po teste ho zastavte.')}</p>
        <ActionFeedback message={t(notice)} />
      </fieldset>
    </section>
  );
}
