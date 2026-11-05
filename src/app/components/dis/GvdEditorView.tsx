'use client';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { JopStationSummary } from '@/lib/dis/jop-bridge';
import type { ConflictReport, Timetable, TimetableInput } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';

const newStop = () => ({ station: '', arrival: '', departure: '', track: '', dwell: 0 });
const newTimetable = (): TimetableInput => ({
  trainNumber: '',
  trainType: 'Os',
  maxSpeed: 120,
  trainLength: 250,
  stops: [newStop(), newStop()],
});
export function GvdEditorView() {
  const { canCreateGvd } = useDisAuth();
  const {
    value,
    error: loadError,
    loading,
    refresh,
  } = useDisResource<{ timetables: Timetable[] }>('/api/dis/timetables', { timetables: [] });
  const {
    value: network,
    loading: stationsLoading,
    error: stationsError,
  } = useDisResource<{ stations: JopStationSummary[] }>('/api/dis/jop-data?includeClosed=true', {
    stations: [],
  });
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<TimetableInput>(newTimetable);
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  function change(update: Partial<TimetableInput>) {
    setDraft((previous) => ({ ...previous, ...update }));
    setReport(null);
    setMessage('');
  }
  async function submit(save: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await disFetch<{ timetable?: Timetable; report: ConflictReport }>(
        save ? '/api/dis/timetables' : '/api/dis/timetables/check',
        { method: 'POST', body: JSON.stringify({ id: selectedId || undefined, timetable: draft }) },
      );
      setReport(result.report);
      if (result.timetable) {
        setSelectedId(result.timetable.$id);
        setDraft(result.timetable);
        await refresh();
        setMessage('Grafikon bol uložený.');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Grafikon sa nepodarilo spracovať.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-1 flex-col overflow-auto bg-white p-3 text-xs gap-3">
      <div className="flex gap-2 items-center">
        <strong>Tvorba GVD a kontrola kolízií</strong>
        <select
          aria-label="Uložený grafikon"
          className="aero-select"
          disabled={busy || loading}
          value={selectedId}
          onChange={(event) => {
            const id = event.target.value;
            setSelectedId(id);
            setDraft(value.timetables.find((item) => item.$id === id) || newTimetable());
            setReport(null);
            setMessage('');
          }}
        >
          <option value="">Nový grafikon</option>
          {value.timetables.map((item) => (
            <option key={item.$id} value={item.$id}>
              {item.trainNumber}
            </option>
          ))}
        </select>
        <button className="aero-btn" disabled={busy} onClick={() => submit(false)}>
          Prepočítať kolízie
        </button>
        {canCreateGvd && (
          <button className="aero-btn" disabled={busy} onClick={() => submit(true)}>
            {busy ? 'Spracúvam...' : 'Uložiť vlak do GVD'}
          </button>
        )}
      </div>
      {(error || loadError) && (
        <p role="alert" className="text-red-700">
          {error || loadError}
        </p>
      )}
      {stationsError && (
        <p role="alert" className="text-red-700">
          Stanice sa nepodarilo načítať: {stationsError}
        </p>
      )}
      {!stationsLoading && !stationsError && network.stations.length === 0 && (
        <p role="status">Nie sú dostupné žiadne stanice na výber.</p>
      )}
      {message && (
        <p role="status" className="text-emerald-700">
          {message}
        </p>
      )}
      <p>Vyberte stanicu podľa názvu. Časy po polnoci pokračujú nasledujúcim dňom.</p>
      <fieldset disabled={!canCreateGvd || busy || loading} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label>
            Číslo vlaku{' '}
            <input
              className="aero-input"
              maxLength={32}
              value={draft.trainNumber}
              onChange={(event) => change({ trainNumber: event.target.value })}
            />
          </label>
          <label>
            Kategória{' '}
            <select
              className="aero-select"
              value={draft.trainType}
              onChange={(event) =>
                change({ trainType: event.target.value as TimetableInput['trainType'] })
              }
            >
              {['R', 'Os', 'Pn', 'Mn'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Rýchlosť (km/h){' '}
            <input
              className="aero-input w-20"
              type="number"
              min={1}
              max={300}
              value={draft.maxSpeed}
              onChange={(event) => change({ maxSpeed: Number(event.target.value) })}
            />
          </label>
          <label>
            Dĺžka (m){' '}
            <input
              className="aero-input w-20"
              type="number"
              min={1}
              max={1000}
              value={draft.trainLength}
              onChange={(event) => change({ trainLength: Number(event.target.value) })}
            />
          </label>
        </div>
        <table className="aero-grid w-full text-left">
          <thead>
            <tr>
              {['Stanica', 'Príchod', 'Odchod', 'Koľaj', ''].map((heading, index) => (
                <th key={index}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.stops.map((stop, index) => (
              <tr key={index}>
                {(['station', 'arrival', 'departure', 'track'] as const).map((field) => (
                  <td key={field}>
                    {field === 'station' ? (
                      <StationPicker
                        value={stop.station}
                        stations={network.stations}
                        loading={stationsLoading}
                        index={index}
                        onChange={(station) =>
                          change({
                            stops: draft.stops.map((item, position) =>
                              position === index ? { ...item, station } : item,
                            ),
                          })
                        }
                      />
                    ) : (
                      <input
                        aria-label={`${field} ${index + 1}`}
                        className="aero-input w-full"
                        type={field === 'arrival' || field === 'departure' ? 'time' : 'text'}
                        value={stop[field]}
                        onChange={(event) =>
                          change({
                            stops: draft.stops.map((item, position) =>
                              position === index ? { ...item, [field]: event.target.value } : item,
                            ),
                          })
                        }
                      />
                    )}
                  </td>
                ))}
                <td>
                  <button
                    className="aero-btn"
                    disabled={draft.stops.length <= 2}
                    onClick={() =>
                      change({ stops: draft.stops.filter((_, position) => position !== index) })
                    }
                  >
                    Odstrániť
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="aero-btn" onClick={() => change({ stops: [...draft.stops, newStop()] })}>
          Pridať zastavenie
        </button>
      </fieldset>
      {report && (
        <div
          role="status"
          className={`border p-3 ${report.conflicts.length ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}
        >
          <strong>
            {report.conflicts.length
              ? `Kolízie na staničných koľajach: ${report.conflicts.length}`
              : 'Bez časového prekrytia na rovnakej staničnej koľaji.'}
          </strong>
          <ul className="list-disc pl-5">
            {report.conflicts.map((conflict, index) => (
              <li key={index}>{conflict.message}</li>
            ))}
            {report.warnings.map((warning, index) => (
              <li key={`warning-${index}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-slate-600">
        Kontrola porovnáva uložené denné grafikony. Pri prejazde počíta s obsadením aspoň 1 minútu.
        Počet traťových koľají, bezpečné medzidobia, dĺžky nástupíšť a vzdialenosti nie sú v modeli
        uvedené; kontrola nenahrádza zabezpečovacie zariadenie.
      </p>
    </div>
  );
}

function StationPicker({
  value,
  stations,
  loading,
  index,
  onChange,
}: {
  value: string;
  stations: JopStationSummary[];
  loading: boolean;
  index: number;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const choices = [...new Map(stations.map((station) => [station.stationId, station])).values()];
  const matches = choices.filter((station) =>
    `${station.name} ${station.stationId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="min-w-40 space-y-1">
      <input
        className="aero-input w-full"
        aria-label={`Hľadať stanicu ${index + 1}`}
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Vyhľadať stanicu..."
      />
      <select
        className="aero-select w-full"
        aria-label={`Stanica ${index + 1}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? 'Načítavam stanice...' : 'Vyberte stanicu'}</option>
        {value && !matches.some((station) => station.stationId === value) && (
          <option value={value}>
            {choices.find((station) => station.stationId === value)?.name || value}
          </option>
        )}
        {matches.map((station) => (
          <option key={station.stationId} value={station.stationId}>
            {station.name}
            {station.name !== station.stationId ? ` (${station.stationId})` : ''}
          </option>
        ))}
      </select>
      {search && !matches.length && <p>Žiadne zodpovedajúce stanice.</p>}
    </div>
  );
}
