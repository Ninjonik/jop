import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { apiOrigin } from '@/lib/api-client';
import { isTauri } from '@/lib/desktop';
import { useTranslation } from '@/lib/i18n/client';

export function DesktopDownloads() {
  const t = useTranslation();
  if (isTauri()) return null;
  return (
    <a
      className="aero-btn inline-flex h-6 w-6 items-center justify-center !p-0"
      href={`${apiOrigin}/download`}
      aria-label={t('Stiahnuť aplikáciu')}
      title={t('Stiahnuť aplikáciu')}
    >
      <AeroIcon name="download" />
    </a>
  );
}
