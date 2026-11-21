import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { apiOrigin } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/client';
import Link from '@/lib/link';
import { useEffect, useState } from 'react';

type Release = { version: string; platforms: Record<string, { url: string }> };
export default function DownloadPage() {
  const t = useTranslation();
  const [release, setRelease] = useState<Release | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiOrigin}/releases/latest.json`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Release unavailable');
        setRelease(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="aero-tool min-h-screen bg-[var(--aero-bg)] p-4 text-xs text-[var(--aero-text)]">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[3px] border border-[var(--aero-window-border)] bg-[var(--aero-panel-bg)]">
        <header className="authoring-caption">
          <AeroIcon name="download" />
          <h1 className="font-semibold">{t('Stiahnuť aplikáciu')}</h1>
        </header>
        <div className="space-y-3 p-2.5">
          <p>{t('Desktopová aplikácia DIS pre Windows a Linux.')}</p>
          {release ? (
            <>
              <p>{`DIS ${release.version}`}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['windows-x86_64', 'Windows (64-bit)'],
                  ['linux-x86_64', 'Linux (AppImage)'],
                ].map(
                  ([target, label]) =>
                    release.platforms[target] && (
                      <a className="aero-btn" key={target} href={release.platforms[target].url}>
                        <AeroIcon name="download" />
                        {label}
                      </a>
                    ),
                )}
              </div>
            </>
          ) : (
            <p role="status">
              {t(failed ? 'Inštalátory zatiaľ nie sú dostupné. Skúste to neskôr.' : 'Načítavam…')}
            </p>
          )}
          <Link className="aero-btn" href="/dis">
            <AeroIcon name="back" />
            {t('Späť do DIS')}
          </Link>
        </div>
      </section>
    </main>
  );
}
