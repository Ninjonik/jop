'use client';
import { currentBratislavaTime } from '@/lib/dis/clock';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { RailwayLine } from '@/lib/dis/lines';
import type { EddRecord } from '@/lib/dis/records';
import type { Timetable } from '@/lib/dis/timetable';
import { clockMinutes } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useLeaseClock } from '@/lib/dis/use-lease-clock';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';
import { BookletTimetable } from './BookletTimetable';
import { TimetableGraph } from './TimetableGraph';

export function TpvFullView({
  sessionId,
  stationId,
  placeId,
}: {
  sessionId: string;
  stationId: string;
  placeId: string;
}) {
  const t = useTranslation();
  const leaseNow = useLeaseClock();
  const { value, error, loading } = useDisResource<{ timetables: Timetable[] }>(
    `/api/dis/session-timetables?${new URLSearchParams({ sessionId })}`,
    { timetables: [] },
  );
  const { value: journal, error: journalError } = useDisResource<{ records: EddRecord[] }>(
    `/api/dis/tpv?${new URLSearchParams({ sessionId })}`,
    { records: [] },
    5000,
  );
  const { value: network, error: lineError } = useDisResource<{ lines: RailwayLine[] }>(
    `/api/dis/lines?${new URLSearchParams({ placeId })}`,
    { lines: [] },
  );
  const { value: dashboard } = useDisResource<{ drivers: DriverTrain[] }>(
    `/api/dis/driver-train?${new URLSearchParams({ sessionId })}`,
    { drivers: [] },
  );
  const [lineId, setLineId] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const [showRoutes, setShowRoutes] = useState(true);
  const [selected, setSelected] = useState<Timetable | null>(null);
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = setInterval(() => setNow(clockMinutes(currentBratislavaTime())), 1000);
    return () => clearInterval(tick);
  }, []);
  const line = network.lines.find((l) => l.id === lineId);
  const allStations = line?.stations || [
    ...new Set(value.timetables.flatMap((train) => train.stops.map((s) => s.station))),
  ];
  const from = Math.max(0, allStations.indexOf(first));
  const to =
    last && allStations.includes(last) ? allStations.indexOf(last) : allStations.length - 1;
  const stationIds = allStations
    .slice(Math.min(from, to), Math.max(from, to) + 1)
    .filter((id) => !hidden.includes(id));
  const trains = value.timetables.filter((train) =>
    train.stops.some((s) => stationIds.includes(s.station)),
  );
  const reports = selected
    ? journal.records.filter((r) => r.trainNumber === selected.trainNumber)
    : [];
  const driver =
    selected &&
    dashboard.drivers.find((d) => d.timetableId === selected.$id && (d.expiresAt || 0) > leaseNow);
  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="ribbon-bar flex-wrap">
        <button
          className="aero-btn"
          aria-expanded={showRoutes}
          onClick={() => setShowRoutes(!showRoutes)}
        >
          <AeroIcon name="network" />
          {t('Výber trate a staníc')}
        </button>
        <strong>{line?.name || t('Celá sieť')}</strong>
      </div>
      {(error || journalError || lineError) && (
        <p role="alert" className="p-2">
          {t(error || journalError || lineError)}
        </p>
      )}
      {showRoutes && (
        <div className="tpv-route-selector">
          <div className="flex flex-wrap gap-2 items-center">
            <label>
              {t('Trať')}{' '}
              <select
                className="aero-select"
                value={lineId}
                onChange={(e) => {
                  setLineId(e.target.value);
                  setFirst('');
                  setLast('');
                  setHidden([]);
                }}
              >
                <option value="">{t('Celá sieť')}</option>
                {network.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            {(['first', 'last'] as const).map((field) => (
              <label key={field}>
                {t(field === 'first' ? 'Od stanice' : 'Po stanicu')}{' '}
                <select
                  className="aero-select"
                  value={field === 'first' ? first : last}
                  onChange={(e) =>
                    field === 'first' ? setFirst(e.target.value) : setLast(e.target.value)
                  }
                >
                  <option value="">
                    {t(field === 'first' ? 'Začiatok trate' : 'Koniec trate')}
                  </option>
                  {allStations.map((id) => (
                    <option key={id} value={id}>
                      {getStationDisplayName(id)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="tpv-schematic">
            {allStations.map((id, index) => (
              <label key={id} className="tpv-schematic-stop">
                <span aria-hidden="true">
                  {index ? '─' : ''}●{index < allStations.length - 1 ? '─' : ''}
                </span>
                <span>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(id)}
                    onChange={(e) =>
                      setHidden(e.target.checked ? hidden.filter((s) => s !== id) : [...hidden, id])
                    }
                  />
                  {getStationDisplayName(id)}
                </span>
              </label>
            ))}
          </div>
          {!network.lines.length && (
            <p>{t('Trate môžete vytvoriť v Tvorbe GVD. Zobrazené sú stanice uložených vlakov.')}</p>
          )}
        </div>
      )}
      {loading ? (
        <p className="p-3">{t('Načítavam grafikony...')}</p>
      ) : (
        <TimetableGraph
          trains={trains}
          stations={stationIds.map((id) => ({ stationId: id, name: getStationDisplayName(id) }))}
          records={journal.records}
          highlighted={stationId}
          currentMinute={now}
          onSelect={setSelected}
        />
      )}
      <Dialog.Root
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dis-dialog-overlay" />
          <Dialog.Content className="dis-train-dialog">
            <Dialog.Title className="authoring-caption">
              <AeroIcon name="train" />
              {selected?.trainType} {selected?.trainNumber}
              <Dialog.Close className="aero-btn ml-auto" aria-label={t('Zavrieť')}>
                <AeroIcon name="close" />
              </Dialog.Close>
            </Dialog.Title>
            <Dialog.Description className="p-2">
              {t('Údaje o vlaku, rušňovodič a skutočné hlásenia staníc.')}
            </Dialog.Description>
            {selected && (
              <div className="p-3 overflow-auto">
                <div className="ribbon-bar flex-wrap">
                  <span>
                    {t('Rušňovodič')}: {driver ? driver.userName : '—'}
                  </span>
                  <span>
                    {t('Dĺžka (m)')}: {driver?.length ?? selected.trainLength}
                  </span>
                  <span>
                    {t('Hmotnosť (t)')}: {driver?.tonnage ?? '—'}
                  </span>
                  <span>
                    {t('Rýchlosť (km/h)')}: {selected.maxSpeed}
                  </span>
                </div>
                <BookletTimetable timetable={selected} />
                <table className="aero-grid w-full mt-3">
                  <thead>
                    <tr>
                      {[
                        'Stanica',
                        'Plánovaný príchod',
                        'Skutočný príchod',
                        'Skutočný odchod',
                        'Meškanie (min)',
                      ].map((label) => (
                        <th key={label}>{t(label)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.$id}>
                        <td>{getStationDisplayName(r.stationId)}</td>
                        <td>{r.schedArrival}</td>
                        <td>{r.actualArrival || '—'}</td>
                        <td>{r.actualDeparture || '—'}</td>
                        <td>{r.delayMinutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!reports.length && <p>{t('Zatiaľ neboli zaznamenané hlásenia EDD.')}</p>}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
