'use client';
import type { RailwayLine } from '@/lib/dis/lines';
import { useTranslation } from '@/lib/i18n/client';
import { LineEditor } from './LineEditor';
import { TimetableGraph } from './TimetableGraph';

import { AeroAutocomplete } from '@/app/components/ui/AeroAutocomplete';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { ConflictReport, Timetable, TimetableInput } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';
import { TrainCategoryOptions } from './TrainCategoryOptions';

const newStop = () => ({ station: '', arrival: '', departure: '', track: '', dwell: 0 });
const newTimetable = (): TimetableInput => ({
  trainNumber: '',
  trainType: 'Os',
  maxSpeed: 120,
  trainLength: 250,
  stops: [newStop(), newStop()],
});
export function GvdEditorView({
  place,
  sessionId = '',
}: {
  sessionId?: string;
  place: { placeId: string; name: string; stations: { stationId: string; name: string }[] };
}) {
  const t = useTranslation();
  const { canCreateGvd } = useDisAuth();
  const [sessionOnly, setSessionOnly] = useState(false);
  const [lineId, setLineId] = useState('');
  const { value: lineNetwork, refresh: refreshLines } = useDisResource<{ lines: RailwayLine[] }>(
    `/api/dis/lines?${new URLSearchParams({ placeId: place.placeId })}`,
    { lines: [] },
  );
  const {
    value,
    error: loadError,
    loading,
    refresh,
  } = useDisResource<{ timetables: Timetable[] }>(
    sessionOnly
      ? `/api/dis/session-timetables?${new URLSearchParams({ sessionId })}`
      : `/api/dis/timetables?placeId=${encodeURIComponent(place.placeId)}`,
    { timetables: [] },
  );
  const stations = place.stations;
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
    if (
      !place.placeId ||
      draft.stops.some((stop) => !stations.some((station) => station.stationId === stop.station))
    ) {
      setError('Vyberte platné stanice z konfigurácie zvoleného miesta.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const result = await disFetch<{ timetable?: Timetable; report: ConflictReport }>(
        sessionOnly
          ? '/api/dis/session-timetables'
          : save
            ? '/api/dis/timetables'
            : '/api/dis/timetables/check',
        {
          method: 'POST',
          body: JSON.stringify({
            placeId: place.placeId,
            ...(sessionOnly ? { sessionId, preview: !save } : {}),
            id: selectedId || undefined,
            timetable: draft,
          }),
        },
      );
      setReport(result.report);
      if (result.timetable) {
        setSelectedId(sessionOnly ? '' : result.timetable.$id);
        setDraft(sessionOnly ? newTimetable() : result.timetable);
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
    <div className="gvd-editor">
      <div className="gvd-toolbar">
        {sessionId && (
          <label>
            <input
              type="checkbox"
              checked={sessionOnly}
              onChange={(e) => {
                setSessionOnly(e.target.checked);
                setSelectedId('');
                setDraft(newTimetable());
                setReport(null);
                setMessage('');
              }}
            />{' '}
            {t('Mimoriadny vlak iba pre túto reláciu')}
          </label>
        )}
        <strong>
          <AeroIcon name="table" /> {t('Tvorba GVD a kontrola kolízií')}
        </strong>
        <label className="gvd-saved-train">
          <span>{t('Uložený grafikon')}</span>
          <select
            aria-label={t('Uložený grafikon')}
            className="aero-select"
            disabled={busy || loading || sessionOnly}
            value={selectedId}
            onChange={(event) => {
              const id = event.target.value;
              setSelectedId(id);
              setDraft(value.timetables.find((item) => item.$id === id) || newTimetable());
              setReport(null);
              setMessage('');
            }}
          >
            <option value="">{t('Nový grafikon')}</option>
            {value.timetables.map((item) => (
              <option key={item.$id} value={item.$id}>
                {item.trainType} {item.trainNumber}
              </option>
            ))}
          </select>
        </label>
        <div className="gvd-toolbar-actions">
          <button className="aero-btn" disabled={busy} onClick={() => submit(false)}>
            <AeroIcon name="warning" /> {t('Prepočítať kolízie')}{' '}
          </button>
          {canCreateGvd && (
            <button className="aero-btn" disabled={busy} onClick={() => submit(true)}>
              <AeroIcon name="save" />
              {busy ? t('Spracúvam...') : t('Uložiť vlak do GVD')}
            </button>
          )}
        </div>
      </div>
      <div className="gvd-workspace">
        <LineEditor placeId={place.placeId} stations={stations} onChange={refreshLines} />
        <details className="gvd-section" open>
          <summary>{t('Grafická tvorba cestovného poriadku')}</summary>
          <label>
            {t('Trať')}{' '}
            <select
              className="aero-select"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
            >
              <option value="">{t('Stanice vlaku')}</option>
              {lineNetwork.lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </label>
          <TimetableGraph
            trains={[
              ...value.timetables.filter((train) => train.$id !== selectedId),
              { ...draft, $id: selectedId || 'draft' },
            ]}
            stations={(
              lineNetwork.lines.find((line) => line.id === lineId)?.stations || [
                ...new Set(draft.stops.map((stop) => stop.station).filter(Boolean)),
              ]
            ).map((id) => ({
              stationId: id,
              name: stations.find((s) => s.stationId === id)?.name || id,
            }))}
            editableId={selectedId || 'draft'}
            onEdit={busy || !canCreateGvd ? undefined : (changed) => change(changed)}
            onSelect={
              sessionOnly
                ? undefined
                : (train) => {
                    if (train.$id === 'draft') return;
                    setSelectedId(train.$id);
                    setDraft(train);
                    setReport(null);
                  }
            }
          />
        </details>
        {(error || loadError) && (
          <p role="alert" className="text-red-700">
            {t(error) || t(loadError)}
          </p>
        )}
        {stations.length === 0 && (
          <p role="status">{t('Pre zvolené miesto nie sú uložené žiadne stanice.')}</p>
        )}
        {message && (
          <p role="status" className="text-emerald-700">
            {t(message)}
          </p>
        )}
        <fieldset disabled={!canCreateGvd || busy || loading} className="gvd-section">
          <legend>
            <AeroIcon name="train" /> {t('Údaje o vlaku')}
          </legend>
          <div className="gvd-train-fields">
            <label>
              {' '}
              {t('Číslo vlaku')}{' '}
              <input
                className="aero-input"
                maxLength={32}
                value={draft.trainNumber}
                onChange={(event) => change({ trainNumber: event.target.value })}
              />
            </label>
            <label>
              {' '}
              {t('Kategória')}{' '}
              <select
                className="aero-select"
                value={draft.trainType}
                onChange={(event) =>
                  change({ trainType: event.target.value as TimetableInput['trainType'] })
                }
              >
                <TrainCategoryOptions />
              </select>
            </label>
            <label>
              {' '}
              {t('Rýchlosť (km/h)')}{' '}
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
              {' '}
              {t('Dĺžka (m)')}{' '}
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
          <div className="gvd-working-fields">
            <label>
              {' '}
              {t('Nadväzujúci vlak')}{' '}
              <select
                className="aero-select"
                value={draft.nextTrainId || ''}
                onChange={(event) => change({ nextTrainId: event.target.value })}
              >
                <option value="">{t('Bez nadväzujúceho vlaku')}</option>
                {value.timetables
                  .filter((train) => train.$id !== selectedId)
                  .map((train) => (
                    <option key={train.$id} value={train.$id}>
                      {train.trainType} {train.trainNumber} · {train.stops[0].station} –{' '}
                      {train.stops.at(-1)?.station}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {' '}
              {t('Poznámky k vlaku')}{' '}
              <input
                className="aero-input w-full"
                maxLength={1000}
                value={draft.notes || ''}
                onChange={(event) => change({ notes: event.target.value })}
              />
            </label>
          </div>
        </fieldset>
        <fieldset disabled={!canCreateGvd || busy || loading} className="gvd-section">
          <legend>
            <AeroIcon name="table" /> {t('Cestovný poriadok')}
          </legend>
          <p className="gvd-help">
            {t('Vyberte stanicu podľa názvu. Časy po polnoci pokračujú nasledujúcim dňom.')}
          </p>
          <table className="aero-grid gvd-stops text-left">
            <thead>
              <tr>
                {[
                  'Stanica',
                  'Príchod',
                  'Odchod',
                  'Koľaj',
                  'km',
                  'Rýchlosť (km/h)',
                  'Poznámky',
                  '',
                ].map((heading, index) => (
                  <th key={index}>{t(heading)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.stops.map((stop, index) => (
                <tr key={index}>
                  {(
                    [
                      'station',
                      'arrival',
                      'departure',
                      'track',
                      'kilometer',
                      'speedLimit',
                      'notes',
                    ] as const
                  ).map((field) => (
                    <td key={field}>
                      {field === 'station' ? (
                        <StationPicker
                          value={stop.station}
                          stations={stations}
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
                          aria-label={`${t(field)} ${index + 1}`}
                          className="aero-input w-full"
                          type={
                            field === 'arrival' || field === 'departure'
                              ? 'time'
                              : field === 'kilometer' || field === 'speedLimit'
                                ? 'number'
                                : 'text'
                          }
                          min={field === 'speedLimit' ? 1 : field === 'kilometer' ? 0 : undefined}
                          max={
                            field === 'speedLimit'
                              ? 300
                              : field === 'kilometer'
                                ? 100000
                                : undefined
                          }
                          step={field === 'kilometer' ? 0.001 : undefined}
                          value={stop[field] ?? ''}
                          onChange={(event) =>
                            change({
                              stops: draft.stops.map((item, position) =>
                                position === index
                                  ? {
                                      ...item,
                                      [field]:
                                        field === 'kilometer' || field === 'speedLimit'
                                          ? event.target.value === ''
                                            ? undefined
                                            : Number(event.target.value)
                                          : event.target.value,
                                    }
                                  : item,
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
                      <AeroIcon name="delete" /> {t('Odstrániť')}{' '}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="aero-btn gvd-add-stop"
            onClick={() => change({ stops: [...draft.stops, newStop()] })}
          >
            <AeroIcon name="add" /> {t('Pridať zastavenie')}{' '}
          </button>
        </fieldset>
        {report && (
          <div
            role="status"
            className={`border p-3 ${report.conflicts.length ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}
          >
            <strong>
              {report.conflicts.length
                ? t('Kolízie na staničných koľajach: {0}', report.conflicts.length)
                : t('Bez časového prekrytia na rovnakej staničnej koľaji.')}
            </strong>
            <ul className="list-disc pl-5">
              {report.conflicts.map((conflict, index) => (
                <li key={index}>{t(conflict.message)}</li>
              ))}
              {report.warnings.map((warning, index) => (
                <li key={`warning-${index}`}>{t(warning.message)}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="gvd-help">
          {' '}
          {t(
            'Kontrola porovnáva uložené denné grafikony. Pri prejazde počíta s obsadením aspoň 1 minútu. Medzidobia, počet traťových koľají a dĺžky nástupíšť nie sú modelované; kontrola nenahrádza zabezpečovacie zariadenie.',
          )}{' '}
        </p>
      </div>
    </div>
  );
}

function StationPicker({
  value,
  stations,
  index,
  onChange,
}: {
  value: string;
  stations: { stationId: string; name: string }[];
  index: number;
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  return (
    <AeroAutocomplete
      label={t('Stanica {0}', index + 1)}
      placeholder={t('Vyhľadať stanicu…')}
      value={stations.find((station) => station.stationId === value)?.name || value}
      options={stations.map((station) => ({ value: station.stationId, label: station.name }))}
      onInput={() => onChange('')}
      onSelect={(option) => onChange(option.value)}
    />
  );
}
