'use client';
import type { StationClaim } from '@/lib/dis/claims';
import type { RailwayLine } from '@/lib/dis/lines';
import type { Timetable } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useLeaseClock } from '@/lib/dis/use-lease-clock';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';
export function StationSelectionView({
  placeId,
  sessionId,
  stations,
  claims,
  userId,
  canTakeOver,
  onSelect,
  error,
}: {
  placeId: string;
  sessionId: string;
  stations: { stationId: string; name: string }[];
  claims: StationClaim[];
  userId: string;
  canTakeOver: boolean;
  onSelect: (sessionId: string, stationId: string) => void;
  error: string;
}) {
  const t = useTranslation();
  const leaseNow = useLeaseClock();
  const [busy, setBusy] = useState('');
  const { value, error: lineError } = useDisResource<{ lines: RailwayLine[] }>(
    `/api/dis/lines?${new URLSearchParams({ placeId })}`,
    { lines: [] },
  );
  const { value: schedules } = useDisResource<{ timetables: Timetable[] }>(
    sessionId ? `/api/dis/session-timetables?${new URLSearchParams({ sessionId })}` : null,
    { timetables: [] },
  );
  const groups = [
    ...value.lines,
    {
      id: 'unassigned',
      name: t('Ostatné stanice'),
      stations: stations
        .filter((s) => !value.lines.some((l) => l.stations.includes(s.stationId)))
        .map((s) => s.stationId),
    },
  ];
  return (
    <div className="station-selection">
      <div className="authoring-caption">
        <AeroIcon name="network" />
        <strong>{t('Výber stanice')}</strong>
      </div>
      <p className="p-2">
        {t('Prevezmite voľnú stanicu. Ďalšie stanice môžete otvoriť do samostatných kariet.')}
      </p>
      {(error || lineError) && (
        <p role="alert" className="p-2">
          {t(error || lineError)}
        </p>
      )}
      {!sessionId && (
        <p role="status" className="p-2">
          {t('Momentálne nie je aktívny žiadny server Roblox.')}
        </p>
      )}
      {groups
        .filter((group) => group.stations.length)
        .map((group) => (
          <section key={group.id} className="station-line">
            <h2 className="sidebar-header">{group.name}</h2>
            <div className="station-line-stops">
              {group.stations.map((id) => {
                const station = stations.find((s) => s.stationId === id);
                const claim = claims.find((c) => c.stationId === id && c.expiresAt > leaseNow);
                const own = claim?.userId === userId;
                return station ? (
                  <button
                    key={id}
                    className="aero-btn station-choice"
                    disabled={!sessionId || !!busy || (!!claim && !own && !canTakeOver)}
                    onClick={async () => {
                      setBusy(id);
                      try {
                        await onSelect(sessionId, id);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    <AeroIcon name="network" size={32} />
                    <strong>{station.name}</strong>
                    <span>
                      {claim
                        ? `${own ? t('Ovládate') : canTakeOver ? t('Prevziať od') : t('Obsadená')}: ${claim.userName}`
                        : t('Voľná stanica')}
                    </span>
                    <span>
                      {t(
                        'Vlaky: {0}',
                        schedules.timetables.filter((train) =>
                          train.stops.some((s) => s.station === id),
                        ).length,
                      )}
                    </span>
                  </button>
                ) : null;
              })}
            </div>
          </section>
        ))}
      {!!sessionId && !stations.length && <p className="p-2">{t('Žiadne aktívne stanice.')}</p>}
    </div>
  );
}
