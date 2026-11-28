'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import { operatingClockParts } from '@/lib/dis/clock';
import { eddClock, type EddEntry, type EddMessage, type EddMovement } from '@/lib/dis/edd';
import { trainCancellation, trainProgress } from '@/lib/dis/train-progress';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useSessionClock } from '@/lib/dis/use-session-clock';
import { useUserPreference } from '@/lib/dis/use-user-preference';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useRef, useState } from 'react';
import { EddTrainEntry } from './EddTrainEntry';
import { TrainCategoryOptions } from './TrainCategoryOptions';
import { useTrainWorkspace } from './TrainWorkspace';
import './edd.css';
import { playMessageSound } from './message-sounds';

export type EddProps = {
  sessionId: string;
  stationId: string;
  placeId: string;
  active?: boolean;
  onSelectTrain?: (train: string) => void;
  onSelectEntry?: (entry: EddEntry) => void;
};
export type EddSnapshot = {
  canWrite?: boolean;
  operator?: string | null;
  records: EddEntry[];
  messages: EddMessage[];
  contacts: { stationId: string; name: string; neighbour: boolean }[];
};
const statusNames = {
  scheduled: 'Plánovaný',
  approaching: 'Očakávaný',
  arrived: 'V stanici',
  departed: 'Odišiel',
  passed: 'Prešiel',
  cancelled: 'Zrušený',
};
const movementNames: Record<EddMovement, string> = {
  stop: 'Zastavujúci',
  origin: 'Vychádzajúci',
  terminus: 'Končiaci',
  pass: 'Prechádzajúci',
};
export function EddWorkstation({
  sessionId,
  stationId,
  active = true,
  onSelectTrain,
  onSelectEntry,
}: EddProps) {
  const traffic = useTrainWorkspace();
  const t = useTranslation();
  const { profile, canOperateStation } = useDisAuth();
  const ownName = getStationDisplayName(stationId);
  const { clock, now, error: clockError } = useSessionClock(sessionId);
  const current = operatingClockParts(clock?.offsetMinutes || 0, now);
  const scope = { sessionId, stationId };
  const {
    value,
    error: loadError,
    loading,
    refresh,
    applyConfirmed,
  } = useDisResource<EddSnapshot>(
    active && sessionId && stationId ? `/api/dis/edd?${new URLSearchParams(scope)}` : null,
    { records: [], messages: [], contacts: [] },
    5000,
  );
  const writable = canOperateStation && value.canWrite !== false;
  const [preferences, setPreferences, preferenceError] = useUserPreference<{
    filter: string;
  }>('edd-workstation', { filter: 'active' });
  const [search, setSearch] = useState(''),
    [selectedId, setSelectedId] = useState('');
  const [editRevision, setEditRevision] = useState(0);
  const selected = value.records.find((r) => r.$id === selectedId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const commandLock = useRef(false);
  const [creating, setCreating] = useState(false);
  const [manual, setManual] = useState({
    trainNumber: '',
    trainType: 'Os',
    schedArrival: '',
    schedDeparture: '',
    track: '',
  });
  const [details, setDetails] = useState({ track: '', notes: '', movement: 'stop' as EddMovement });
  const [reason, setReason] = useState('');
  function cancelledAt(record: EddEntry) {
    const train = traffic.value.timetables.find((t) =>
      record.timetableId ? t.$id === record.timetableId : t.trainNumber === record.trainNumber,
    );
    if (!train) return false;
    const cancellation = trainCancellation(train, traffic.value.records);
    if (!cancellation) return false;
    const cutoff = train.stops.findIndex((s) => s.station === cancellation.fromStation);
    return cutoff >= 0 && train.stops.findIndex((s) => s.station === record.stationId) >= cutoff;
  }
  async function command(payload: object) {
    if (commandLock.current) return false;
    commandLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await disFetch<{ record?: EddEntry }>('/api/dis/edd', {
        method: 'POST',
        body: JSON.stringify({ ...scope, ...payload }),
      });
      if (
        result.record?.$id === selectedId &&
        (payload as { expectedRevision?: number }).expectedRevision === editRevision
      )
        setEditRevision(result.record.revision);
      setNotice('Uložené.');
      if ((payload as { command?: string }).command === 'send') playMessageSound('outgoing');
      if (result.record) {
        const saved = result.record;
        traffic.applyRecord(saved);
        applyConfirmed((previous) => ({
          ...previous,
          records: previous.records.some((record) => record.$id === saved.$id)
            ? previous.records.map((record) => (record.$id === saved.$id ? saved : record))
            : [...previous.records, saved],
        }));
      }
      void traffic.refresh();
      void refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Úkon zlyhal.');
      return false;
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  }
  function choose(record: EddEntry) {
    setSelectedId(record.$id);
    setEditRevision(record.revision);
    setDetails({ track: record.track, notes: record.notes || '', movement: record.movement });
    onSelectEntry?.(record);
    setReason('');
    onSelectTrain?.(`${record.trainType} ${record.trainNumber}`);
  }
  const records = value.records.filter((record) => {
    const done =
      ['departed', 'passed', 'cancelled'].includes(record.status) ||
      (record.movement === 'terminus' && !!record.actualArrival);
    return (
      (preferences.filter === 'all' ||
        (preferences.filter === 'completed' ? done : record.status !== 'cancelled')) &&
      `${record.trainType} ${record.trainNumber} ${record.direction}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase())
    );
  });
  if (!sessionId || !stationId)
    return <p className="p-3">{t('Vyberte reláciu a stanicu v hornej lište.')}</p>;
  return (
    <section className="edd-workstation">
      <header className="edd-toolbar edd-caption">
        <strong>
          <AeroIcon name="table" /> {t('Elektronický dopravný denník —')} {ownName}
        </strong>
        <span className="edd-clock">
          {clock ? current.time : '—'} <small>{clock ? current.date : ''}</small>
        </span>
        <span>
          {t('Výpravca:')}{' '}
          {value.operator === undefined ? profile?.name || '—' : value.operator || t('Neobsadená')}
        </span>
        <button className="aero-btn" disabled={busy} onClick={refresh}>
          <AeroIcon name="refresh" /> {t('Obnoviť')}
        </button>
        <button className="aero-btn" onClick={() => window.print()}>
          <AeroIcon name="print" /> {t('Tlač denníka')}
        </button>
      </header>
      <div className="edd-toolbar">
        <input
          className="aero-input"
          aria-label={t('Vyhľadať vlak')}
          placeholder={t('Číslo vlaku…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="aero-select"
          aria-label={t('Zobrazenie denníka')}
          value={preferences.filter}
          onChange={(e) => setPreferences({ filter: e.target.value })}
        >
          <option value="active">{t('Aktuálne')}</option>
          <option value="all">{t('Všetky')}</option>
          <option value="completed">{t('Ukončené')}</option>
        </select>
        {writable && (
          <button className="aero-btn" onClick={() => setCreating(!creating)}>
            <AeroIcon name="add" /> {t('Mimoriadny vlak')}
          </button>
        )}
        <span className="edd-muted">{t('Vlaky z GVD sa načítavajú automaticky.')}</span>
      </div>
      {(error || loadError || clockError) && (
        <p className="edd-error" role="alert">
          {t(error || loadError || clockError)}
        </p>
      )}
      {notice && (
        <p className="edd-notice" role="status">
          {t(notice)}
        </p>
      )}
      {creating && (
        <form
          className="edd-toolbar"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await command({ command: 'create', ...manual })) setCreating(false);
          }}
        >
          <input
            className="aero-input"
            required
            aria-label={t('Číslo vlaku')}
            placeholder={t('Číslo vlaku')}
            maxLength={32}
            value={manual.trainNumber}
            onChange={(e) => setManual({ ...manual, trainNumber: e.target.value })}
          />
          <select
            className="aero-select"
            aria-label={t('Kategória')}
            value={manual.trainType}
            onChange={(e) => setManual({ ...manual, trainType: e.target.value })}
          >
            <TrainCategoryOptions />
          </select>
          <label>
            {t('Plánovaný príchod')}{' '}
            <input
              className="aero-input"
              type="time"
              step="60"
              value={manual.schedArrival}
              onChange={(e) => setManual({ ...manual, schedArrival: e.target.value })}
            />
          </label>
          <label>
            {t('Plánovaný odchod')}{' '}
            <input
              className="aero-input"
              type="time"
              step="60"
              value={manual.schedDeparture}
              onChange={(e) => setManual({ ...manual, schedDeparture: e.target.value })}
            />
          </label>
          <input
            className="aero-input edd-track"
            aria-label={t('Koľaj')}
            placeholder={t('Koľaj')}
            maxLength={16}
            value={manual.track}
            onChange={(e) => setManual({ ...manual, track: e.target.value })}
          />
          <button className="aero-btn" disabled={busy}>
            {t('Pridať vlak')}
          </button>
        </form>
      )}
      <div className="edd-body edd-body-single">
        <main className="edd-diary">
          <div className="edd-table-scroll">
            {loading && <p className="p-3">{t('Načítavam denník...')}</p>}
            {!loading && !records.length && (
              <p className="p-3">{t('Žiadne vlaky pre toto zobrazenie.')}</p>
            )}
            {!!records.length && (
              <table className="aero-grid edd-table">
                <thead>
                  <tr>
                    {['Vlak / smer', 'Koľaj', 'Stav', 'Príchod / odchod'].map((h) => (
                      <th key={h}>{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => (
                    <tr
                      key={record.$id}
                      className={`${index % 2 ? 'edd-pair-alt' : ''} ${selectedId === record.$id ? 'edd-selected' : ''} ${record.actualArrival || record.actualDeparture ? 'edd-recorded' : ''}`}
                    >
                      <td>
                        <button
                          className="edd-train"
                          onClick={() => {
                            traffic.openTrain(record.trainNumber);
                          }}
                        >
                          {record.trainType} {record.trainNumber}
                        </button>
                        <button
                          className="aero-btn edd-copy-train"
                          onClick={() => {
                            choose(record);
                            void navigator.clipboard
                              .writeText(record.trainNumber)
                              .catch(() =>
                                setError(
                                  'Číslo vlaku sa nepodarilo skopírovať. Označte ho a skopírujte ručne.',
                                ),
                              );
                          }}
                        >
                          {t('Kopírovať')}
                        </button>
                        <small>
                          {record.direction
                            .split('→')
                            .map((part) => getStationDisplayName(part.trim()))
                            .join(' → ')}
                        </small>
                        {record.nextTransportPoint && (
                          <small className="edd-onward">
                            {t('Ďalší dopravný bod')}:{' '}
                            <b>{getStationDisplayName(record.nextTransportPoint)}</b>
                          </small>
                        )}
                        {record.nextControlledArea && (
                          <small className="edd-onward">
                            {t('Ďalší riadený dopravný bod')}:{' '}
                            <b>{getStationDisplayName(record.nextControlledArea)}</b>
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="edd-track-label">{record.track?.trim() || '–'}</span>
                      </td>
                      <td>
                        <span
                          className={
                            'edd-status edd-status-' +
                            (cancelledAt(record) ? 'cancelled' : record.status)
                          }
                        >
                          {t(
                            cancelledAt(record)
                              ? 'Zrušený'
                              : record.dwell
                                ? 'Pobyt'
                                : statusNames[record.status],
                          )}
                        </span>
                        <small>
                          {t('Príchod')}: {eddClock(record.actualArrival)} · {t('Odchod')}:{' '}
                          {eddClock(record.actualDeparture)}
                        </small>
                      </td>
                      <td>
                        {writable && record.status !== 'cancelled' && !cancelledAt(record) ? (
                          <EddTrainEntry
                            key={record.$id + record.revision}
                            record={record}
                            forecast={(() => {
                              const train =
                                traffic.value.timetables.find(
                                  (train) => train.$id === record.timetableId,
                                ) ||
                                traffic.value.timetables.find(
                                  (train) => train.trainNumber === record.trainNumber,
                                );
                              return train
                                ? trainProgress(train, traffic.value.records, traffic.minute).find(
                                    (stop) =>
                                      stop.station.toLocaleLowerCase('sk') ===
                                      record.stationId.toLocaleLowerCase('sk'),
                                  )
                                : undefined;
                            })()}
                            date={current.date}
                            now={current.minuteTime}
                            busy={busy || !clock || !!clockError}
                            onCommand={command}
                          />
                        ) : (
                          <span>
                            {eddClock(record.actualArrival)} / {eddClock(record.actualDeparture)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {selected && (
            <section className="edd-detail">
              <div className="edd-toolbar">
                <strong>
                  {selected.trainType} {selected.trainNumber}
                </strong>
                <span>{t(movementNames[selected.movement])}</span>
                <button className="aero-btn" onClick={() => setSelectedId('')}>
                  {t('Zavrieť')}
                </button>
              </div>
              {writable && (
                <>
                  <form
                    className="edd-toolbar"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void command({
                        command: 'edit',
                        action: 'details',
                        id: selected.$id,
                        expectedRevision: editRevision,
                        ...details,
                      });
                    }}
                  >
                    <label>
                      {t('Koľaj')}{' '}
                      <input
                        className="aero-input edd-track"
                        maxLength={16}
                        value={details.track}
                        onChange={(e) => setDetails({ ...details, track: e.target.value })}
                      />
                    </label>
                    <select
                      className="aero-select"
                      aria-label={t('Druh pohybu')}
                      disabled={!!selected.actualArrival || !!selected.actualDeparture}
                      value={details.movement}
                      onChange={(e) =>
                        setDetails({ ...details, movement: e.target.value as EddMovement })
                      }
                    >
                      {Object.entries(movementNames).map(([key, label]) => (
                        <option key={key} value={key}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="aero-input edd-note-input"
                      aria-label={t('Poznámka')}
                      placeholder={t('Poznámka')}
                      maxLength={500}
                      value={details.notes}
                      onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                    />
                    <button className="aero-btn" disabled={busy}>
                      {t('Uložiť údaje')}
                    </button>
                  </form>
                  <div className="edd-toolbar">
                    <button
                      className="aero-btn"
                      onClick={() => traffic.openTrain(selected.trainNumber)}
                    >
                      {t('Zrušenie vlaku v relácii')}
                    </button>
                  </div>
                  {selected.status === 'cancelled' && (
                    <div className="edd-toolbar">
                      <input
                        className="aero-input edd-note-input"
                        aria-label={t('Dôvod opravy alebo zrušenia')}
                        placeholder={t('Dôvod opravy alebo zrušenia')}
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <button
                        className="aero-btn"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          void command({
                            command: 'edit',
                            action: selected.status === 'cancelled' ? 'restore' : 'cancel',
                            id: selected.$id,
                            expectedRevision: editRevision,
                            reason,
                          })
                        }
                      >
                        {t(selected.status === 'cancelled' ? 'Obnoviť vlak' : 'Zrušiť vlak')}
                      </button>
                    </div>
                  )}
                </>
              )}
              <details>
                <summary>
                  {t('História zápisov')} ({selected.history.length})
                </summary>
                <ul className="edd-history">
                  {selected.history.map((h, i) => (
                    <li key={i}>
                      <strong>
                        {h.operatingDate} {eddClock(h.operatingTime)} · {h.operator}
                      </strong>{' '}
                      ·{' '}
                      {t(
                        (
                          {
                            record: 'Zápis pohybu',
                            correct: 'Oprava',
                            details: 'Úprava údajov',
                            cancel: 'Zrušenie',
                            restore: 'Obnovenie vlaku',
                          } as Record<string, string>
                        )[h.action.split(':')[0]] || h.action,
                      )}
                      {h.action.includes(':')
                        ? ` / ${t(h.action.split(':')[1] === 'arrival' ? 'Príchod' : 'Odchod')}`
                        : ''}
                      {h.reason ? ` — ${h.reason}` : ''}
                      <details>
                        <summary>{t('Pred zmenou / po zmene')}</summary>
                        <HistoryValues before={h.before} after={h.after} />
                      </details>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </main>
      </div>
      <footer className="edd-footer">
        {t(
          'Zápis ani správa nemenia návestidlá a neuvoľňujú traťový oddiel. Odhlášku na pulte vykonajte samostatne.',
        )}
        {preferenceError && <span> {t(preferenceError)}</span>}
      </footer>
    </section>
  );
}

function HistoryValues({ before, after }: { before: string; after: string }) {
  const t = useTranslation();
  const read = (json: string) => {
    try {
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const left = read(before),
    right = read(after);
  const fields = [
    ['Príchod', 'arrival', 'actualArrival'],
    ['Odchod', 'departure', 'actualDeparture'],
    ['Koľaj', 'track', 'track'],
    ['Poznámka', 'notes', 'notes'],
    ['Stav', 'status', 'status'],
  ];
  return (
    <dl>
      {fields
        .filter(([, a, b]) => right[b] !== undefined || left[a] !== undefined)
        .map(([label, a, b]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>
              {t(
                String(
                  ['arrival', 'departure'].includes(a)
                    ? eddClock(String(left[a] || ''))
                    : (left[a] ?? '—'),
                ),
              )}{' '}
              →{' '}
              {t(
                String(
                  ['actualArrival', 'actualDeparture'].includes(b)
                    ? eddClock(String(right[b] ?? left[a] ?? ''))
                    : (right[b] ?? left[a] ?? '—'),
                ),
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
