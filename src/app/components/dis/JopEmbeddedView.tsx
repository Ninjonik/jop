'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import EditorPage from '@/app/editor/page';
import LinkerPage from '@/app/linker/page';
import MapPage from '@/app/map/page';
import { useTranslation } from '@/lib/i18n/client';
import { ToolNavigationProvider } from '@/lib/navigation';
import { openToolWindow } from '@/lib/tool-window';

export function JopEmbeddedView({
  url,
  title,
  onClose,
  onNavigate,
}: {
  url: string;
  title: string;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  const t = useTranslation();
  const pathname = new URL(url, window.location.origin).pathname;
  const content =
    pathname === '/editor' ? <EditorPage /> : pathname === '/linker' ? <LinkerPage /> : <MapPage />;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[var(--aero-ribbon-bg)] p-2">
        <strong>{t(title)}</strong>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              void openToolWindow(url, t(title)).catch(() =>
                window.alert(t('Nepodarilo sa otvoriť nástroj.')),
              )
            }
            className="aero-btn"
          >
            <AeroIcon name="launch" /> {t('Samostatné okno')}
          </button>
          <button onClick={onClose} className="aero-btn">
            <AeroIcon name="close" /> {t('Zavrieť nástroj')}
          </button>
        </div>
      </div>
      <div className="aero-embedded-tool min-h-0 flex-1 overflow-auto">
        <ToolNavigationProvider url={url} onNavigate={onNavigate}>
          <div key={pathname}>{content}</div>
        </ToolNavigationProvider>
      </div>
    </div>
  );
}
