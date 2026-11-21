'use client';
import { useTranslation } from '@/lib/i18n/client';
export function ChannelVolume({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useTranslation();
  return (
    <details className="relative">
      <summary className="aero-btn cursor-pointer">
        {t('Hlasitosť')} {Math.round(value * 100)} %
      </summary>
      <label className="absolute right-0 z-30 flex gap-2 rounded border border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-3 text-[var(--aero-text)] shadow">
        {t('Hlasitosť kanála')}
        <input
          aria-label={t('Hlasitosť kanála')}
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </details>
  );
}
