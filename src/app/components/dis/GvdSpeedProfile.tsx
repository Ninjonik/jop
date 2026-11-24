import type { RunningTimeResult } from '@/lib/dis/gvd-running-times';
import { useTranslation } from '@/lib/i18n/client';
export function GvdSpeedProfile({ result }: { result: RunningTimeResult }) {
  const t = useTranslation();
  const distance = result.samples.at(-1)?.distanceM || 1;
  const maximum = Math.max(10, ...result.samples.map((p) => p.speedKmh));
  return (
    <figure className="gvd-speed-profile">
      <figcaption>
        {t('Vypočítaný rýchlostný profil')} · {t('Vzdialenosť (km)')} {t('/ km/h')}
      </figcaption>
      <svg role="img" aria-label={t('Vypočítaný rýchlostný profil')} viewBox="0 0 800 170">
        <path d="M40 10 V140 H790" fill="none" stroke="var(--aero-text)" />
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <g key={r}>
            <line
              x1="40"
              x2="790"
              y1={140 - r * 125}
              y2={140 - r * 125}
              stroke="var(--aero-panel-border)"
            />
            <text x="3" y={143 - r * 125} fill="var(--aero-text)" fontSize="10">
              {Math.round(r * maximum)}
            </text>
            <text x={40 + r * 750} y="160" textAnchor="end" fill="var(--aero-text)" fontSize="10">
              {((r * distance) / 1000).toFixed(1)}
            </text>
          </g>
        ))}
        <polyline
          points={result.samples
            .map(
              (p) => `${40 + (p.distanceM / distance) * 750},${140 - (p.speedKmh / maximum) * 125}`,
            )
            .join(' ')}
          fill="none"
          stroke="var(--sig-blue)"
          strokeWidth="2"
        />
      </svg>
    </figure>
  );
}
