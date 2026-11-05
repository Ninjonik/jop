'use client';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { EddRecord } from '@/lib/dis/records';
import type { Timetable } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';

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
  onSelectTrain,
}: {
  sessionId: string;
  stationId: string;
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
  const { value: schedules } = useDisResource<{ timetables: Timetable[] }>('/api/dis/timetables', {
    timetables: [],
  });
  const [timetableId, setTimetableId] = useState('');
  const [expectedOnly, setExpectedOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trainNumber, setTrainNumber] = useState('');
  const [trainType, setTrainType] = useState('Os');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [track, setTrack] = useState('');

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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Úkon zlyhal.');
    } finally {
      setBusy(false);
    }
  }
  if (!sessionId || !stationId)
    return <div className="p-4">Vyberte reláciu a stanicu v hornej lište.</div>;
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white text-xs">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <strong>Elektronický dopravný denník — {stationId}</strong>
        <label>
          <input
            type="checkbox"
            checked={expectedOnly}
            onChange={(event) => setExpectedOnly(event.target.checked)}
          />{' '}
          Iba očakávané
        </label>
        <button className="aero-btn" onClick={refresh}>
          Obnoviť
        </button>
        <button className="aero-btn" onClick={() => window.print()}>
          Tlač denníka
        </button>
        {canOperateStation && (
          <>
            <button className="aero-btn" onClick={() => setCreating(!creating)}>
              Mimoriadny vlak
            </button>
            <select
              aria-label="Grafikon na import"
              className="aero-select"
              value={timetableId}
              onChange={(event) => setTimetableId(event.target.value)}
            >
              <option value="">Vybrať vlak z GVD</option>
              {schedules.timetables.map((item) => (
                <option key={item.$id} value={item.$id}>
                  {item.trainNumber}
                </option>
              ))}
            </select>
            <button
              className="aero-btn"
              disabled={busy || !timetableId}
              onClick={() => command({ command: 'import', timetableId })}
            >
              Importovať z GVD
            </button>
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
          <input
            aria-label="Číslo mimoriadneho vlaku"
            placeholder="Číslo vlaku"
            className="aero-input"
            required
            maxLength={32}
            value={trainNumber}
            onChange={(event) => setTrainNumber(event.target.value)}
          />
          <select
            aria-label="Kategória"
            className="aero-select"
            value={trainType}
            onChange={(event) => setTrainType(event.target.value)}
          >
            {['R', 'Os', 'Pn', 'Mn'].map((type) => (
              <option key={type}>{type}</option>
            ))}
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
            Pridať vlak
          </button>
        </form>
      )}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <p>Načítavam denník...</p>
        ) : value.records.length === 0 ? (
          <p>Žiadne vlaky. Importujte GVD alebo pridajte mimoriadny vlak.</p>
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
                    onClick={() => onSelectTrain?.(record.trainNumber)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="font-bold">{record.trainNumber}</td>
                    <td>{record.direction}</td>
                    <td>{record.schedArrival}</td>
                    <td>{record.actualArrival || '—'}</td>
                    <td>{record.schedDeparture}</td>
                    <td>{record.actualDeparture || '—'}</td>
                    <td>{record.track}</td>
                    <td>{record.delayMinutes || 0} min</td>
                    <td>{statusNames[record.status]}</td>
                    <td>
                      {canOperateStation &&
                        ['scheduled', 'approaching', 'arrived'].includes(record.status) && (
                          <button
                            className="aero-btn"
                            disabled={busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void command({
                                command: 'record',
                                id: record.$id,
                                event: record.status === 'arrived' ? 'departure' : 'arrival',
                              });
                            }}
                          >
                            {record.status === 'arrived' ? 'Zápis odchodu' : 'Zápis príchodu'}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t p-2 text-slate-600">
        Odhlášku a návestidlá ovládajte na staničnom pulte. Zápis v EDD nemení zabezpečovacie
        zariadenie.
      </p>
    </div>
  );
}
