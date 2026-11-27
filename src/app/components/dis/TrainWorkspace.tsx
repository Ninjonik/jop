'use client';
import type { SessionClockSnapshot } from '@/lib/dis/clock';
import { operatingClockParts } from '@/lib/dis/clock';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { EddEntry } from '@/lib/dis/edd';
import { pointKind } from '@/lib/dis/railway-network';
import type { Timetable } from '@/lib/dis/timetable';
import { clockMinutes, formatMinute } from '@/lib/dis/timetable';
import { lastReportedStop, trainProgress } from '@/lib/dis/train-progress';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useLeaseClock } from '@/lib/dis/use-lease-clock';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { GvdDialog } from './GvdDialog';
import './train-workspace.css';
export type TrafficSnapshot = {
  timetables: Timetable[];
  records: EddEntry[];
  drivers: DriverTrain[];
  clock?: SessionClockSnapshot;
};
const initial: TrafficSnapshot = { timetables: [], records: [], drivers: [] };
const Context = createContext<{
  value: TrafficSnapshot;
  minute?: number;
  date: string;
  openTrain: (number: string, train?: Timetable) => void;
  refresh: () => Promise<void>;
  error: string | null;
  available: boolean;
}>({
  value: initial,
  date: '',
  openTrain: () => {},
  refresh: async () => {},
  error: null,
  available: false,
});
export const useTrainWorkspace = () => useContext(Context);
export function TrainWorkspace({
  sessionId,
  active,
  children,
}: {
  sessionId: string;
  active: boolean;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<{ number: string; train?: Timetable }>({ number: '' });
  const number = selection.number;
  const openTrain = useCallback(
    (number: string, train?: Timetable) => setSelection({ number, train }),
    [],
  );
  const enabled = !!sessionId && (active || !!number);
  const { value, error, refresh } = useDisResource<TrafficSnapshot>(
    enabled ? '/api/dis/traffic?' + new URLSearchParams({ sessionId }) : null,
    initial,
    10000,
  );
  const now = useLeaseClock();
  const parts = operatingClockParts(value.clock?.offsetMinutes || 0, now);
  const current = value.clock?.sessionId === sessionId ? value : initial;
  const minute = current.clock ? clockMinutes(parts.minuteTime) : undefined;
  const context = useMemo(
    () => ({
      value: current,
      minute,
      date: parts.date,
      openTrain,
      refresh,
      error,
      available: !!sessionId,
    }),
    [current, minute, parts.date, refresh, error, sessionId, openTrain],
  );
  return (
    <Context.Provider value={context}>
      {children}
      {number && (
        <TrainOverview
          key={number}
          number={number}
          fallback={selection.train}
          onClose={() => setSelection({ number: '' })}
        />
      )}
    </Context.Provider>
  );
}
function TrainOverview({
  number,
  onClose,
  fallback,
}: {
  number: string;
  onClose: () => void;
  fallback?: Timetable;
}) {
  const t = useTranslation();
  const { value, minute, error } = useTrainWorkspace();
  const found = value.timetables.filter((train) => train.trainNumber === number);
  const matches = found.length ? found : fallback ? [fallback] : [];
  const [chosen, setChosen] = useState('');
  const train = matches.find((train) => train.$id === chosen) || matches[0];
  const progress = train ? trainProgress(train, value.records, minute) : [];
  const last = lastReportedStop(progress);
  const driver = value.drivers.find(
    (driver) =>
      driver.timetableId === train?.$id || (!driver.timetableId && driver.trainNumber === number),
  );
  return (
    <GvdDialog
      title={
        t('Vlak') +
        ' ' +
        (train?.trainType || '') +
        ' ' +
        number +
        (driver?.userName ? ' · ' + driver.userName : '')
      }
      onClose={onClose}
    >
      <div className="train-overview-body">
        {error && <p role="alert">{t(error)}</p>}
        {matches.length > 1 && (
          <label>
            {t('Cestovný poriadok')}
            <select
              className="aero-select"
              value={train?.$id}
              onChange={(e) => setChosen(e.target.value)}
            >
              {matches.map((train) => (
                <option key={train.$id} value={train.$id}>
                  {getStationDisplayName(train.stops[0]?.station || '')} →{' '}
                  {getStationDisplayName(train.stops.at(-1)?.station || '')}
                </option>
              ))}
            </select>
          </label>
        )}
        {!train ? (
          <p>{t('Pre tento vlak zatiaľ nie je dostupný cestovný poriadok.')}</p>
        ) : (
          <>
            <p className="train-overview-route">
              {getStationDisplayName(train.stops[0].station)} →{' '}
              {getStationDisplayName(train.stops.at(-1)!.station)}
            </p>
            {train.notes && <p className="train-overview-key">{train.notes}</p>}
            <dl className="train-overview-facts">
              <div>
                <dt>{t('Rušňovodič')}</dt>
                <dd>{driver?.userName || '—'}</dd>
              </div>
              <div>
                <dt>{t('Najvyššia rýchlosť')}</dt>
                <dd>{t('{0} km/h', train.maxSpeed)}</dd>
              </div>
              <div>
                <dt>{t('Hmotnosť (t)')}</dt>
                <dd>{driver?.tonnage ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('Posledný zápis výpravcu')}</dt>
                <dd>
                  {last
                    ? getStationDisplayName(last.station) +
                      ' · ' +
                      formatMinute(last.departureRecorded ? last.departure : last.arrival)
                    : t('Zatiaľ bez hlásenia')}
                </dd>
              </div>
            </dl>
            <p className="train-overview-key">
              {t('Zelená: zapísané výpravcom. Odhady nie sú potvrdenou polohou vlaku.')}
            </p>
            <table className="aero-grid train-overview-table">
              <thead>
                <tr>
                  {['Dopravňa', 'Príchod', 'Odchod', 'Koľaj', 'Meškanie / náskok'].map((label) => (
                    <th key={label}>{t(label)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progress.map((stop, i) => (
                  <tr key={i} className={last?.index === i ? 'train-last-report' : ''}>
                    <th
                      className={
                        ['Stanica', 'Odbočka', 'Výhybňa'].includes(
                          pointKind(getStationDisplayName(stop.station)),
                        )
                          ? 'train-point-major'
                          : 'train-point-minor'
                      }
                    >
                      {getStationDisplayName(stop.station)}
                      <small>
                        {t(
                          i === 0
                            ? 'Vychádzajúci'
                            : i === progress.length - 1
                              ? 'Končiaci'
                              : train.stops[i].kind === 'pass'
                                ? 'Prechádzajúci'
                                : 'Zastavujúci',
                        )}
                      </small>
                    </th>
                    {(['arrival', 'departure'] as const).map((event) => {
                      const excluded = event === 'arrival' ? i === 0 : i === progress.length - 1;
                      const recorded =
                        event === 'arrival' ? stop.arrivalRecorded : stop.departureRecorded;
                      const planned =
                        event === 'arrival' ? stop.plannedArrival : stop.plannedDeparture;
                      const actual = stop[event];
                      return (
                        <td
                          key={event}
                          className={recorded ? 'train-time-recorded' : 'train-time-estimated'}
                        >
                          {excluded ? (
                            '—'
                          ) : (
                            <>
                              <strong>{formatMinute(actual).slice(0, 5)}</strong>
                              <small>
                                {t(recorded ? 'Zapísané' : 'Odhad')} · {t('Plán')}:{' '}
                                {formatMinute(planned).slice(0, 5)}
                              </small>
                              {stop.dwell && event === 'departure' && <small>{t('Pobyt')}</small>}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td>{stop.record?.track || train.stops[i].track || '–'}</td>
                    <td>
                      {(['arrival', 'departure'] as const).map((event) => {
                        if (
                          (event === 'arrival' && i === 0) ||
                          (event === 'departure' && i === progress.length - 1)
                        )
                          return null;
                        const delta = Math.round(
                          stop[event] -
                            (event === 'arrival' ? stop.plannedArrival : stop.plannedDeparture),
                        );
                        return (
                          <small
                            key={event}
                            className={
                              'train-delay ' + (delta > 0 ? 'late' : delta < 0 ? 'early' : 'ontime')
                            }
                          >
                            <span>{t(event === 'arrival' ? 'Príchod' : 'Odchod')}</span>
                            <strong>
                              {delta ? (delta > 0 ? '+' : '') + delta + ' min' : t('Načas')}
                            </strong>
                          </small>
                        );
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </GvdDialog>
  );
}
