import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { isTauri } from '@/lib/desktop';
import { useTranslation } from '@/lib/i18n/client';
import type { Update } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';

export default function DesktopUpdates() {
  const t = useTranslation();
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    let offered: Update | null = null;
    const check = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (getCurrentWindow().label !== 'main') return;
        const { check } = await import('@tauri-apps/plugin-updater');
        const next = await check();
        if (!active) {
          await next?.close();
          return;
        }
        if (next) {
          await offered?.close();
          offered = next;
          setUpdate(next);
        }
      } catch {
        /* A release-server outage must not interrupt railway operation. */
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      void offered?.close();
    };
  }, []);
  if (!update) return null;
  async function install() {
    if (!update || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <aside
      role="status"
      className="fixed bottom-2 right-2 z-[100] flex max-w-[95vw] flex-wrap items-center gap-2 border border-[var(--aero-window-border)] bg-[var(--aero-panel-bg)] p-2 text-xs text-[var(--aero-text)] shadow-md"
    >
      <AeroIcon name="refresh" />
      <span>
        {t(failed ? 'Aktualizácia zlyhala. Skúste to znova.' : 'Dostupná aktualizácia aplikácie.')}{' '}
        {update.version}
      </span>
      <button className="aero-btn" disabled={busy} onClick={() => void install()}>
        {t(busy ? 'Inštalujem…' : 'Nainštalovať a reštartovať')}
      </button>
      <button className="aero-btn" disabled={busy} onClick={() => setUpdate(null)}>
        {t('Neskôr')}
      </button>
    </aside>
  );
}
