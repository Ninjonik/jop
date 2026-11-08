'use client';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';

export function NetworkPreparationView({
  onOpenTool,
}: {
  onOpenTool: (tool: 'map' | 'editor' | 'linker') => void;
}) {
  const t = useTranslation();
  return (
    <div className="flex-1 overflow-auto bg-[var(--aero-panel-bg)] p-4 text-xs">
      <section
        className="overflow-hidden rounded-[3px] border border-[var(--aero-panel-border)]"
        aria-labelledby="network-preparation-heading"
      >
        <h1
          id="network-preparation-heading"
          className="border-b border-[var(--grid-header-border)] bg-gradient-to-b from-[var(--grid-header-top)] to-[var(--grid-header-bottom)] px-3 py-2 font-semibold"
        >
          {' '}
          {t('Príprava siete a koľajísk')}{' '}
        </h1>
        <p className="border-b border-[var(--grid-row-border)] px-3 py-3 text-[var(--aero-text-muted)]">
          {' '}
          {t(
            'Vytvárajte a upravujte uložené siete a koľajiská. Príprava nevyžaduje spustenú ani vybranú reláciu.',
          )}{' '}
        </p>
        <div className="grid gap-2 border-b border-[var(--grid-row-border)] p-3 sm:grid-cols-[200px_1fr] sm:items-center">
          <button className="aero-btn justify-center" onClick={() => onOpenTool('map')}>
            <AeroIcon name="network" /> {t('Správca staníc')}{' '}
          </button>
          <p className="text-[var(--aero-text-muted)]">
            {' '}
            {t(
              'Otvorte uloženú sieť alebo vytvorte novú. Pridávajte stanice a prepájajte ich.',
            )}{' '}
          </p>
        </div>
        <div className="grid gap-2 border-b border-[var(--grid-row-border)] p-3 sm:grid-cols-[200px_1fr] sm:items-center">
          <button className="aero-btn justify-center" onClick={() => onOpenTool('editor')}>
            <AeroIcon name="edit" /> {t('Editor staníc')}{' '}
          </button>
          <p className="text-[var(--aero-text-muted)]">
            {' '}
            {t(
              'Vytvorte nové koľajisko alebo otvorte plán zo súboru. Uloženú stanicu môžete upraviť zo správcu staníc.',
            )}{' '}
          </p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-[200px_1fr] sm:items-center">
          <button className="aero-btn justify-center" onClick={() => onOpenTool('linker')}>
            <AeroIcon name="link" /> {t('Prepojenie s Roblox (Linker)')}{' '}
          </button>
          <p className="text-[var(--aero-text-muted)]">
            {' '}
            {t('Priraďte prvky koľajiska k objektom v Roblox.')}{' '}
          </p>
        </div>
      </section>
    </div>
  );
}
