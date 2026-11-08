'use client';
import { AeroAutocomplete } from '@/app/components/ui/AeroAutocomplete';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import { currentBratislavaTime } from '@/lib/dis/clock';
import type { EddRecord } from '@/lib/dis/records';
import type { Timetable } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useState } from 'react';
import { TrainCategoryOptions } from './TrainCategoryOptions';

const statusNames: Record<EddRecord['status'], string> = {
  scheduled: 'Plánovaný',
  approaching: 'Očakávaný',
  arrived: 'Na koľaji',
  departed: 'Odišiel',
  passed: 'Prešiel',
  cancelled: 'Zrušený',
};
export function EddTableView({
  sessionId,
  stationId,
  placeId,
  onSelectTrain,
}: {
  sessionId: string;
  stationId: string;
  placeId: string;
  onSelectTrain?: (train: string) => void;
}) {
  const { canOperateStation } = useDisAuth();
  const scope = { sessionId, stationId };
  const {
    value,
    error: loadError,
    loading,
    refresh,
  } = useDisResource<{ records: EddRecord[] }>(
    sessionId && stationId ? `/api/dis/edd?${new URLSearchParams(scope)}` : null,
    { records: [] },
  );
  const { value: schedules } = useDisResource<{ timetables: Timetable[] }>(
    `/api/dis/timetables?placeId=${encodeURIComponent(placeId)}`,
    {
      timetables: [],
    },
  );
  const [expectedOnly, setExpectedOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainNumber, setTrainNumber] = useState('');
  const [trainType, setTrainType] = useState('Os');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [track, setTrack] = useState('');
  const [recording, setRecording] = useState<{
    record: EddRecord;
    event: 'arrival' | 'departure';
  } | null>(null);
  const [actualTime, setActualTime] = useState('');

  async function command(payload: object) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await disFetch('/api/dis/edd', {
        method: 'POST',
        body: JSON.stringify({ ...scope, ...payload }),
      });
      await refresh();
      setCreating(false);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Úkon zlyhal.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  function openRecord(record: EddRecord, event: 'arrival' | 'departure') {
    setError(null);
    setActualTime(currentBratislavaTime());
    setRecording({ record, event });
  }
  if (!sessionId || !stationId)
    return <div className="p-4">Vyberte reláciu a stanicu v hornej lište.</div>;
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <strong>Elektronický dopravný denník — {getStationDisplayName(stationId)}</strong>
        <label>
          <input
            type="checkbox"
            checked={expectedOnly}
            onChange={(event) => setExpectedOnly(event.target.checked)}
          />{' '}
          Iba očakávané
        </label>
        <button className="aero-btn" onClick={refresh}>
          <AeroIcon name="refresh" />
          Obnoviť
        </button>
        <button className="aero-btn" onClick={() => window.print()}>
          <AeroIcon name="print" />
          Tlač denníka
        </button>
        {canOperateStation && (
          <>
            <button className="aero-btn" onClick={() => setCreating(!creating)}>
              <AeroIcon name="train" />
              Mimoriadny vlak
            </button>
            <span className="text-[var(--aero-text-muted)]">
              Vlaky z GVD sa načítavajú automaticky.
            </span>
          </>
        )}
      </div>
      {(error || loadError) && (
        <p role="alert" className="p-2 text-red-700">
          {error || loadError}
        </p>
      )}
      {creating && (
        <form
          className="flex flex-wrap gap-2 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void command({
              command: 'create',
              trainNumber,
              trainType,
              schedArrival: arrival,
              schedDeparture: departure,
              track,
            });
          }}
        >
          <AeroAutocomplete
            label="Číslo mimoriadneho vlaku"
            placeholder="Číslo vlaku…"
            value={trainNumber}
            options={schedules.timetables.map((item) => ({
              value: item.$id,
              label: item.trainNumber,
              description: item.trainType,
            }))}
            onInput={(value) => setTrainNumber(value.slice(0, 32))}
            onSelect={(option) => {
              const timetable = schedules.timetables.find((item) => item.$id === option.value);
              if (timetable) {
                setTrainNumber(timetable.trainNumber);
                setTrainType(timetable.trainType);
              }
            }}
          />
          <select
            aria-label="Kategória"
            className="aero-select"
            value={trainType}
            onChange={(event) => setTrainType(event.target.value)}
          >
            <TrainCategoryOptions />
          </select>
          <input
            aria-label="Plánovaný príchod"
            className="aero-input"
            type="time"
            required
            value={arrival}
            onChange={(event) => setArrival(event.target.value)}
          />
          <input
            aria-label="Plánovaný odchod"
            className="aero-input"
            type="time"
            required
            value={departure}
            onChange={(event) => setDeparture(event.target.value)}
          />
          <input
            aria-label="Koľaj"
            placeholder="Koľaj"
            className="aero-input"
            required
            maxLength={16}
            value={track}
            onChange={(event) => setTrack(event.target.value)}
          />
          <button className="aero-btn" disabled={busy}>
            <AeroIcon name="add" />
            Pridať vlak
          </button>
        </form>
      )}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <p>Načítavam denník...</p>
        ) : value.records.length === 0 ? (
          <p>V GVD nie sú vlaky pre túto stanicu. Môžete pridať mimoriadny vlak.</p>
        ) : (
          <table className="aero-grid w-full text-left">
            <thead>
              <tr>
                {[
                  'Vlak',
                  'Relácia',
                  'Plán. príchod',
                  'Skut. príchod',
                  'Plán. odchod',
                  'Skut. odchod',
                  'Koľaj',
                  'Meškanie',
                  'Stav',
                  'Úkony',
                ].map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.records
                .filter(
                  (record) => !expectedOnly || ['scheduled', 'approaching'].includes(record.status),
                )
                .map((record) => (
                  <tr
                    key={record.$id}
                    onClick={() => onSelectTrain?.(`${record.trainType} ${record.trainNumber}`)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="font-bold">
                      {record.trainType} {record.trainNumber}
                    </td>
                    <td>{record.direction}</td>
                    <td>{record.schedArrival}</td>
                    <td>{record.actualArrival || '—'}</td>
                    <td>{record.schedDeparture}</td>
                    <td>{record.actualDeparture || '—'}</td>
                    <td>{record.track}</td>
                    <td>{record.delayMinutes || 0} min</td>
                    <td>{statusNames[record.status]}</td>
                    <td>
                      {canOperateStation && (
                        <div className="flex flex-wrap gap-1">
                          <button
                            className="aero-btn"
                            disabled={busy || !['scheduled', 'approaching'].includes(record.status)}
                            onClick={(event) => {
                              event.stopPropagation();
                              openRecord(record, 'arrival');
                            }}
                          >
                            <AeroIcon name="down" />
                            Zápis príchodu
                          </button>
                          <button
                            className="aero-btn"
                            disabled={busy || record.status !== 'arrived'}
                            onClick={(event) => {
                              event.stopPropagation();
                              openRecord(record, 'departure');
                            }}
                          >
                            <AeroIcon name="up" />
                            Zápis odchodu
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      {recording && (
        <dialog
          ref={(dialog) => {
            if (dialog && !dialog.open) dialog.showModal();
          }}
          aria-labelledby="edd-record-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setRecording(null);
          }}
          className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-[3px] border border-[var(--aero-window-border)] bg-[var(--aero-panel-bg)] p-0 text-xs text-[var(--aero-text)] shadow-xl backdrop:bg-black/40"
        >
          <header className="authoring-caption">
            <h2 id="edd-record-title" className="font-semibold">
              {recording.event === 'arrival' ? 'Zápis príchodu' : 'Zápis odchodu'} ·{' '}
              {recording.record.trainType} {recording.record.trainNumber}
            </h2>
          </header>
          <form
            className="space-y-3 p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await command({
                  command: 'record',
                  id: recording.record.$id,
                  event: recording.event,
                  time: actualTime,
                })
              )
                setRecording(null);
            }}
          >
            <p>Stanica: {getStationDisplayName(stationId)}</p>
            <label className="flex items-center gap-2">
              {recording.event === 'arrival' ? 'Skutočný príchod' : 'Skutočný odchod'}{' '}
              <input
                aria-label="Čas zápisu"
                className="aero-input"
                type="time"
                required
                autoFocus
                value={actualTime}
                disabled={busy}
                onChange={(event) => setActualTime(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="aero-btn"
              disabled={busy}
              onClick={() => setActualTime(currentBratislavaTime())}
            >
              <AeroIcon name="refresh" />
              Aktuálny čas
            </button>
            {error && (
              <p role="alert" className="text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="aero-btn"
                disabled={busy}
                onClick={() => setRecording(null)}
              >
                <AeroIcon name="close" />
                Zrušiť
              </button>
              <button className="aero-btn" disabled={busy}>
                <AeroIcon name="save" />
                {busy ? 'Ukladám…' : 'Zapísať'}
              </button>
            </div>
          </form>
        </dialog>
      )}
      <p className="border-t p-2 text-slate-600">
        Odhlášku a návestidlá ovládajte na staničnom pulte. Zápis v EDD nemení zabezpečovacie
        zariadenie.
      </p>
    </div>
  );
}
