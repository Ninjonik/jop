import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { audioPermissionRequired } from '@/lib/dis/audio-permissions';
import { audioCaptureSettings, getBrowserSettings } from '@/lib/dis/browser-settings';
import { useTranslation } from '@/lib/i18n/client';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';

const setupKey = 'dis-audio-setup';

/** Permission checks never open the microphone; only the explicit test does. */
export function AudioPermissions({ sessionId }: { sessionId: string }) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const sound = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let permission: PermissionStatus | undefined;
    let previous: PermissionState | undefined;
    const update = () => {
      if (!active || !permission) return;
      if (permission.state !== 'granted' && previous !== permission.state) {
        setNotice('');
        setOpen(true);
      }
      previous = permission.state;
    };
    const check = async () => {
      try {
        if (!localStorage.getItem(setupKey) && active) setOpen(true);
      } catch {
        if (active) setOpen(true);
      }
      try {
        if (!permission) {
          permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (!active) return;
          permission.addEventListener('change', update);
        }
        update();
      } catch {
        // Some webviews cannot query microphone permissions. Missing labels are
        // a reason to offer setup again, never evidence that access was granted.
        const devices = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
        if (active && !devices?.some((device) => device.kind === 'audioinput' && device.label))
          setOpen(true);
      }
    };
    void check();
    const showRequired = () => {
      setNotice(
        'Prístup k mikrofónu je zablokovaný. Povoľte ho podľa pokynov nižšie a skúste to znova.',
      );
      setOpen(true);
    };
    window.addEventListener(audioPermissionRequired, showRequired);
    window.addEventListener('focus', check);
    navigator.mediaDevices?.addEventListener('devicechange', check);
    return () => {
      active = false;
      mounted.current = false;
      permission?.removeEventListener('change', update);
      window.removeEventListener('focus', check);
      window.removeEventListener(audioPermissionRequired, showRequired);
      navigator.mediaDevices?.removeEventListener('devicechange', check);
      sound.current?.pause();
    };
  }, [sessionId]);

  const requestMicrophone = async () => {
    setBusy(true);
    setNotice('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setNotice(
          'Zvukové zariadenia nie sú dostupné. Použite HTTPS a skontrolujte povolenia prehliadača.',
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioCaptureSettings() });
      stream.getTracks().forEach((track) => track.stop());
      if (mounted.current) {
        setNotice('Prístup k mikrofónu je povolený.');
        try {
          localStorage.setItem(setupKey, '1');
        } catch {
          /* Storage may be disabled. */
        }
      }
    } catch (error) {
      if (!mounted.current) return;
      const name = error instanceof DOMException ? error.name : '';
      setNotice(
        name === 'NotFoundError'
          ? 'Mikrofón sa nenašiel. Pripojte ho a skúste to znova.'
          : name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Prístup k mikrofónu je zablokovaný. Povoľte ho podľa pokynov nižšie a skúste to znova.'
            : 'Mikrofón nie je dostupný. Skontrolujte vybrané zariadenie v Nastaveniach a či ho nepoužíva iná aplikácia.',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const testSpeakers = async () => {
    sound.current?.pause();
    const audio = new Audio('/sounds/telephone-ring.ogg');
    sound.current = audio;
    const settings = getBrowserSettings();
    audio.volume = Math.min(1, settings.volume);
    try {
      if (settings.speaker) {
        if (!('setSinkId' in audio)) throw new Error('Audio output selection is unavailable');
        await audio.setSinkId(settings.speaker);
      }
      await audio.play();
      if (!mounted.current || sound.current !== audio) audio.pause();
      if (mounted.current) setNotice('Prehráva sa skúšobný zvuk.');
    } catch {
      if (mounted.current)
        setNotice(
          'Zvuk sa nepodarilo prehrať. Skontrolujte hlasitosť a výstupné zariadenie v Nastaveniach.',
        );
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) sound.current?.pause();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dis-dialog-overlay" />
        <Dialog.Content className="dis-train-dialog !w-[min(520px,95vw)]">
          <Dialog.Title className="authoring-caption">
            <AeroIcon name="headset" />
            {t('Príprava zvuku pre reláciu')}
            <Dialog.Close className="aero-btn ml-auto" aria-label={t('Zavrieť')}>
              <AeroIcon name="close" />
            </Dialog.Close>
          </Dialog.Title>
          <div className="space-y-3 p-3">
            <Dialog.Description>
              {t(
                'Na hovory a rádio v relácii potrebujete mikrofón a slúchadlá alebo reproduktory. Povoľte mikrofón a overte, že počujete skúšobný zvuk.',
              )}
            </Dialog.Description>
            <div className="flex flex-wrap gap-2">
              <button className="aero-btn" disabled={busy} onClick={() => void requestMicrophone()}>
                <AeroIcon name="headset" />
                {t(busy ? 'Čakám na povolenie…' : 'Povoliť mikrofón')}
              </button>
              <button className="aero-btn" onClick={() => void testSpeakers()}>
                {t('Test reproduktorov')}
              </button>
              <button className="aero-btn" onClick={() => sound.current?.pause()}>
                {t('Zastaviť zvuk')}
              </button>
            </div>
            <p className="dialog-feedback" role="status">
              {t(notice)}
            </p>
            <p>
              {t(
                'Ak je mikrofón zablokovaný: v prehliadači otvorte povolenia tejto stránky a povoľte mikrofón. V nainštalovanej aplikácii skontrolujte aj systémové nastavenia súkromia mikrofónu a prístup pre desktopové aplikácie. Potom sa vráťte a kliknite na Povoliť mikrofón.',
              )}
            </p>
            <p>
              {t(
                'Slúchadlá samostatné povolenie zvyčajne nepotrebujú. Zariadenie a hlasitosť vyberiete v Nastaveniach DIS alebo v systéme. Počas overenia sa váš hlas neodosiela do relácie.',
              )}
            </p>
            <div className="flex justify-end">
              <Dialog.Close className="aero-btn">{t('Pokračovať')}</Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
