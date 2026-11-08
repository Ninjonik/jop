'use client';
import { useTranslation } from '@/lib/i18n/client';

import { AeroAutocomplete } from '@/app/components/ui/AeroAutocomplete';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { DriverDashboard, DriverTrain, DriverTrainInput } from '@/lib/dis/driver-train';
import type { Timetable } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { isPublicStation } from '@/lib/station/visibility';
import { useEffect, useState } from 'react';
import { TrainCategoryOptions } from './TrainCategoryOptions';

const emptyTrain = (sessionId: string): DriverTrainInput => ({
  sessionId,
  trainNumber: '',
  trainType: 'Os',
  timetableId: null,
  endStation: '',
  length: null,
  tonnage: null,
  wagons: null,
});

export function DriverDashboardView({
  sessionId,
  onTrainChange,
}: {
  sessionId: string;
  onTrainChange?: (train: DriverTrain | null) => void;
}) {
  const t = useTranslation();
  const { canDriveTrain } = useDisAuth();
  const {
    value,
    error: loadError,
    loading,
    refresh,
  } = useDisResource<DriverDashboard>(
    `/api/dis/driver-train?${new URLSearchParams({ sessionId })}`,
    { train: null, timetables: [], drivers: [], stations: [] },
  );
  const [saved, setSaved] = useState<DriverTrain | null | undefined>();
  const train = saved === undefined ? value.train : saved;
  useEffect(() => {
    if (!loading) onTrainChange?.(train);
  }, [train, loading, onTrainChange]);
  const [draft, setDraft] = useState<DriverTrainInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timetable = train?.timetableId
    ? value.timetables.find((item) => item.$id === train.timetableId)
    : undefined;
  const next = timetable?.nextTrainId
    ? value.timetables.find((item) => item.$id === timetable.nextTrainId)
    : undefined;

  function selectPreset(selected: Timetable) {
    setDraft((previous) => ({
      ...(previous || train || emptyTrain(sessionId)),
      trainNumber: selected.trainNumber,
      timetableId: selected.$id,
      trainType: previous?.trainType === 'Pos' ? 'Pos' : selected.trainType,
      endStation: selected.stops.at(-1)?.station || '',
      length: selected.trainLength,
    }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await disFetch<{ train: DriverTrain }>('/api/dis/driver-train', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      setSaved(result.train);
      setDraft(null);
      await refresh();
      setSaved(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Vlak sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError('');
    try {
      await disFetch(`/api/dis/driver-train?${new URLSearchParams({ sessionId })}`, {
        method: 'DELETE',
      });
      setSaved(null);
      setDraft(null);
      await refresh();
      setSaved(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Jazdu sa nepodarilo ukončiť.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-auto bg-[var(--aero-panel-bg)] p-3 text-xs">
      <div className="authoring-caption">
        <AeroIcon name="train" />
        <strong>{t('Rušňovodič – môj vlak')}</strong>
        {canDriveTrain && !draft && (
          <button
            className="aero-btn"
            disabled={busy || loading}
            onClick={() => setDraft(train || emptyTrain(sessionId))}
          >
            <AeroIcon name="edit" />
            {train ? t('Zmeniť vlak alebo údaje') : t('Vybrať vlak')}
          </button>
        )}
        {train && !draft && (
          <button className="aero-btn" disabled={busy} onClick={() => void finish()}>
            <AeroIcon name="confirm" /> {t('Ukončiť jazdu')}{' '}
          </button>
        )}
      </div>
      {(error || loadError) && (
        <p role="alert" className="text-red-700">
          {t(error) || t(loadError)}
        </p>
      )}
      {loading && <p>{t('Načítavam GVD…')}</p>}
      {draft && (
        <form onSubmit={save}>
          <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
            <label>
              {' '}
              {t('Číslo vlaku')}{' '}
              <AeroAutocomplete
                label={t('Číslo vlaku')}
                placeholder={t('Číslo z GVD alebo vlastné…')}
                value={draft.trainNumber}
                options={value.timetables.map((item) => ({
                  value: item.$id,
                  label: item.trainNumber,
                  description: `${item.trainType} · ${item.stops[0].station} – ${item.stops.at(-1)?.station}`,
                }))}
                onInput={(trainNumber) =>
                  setDraft({ ...draft, trainNumber: trainNumber.slice(0, 32), timetableId: null })
                }
                onSelect={(option) => {
                  const preset = value.timetables.find((item) => item.$id === option.value);
                  if (preset) selectPreset(preset);
                }}
              />
            </label>
            <label>
              {' '}
              {t('Kategória')}{' '}
              <select
                className="aero-select"
                value={draft.trainType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    trainType: event.target.value as DriverTrainInput['trainType'],
                  })
                }
              >
                <TrainCategoryOptions />
              </select>
            </label>
            <label>
              {' '}
              {t('Cieľová stanica')}{' '}
              <AeroAutocomplete
                label={t('Cieľová stanica')}
                value={draft.endStation}
                options={value.stations.map((station) => ({
                  value: station.stationId,
                  label: station.name,
                }))}
                onInput={(endStation) => setDraft({ ...draft, endStation })}
                onSelect={(option) => setDraft({ ...draft, endStation: option.value })}
              />
            </label>
            {(
              [
                ['length', 'Dĺžka (m)', 10000],
                ['tonnage', 'Hmotnosť (t)', 100000],
                ['wagons', 'Počet vozňov', 1000],
              ] as const
            ).map(([field, label, max]) => (
              <label key={field}>
                {t(label)}{' '}
                <input
                  className="aero-input w-24"
                  type="number"
                  min={field === 'length' ? 1 : 0}
                  max={max}
                  step={field === 'tonnage' ? '0.1' : '1'}
                  value={draft[field] ?? ''}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      [field]: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
            ))}
            <button className="aero-btn" disabled={!draft.trainNumber.trim()}>
              <AeroIcon name="save" /> {t('Prevziať vlak')}{' '}
            </button>
            <button type="button" className="aero-btn" onClick={() => setDraft(null)}>
              <AeroIcon name="close" /> {t('Zrušiť')}{' '}
            </button>
          </fieldset>
          <p className="mt-2 text-[var(--aero-text-muted)]">
            {draft.timetableId
              ? t('Vybraný vlak z GVD – cestovný poriadok sa zobrazí po prevzatí.')
              : t('Vlastné číslo – cestovný poriadok sa automaticky nenačíta.')}{' '}
            {t('Kategóriu možno zmeniť aj na Pos bez zmeny čísla vlaku.')}{' '}
          </p>
        </form>
      )}
      {train ? (
        <>
          <div>
            <strong className="text-base">
              {train.trainType} {train.trainNumber}
            </strong>
            <span className="ml-3">
              {' '}
              {t('Cieľ:')} {train.endStation || t('neuvedený')} {t('· Dĺžka:')}{' '}
              {train.length ?? '—'} {t('m · Hmotnosť:')} {train.tonnage ?? '—'} {t('t · Vozne:')}{' '}
              {train.wagons ?? '—'}
            </span>
          </div>
          {timetable ? (
            <section>
              <strong>
                {' '}
                {t('Cestovný poriadok ·')} {timetable.trainType} {timetable.trainNumber}
              </strong>
              {timetable.notes && <p>{timetable.notes}</p>}
              <table className="driver-timetable mt-2 w-full text-left">
                <thead>
                  <tr>
                    <th>{t('Stanica')}</th>
                    <th>{t('Príchod')}</th>
                    <th>{t('Odchod')}</th>
                    <th>{t('Koľaj')}</th>
                    <th>{t('Poznámky')}</th>
                  </tr>
                </thead>
                <tbody>
                  {timetable.stops
                    .filter((stop) => isPublicStation(stop.station))
                    .map((stop, index) => (
                      <tr key={index}>
                        <td>{stop.station}</td>
                        <td>{stop.arrival}</td>
                        <td>{stop.departure}</td>
                        <td>{stop.track || '—'}</td>
                        <td>{stop.notes || ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {next && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span>
                    {' '}
                    {t('Nadväzujúci vlak:')}{' '}
                    <strong>
                      {next.trainType} {next.trainNumber}
                    </strong>{' '}
                    · {next.stops[0].station} – {next.stops.at(-1)?.station} {t('· odchod')}{' '}
                    {next.stops[0].departure}
                  </span>
                  <button className="aero-btn" disabled={busy} onClick={() => selectPreset(next)}>
                    <AeroIcon name="right" /> {t('Pripraviť ďalší vlak')}{' '}
                  </button>
                </div>
              )}
            </section>
          ) : (
            <p>
              {train.timetableId
                ? t('Priradený grafikon už nie je dostupný.')
                : t('Vlak má vlastné číslo bez automatického cestovného poriadku.')}
            </p>
          )}
        </>
      ) : (
        !loading && (
          <p>{t('Zatiaľ nevediete žiadny vlak. Vyberte číslo z GVD alebo zadajte vlastné.')}</p>
        )
      )}
      {value.drivers.length > 0 && (
        <details>
          <summary>
            {t('Vlaky v relácii (')}
            {value.drivers.length})
          </summary>
          <table className="driver-timetable w-full text-left">
            <thead>
              <tr>
                <th>{t('Vlak')}</th>
                <th>{t('Rušňovodič')}</th>
                <th>{t('Cieľ')}</th>
                <th>{t('Dĺžka')}</th>
                <th>{t('Hmotnosť')}</th>
                <th>{t('Vozne')}</th>
              </tr>
            </thead>
            <tbody>
              {value.drivers.map((item) => (
                <tr key={item.userId}>
                  <td>
                    {item.trainType} {item.trainNumber}
                  </td>
                  <td>{item.userName}</td>
                  <td>{item.endStation}</td>
                  <td>{item.length ?? '—'} m</td>
                  <td>{item.tonnage ?? '—'} t</td>
                  <td>{item.wagons ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
