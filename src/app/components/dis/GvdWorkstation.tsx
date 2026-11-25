'use client';
import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import { newPlanning } from '@/lib/dis/gvd-planning';
import { shiftFromStop } from '@/lib/dis/gvd-running-times';
import { dailyTimetable } from '@/lib/dis/gvd-simple';
import {
  csvTimetable,
  downloadGvd,
  duplicateWorking,
  exportGvd,
  importGvd,
  lineStationPositions,
} from '@/lib/dis/gvd-tools';
import type { RailwayLine } from '@/lib/dis/lines';
import {
  formatMinute,
  normalizeTimetable,
  stopSchema,
  timetableSchema,
  unfoldStops,
  type ConflictReport,
  type Timetable,
  type TimetableInput,
} from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { AeroIcon } from '../ui/AeroIcon';
import { ResizablePanel } from '../ui/ResizablePanel';
import { BookletTimetable } from './BookletTimetable';
import { GvdDialog } from './GvdDialog';
import { GvdRouteTemplates } from './GvdRouteTemplates';
import { GvdStationList } from './GvdStationList';
import { GvdStopGrid } from './GvdStopGrid';
import { TimetableGraph } from './TimetableGraph';
import { TrainCategoryOptions } from './TrainCategoryOptions';

type Place = { placeId: string; name: string; stations: { stationId: string; name: string }[] };
type History = { past: TimetableInput[]; present: TimetableInput; future: TimetableInput[] };
type DraftBackup = {
  version: 1;
  selectedId: string;
  expectedUpdatedAt?: string;
  draft: TimetableInput;
};
// Drafts may contain unfinished clocks and station fields, but never arbitrary
// objects from local storage. Saving still uses the strict timetable schema.
const recoverableDraft = timetableSchema.extend({
  trainNumber: z.string().max(32),
  stops: z
    .array(
      stopSchema.extend({
        station: z.string().max(128),
        arrival: z.string().max(20),
        departure: z.string().max(20),
      }),
    )
    .min(2)
    .max(100),
});
const emptyTrain = (): TimetableInput => ({
  trainNumber: '',
  trainType: 'Os',
  maxSpeed: 100,
  trainLength: 100,
  stops: [
    { station: '', arrival: '08:00', departure: '08:00', track: '' },
    { station: '', arrival: '08:10', departure: '08:10', track: '' },
  ],
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function persistDraft(key: string, current: Omit<DraftBackup, 'version'> & { dirty: boolean }) {
  try {
    if (current.dirty)
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          selectedId: current.selectedId,
          expectedUpdatedAt: current.expectedUpdatedAt,
          draft: current.draft,
        }),
      );
  } catch {
    /* Storage can be unavailable or full. */
  }
}

export function GvdWorkstation({ place, sessionId = '' }: { place: Place; sessionId?: string }) {
  const t = useTranslation();
  const [sessionOnly, setSessionOnly] = useState(false);
  return (
    <div className="gvd-editor gvd-workstation">
      {sessionId && (
        <label className="gvd-scope">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(e) => {
              if (
                window.confirm(t('Zmeniť rozsah GVD? Rozpracovaný návrh zostane v obnove návrhov.'))
              )
                setSessionOnly(e.target.checked);
            }}
          />
          {t('Mimoriadny vlak iba pre túto reláciu')}
        </label>
      )}
      <GvdWorkspace
        key={`${place.placeId}:${sessionOnly ? sessionId : 'daily'}`}
        place={place}
        sessionId={sessionOnly ? sessionId : ''}
      />
    </div>
  );
}
function GvdWorkspace({ place, sessionId }: { place: Place; sessionId: string }) {
  const t = useTranslation();
  const { canCreateGvd, profile } = useDisAuth();
  const sessionOnly = !!sessionId;
  const endpoint = sessionOnly ? '/api/dis/session-timetables' : '/api/dis/timetables';
  const query = new URLSearchParams(
    sessionOnly
      ? { sessionId, includeInactive: 'true' }
      : { placeId: place.placeId, includeInactive: 'true' },
  );
  const {
    value,
    loading,
    error: loadError,
    refresh,
  } = useDisResource<{ timetables: Timetable[] }>(`${endpoint}?${query}`, { timetables: [] });
  const { value: network, refresh: refreshLines } = useDisResource<{ lines: RailwayLine[] }>(
    `/api/dis/lines?placeId=${encodeURIComponent(place.placeId)}`,
    { lines: [] },
  );
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: emptyTrain(),
    future: [],
  }));
  const draft = history.present;
  const [selectedId, setSelectedId] = useState('');
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string>();
  const [baseline, setBaseline] = useState<TimetableInput>(emptyTrain);
  const dirty = !same(draft, baseline);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [tab, setTab] = useState<'table' | 'graph' | 'booklet' | 'station-list'>('table');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [infrastructure, setInfrastructure] = useState(false);
  const [tool, setTool] = useState<
    'copy' | 'return' | 'repeat' | 'shift' | 'dwell' | 'import' | null
  >(null);
  const [toolNumber, setToolNumber] = useState('');
  const [toolMinutes, setToolMinutes] = useState(30);
  const [toolCount, setToolCount] = useState(2);
  const [toolStart, setToolStart] = useState(0);
  const [pending, setPending] = useState<TimetableInput[]>([]);
  const [importText, setImportText] = useState('');
  const storageKey = `dis-gvd-draft:${profile?.userId || 'local'}:${place.placeId}:${sessionId || 'daily'}`;
  const [recovery, setRecovery] = useState<DraftBackup | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (
        saved?.version === 1 &&
        typeof saved.selectedId === 'string' &&
        typeof saved.draft?.trainNumber === 'string' &&
        recoverableDraft.safeParse(saved.draft).success
      )
        return saved;
    } catch {
      /* Corrupt storage does not block authoring. */
    }
    return null;
  });
  const latest = useRef({ draft, dirty, selectedId, expectedUpdatedAt });
  useEffect(() => {
    latest.current = { draft, dirty, selectedId, expectedUpdatedAt };
  }, [draft, dirty, selectedId, expectedUpdatedAt]);
  useEffect(() => {
    const timer = setTimeout(() => persistDraft(storageKey, latest.current), 500);
    return () => clearTimeout(timer);
  }, [draft, storageKey]);
  useEffect(() => {
    const persist = () => persistDraft(storageKey, latest.current);
    const leave = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        persist();
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      persist();
      window.removeEventListener('beforeunload', leave);
    };
  }, [storageKey]);
  const line = draft.planning?.lineId
    ? network.lines.find((l) => l.id === draft.planning?.lineId)
    : undefined;
  const names = useMemo(
    () => new Map(place.stations.map((s) => [s.stationId, s.name])),
    [place.stations],
  );
  const stationPattern = useMemo(() => {
    const choices = [...names.keys()]
      .filter(Boolean)
      .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    return choices
      ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${choices})(?![\\p{L}\\p{N}_])`, 'gu')
      : null;
  }, [names]);
  const describeIssue = (message: string) => {
    const text = t(message);
    return stationPattern ? text.replace(stationPattern, (id) => names.get(id) || id) : text;
  };
  const editable = canCreateGvd && !busy && !loading;
  const selected = value.timetables.find((item) => item.$id === selectedId);
  const canEditSelected = !sessionOnly || !selected || selected.sessionId === sessionId;
  const visibleTrains = value.timetables.filter(
    (train) =>
      (showInactive || !train.planning || train.planning.status === 'active') &&
      `${train.trainType} ${train.trainNumber} ${train.stops.map((s) => names.get(s.station) || s.station).join(' ')}`
        .toLocaleLowerCase('sk')
        .includes(search.toLocaleLowerCase('sk')),
  );
  const change = (next: TimetableInput) => {
    if (!editable || !canEditSelected) return;
    setHistory((h) =>
      same(h.present, next)
        ? h
        : { past: [...h.past.slice(-99), h.present], present: next, future: [] },
    );
    setReport(null);
    setNotice('');
  };
  const update = (patch: Partial<TimetableInput>) => change({ ...draft, ...patch });
  const select = (train?: Timetable) => {
    if (dirty && !window.confirm(t('Opustiť rozpracovaný návrh? Návrh možno obnoviť.'))) return;
    if (dirty) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ version: 1, selectedId, expectedUpdatedAt, draft }),
        );
        setRecovery({ version: 1, selectedId, expectedUpdatedAt, draft });
      } catch {}
    }
    const next = train ? dailyTimetable(structuredClone(train)) : dailyTimetable(emptyTrain());
    setHistory({ past: [], present: next, future: [] });
    setBaseline(next);
    setSelectedId(train?.$id || '');
    setExpectedUpdatedAt(train?.$updatedAt);
    setReport(null);
    setError('');
    setNotice('');
  };
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );
  async function save(
    preview = false,
    train = draft,
    id = selectedId,
    revision = expectedUpdatedAt,
  ) {
    if (!canCreateGvd || busy || (!canEditSelected && id)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const normalized = normalizeTimetable(dailyTimetable(train));
      const result = await disFetch<{ timetable?: Timetable; report: ConflictReport }>(
        sessionOnly ? endpoint : preview ? `${endpoint}/check` : endpoint,
        {
          method: 'POST',
          body: JSON.stringify({
            placeId: place.placeId,
            ...(sessionOnly ? { sessionId, preview } : {}),
            id: id || undefined,
            expectedUpdatedAt: revision,
            timetable: normalized,
          }),
        },
      );
      setReport(result.report);
      if (result.timetable) {
        const saved = result.timetable;
        setSelectedId(saved.$id);
        setExpectedUpdatedAt(saved.$updatedAt);
        setHistory({ past: [], present: saved, future: [] });
        setBaseline(saved);
        latest.current = {
          draft: saved,
          dirty: false,
          selectedId: saved.$id,
          expectedUpdatedAt: saved.$updatedAt,
        };
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        setRecovery(null);
        await refresh();
        setNotice('Grafikon bol uložený.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function retire() {
    if (!selectedId || !editable || !canEditSelected) return;
    const dependents = value.timetables
      .filter((item) => item.nextTrainId === selectedId)
      .map((item) => item.trainNumber);
    if (
      !window.confirm(
        t('Vyradiť vlak z ponuky? Existujúce EDD, výkony a väzby zostanú zachované.') +
          (dependents.length ? `\n${t('Nadväzujúce vlaky')}: ${dependents.join(', ')}` : ''),
      )
    )
      return;
    const next = {
      ...draft,
      planning: { ...(draft.planning || newPlanning()), status: 'retired' as const },
    };
    if (sessionOnly) {
      await save(false, next);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await disFetch<{ timetable: Timetable }>(endpoint, {
        method: 'DELETE',
        body: JSON.stringify({ placeId: place.placeId, id: selectedId, expectedUpdatedAt }),
      });
      await refresh();
      setExpectedUpdatedAt(result.timetable.$updatedAt);
      setBaseline(result.timetable);
      setHistory({ past: [], present: result.timetable, future: [] });
      latest.current = {
        draft: result.timetable,
        dirty: false,
        selectedId,
        expectedUpdatedAt: result.timetable.$updatedAt,
      };
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      setNotice('Vlak bol vyradený.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  function applyTool() {
    try {
      setError('');
      if (
        !Number.isFinite(toolMinutes) ||
        Math.abs(toolMinutes) > 1440 ||
        !Number.isInteger(toolMinutes)
      )
        throw new Error(t('Zadajte celé minúty v rozsahu −1440 až 1440.'));
      if (tool === 'shift') change(shiftFromStop(draft, toolStart, toolMinutes));
      else if (tool === 'dwell')
        change({
          ...draft,
          stops: unfoldStops(draft.stops).map((s, i) =>
            i < toolStart || s.kind === 'pass'
              ? s
              : { ...s, departure: formatMinute(s.arrivalMinute + Math.max(0, toolMinutes)) },
          ),
        });
      else if (tool === 'import') setPending(importGvd(importText));
      else {
        const base = normalizeTimetable(draft);
        if (
          !toolNumber.trim() ||
          (tool === 'repeat' &&
            (!/^\d{1,9}$/.test(toolNumber) ||
              !Number.isInteger(toolCount) ||
              toolCount < 1 ||
              toolCount > 20))
        )
          throw new Error(
            t('Zadajte číslo vlaku; pre takt aj počet 1 až 20 a číselný začiatok radu.'),
          );
        const count = tool === 'repeat' ? Math.min(20, Math.max(1, toolCount)) : 1;
        const copies = Array.from({ length: count }, (_, i) =>
          dailyTimetable(
            duplicateWorking(
              base,
              count === 1 ? toolNumber : String(Number(toolNumber) + i),
              toolMinutes * (i + 1),
              tool === 'return',
            ),
          ),
        );
        if (tool === 'repeat') setPending(copies);
        else {
          setSelectedId('');
          setExpectedUpdatedAt(undefined);
          setBaseline(emptyTrain());
          setHistory({ past: [], present: copies[0], future: [] });
          setTab('table');
        }
      }
      setTool(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }
  async function savePending() {
    if (!canCreateGvd || busy) return;
    setBusy(true);
    setError('');
    let saved = 0;
    try {
      for (const train of pending) {
        await disFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            placeId: place.placeId,
            ...(sessionOnly ? { sessionId } : {}),
            timetable: normalizeTimetable(train),
          }),
        });
        saved++;
      }
      setNotice('Pripravené vlaky boli uložené.');
    } catch (reason) {
      setError(
        `${t('Uložené vlaky')}: ${saved}/${pending.length}. ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    } finally {
      setPending(pending.slice(saved));
      await refresh();
      setBusy(false);
    }
  }
  return (
    <>
      <div className="gvd-toolbar">
        <strong>
          <AeroIcon name="table" />
          {t('Tvorba cestovných poriadkov')}
        </strong>
        <span>{place.name}</span>
        <div className="gvd-toolbar-actions">
          <button className="aero-btn" disabled={!editable} onClick={() => select()}>
            <AeroIcon name="add" />
            {t('Nový vlak')}
          </button>
          <button
            className="aero-btn"
            disabled={!editable || !canEditSelected}
            onClick={() => void save()}
          >
            <AeroIcon name="save" />
            {t('Uložiť vlak do GVD')}
          </button>
          <button
            className="aero-btn"
            disabled={!editable || !canEditSelected}
            onClick={() => void save(true)}
          >
            {t('Skontrolovať časy')}
          </button>
          <button className="aero-btn" disabled={busy} onClick={() => void refresh()}>
            {t('Obnoviť')}
          </button>
        </div>
      </div>
      <div className="gvd-workstation-body">
        <ResizablePanel
          id="gvd-trains"
          title={t('Vlaky v GVD')}
          edge="left"
          defaultSize={250}
          responsive
        >
          <div className="gvd-train-browser">
            <input
              className="aero-input"
              aria-label={t('Vyhľadať vlak')}
              placeholder={t('Číslo, kategória alebo dopravňa')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              {t('Zobraziť koncepty a vyradené vlaky')}
            </label>
            <div className="gvd-train-list" role="group" aria-label={t('Vlaky v GVD')}>
              {visibleTrains.map((train) => (
                <button
                  className={`gvd-train-item ${selectedId === train.$id ? 'selected' : ''}`}
                  key={train.$id}
                  disabled={busy}
                  onClick={() => select(train)}
                >
                  <strong>
                    {train.trainType} {train.trainNumber}
                    <time>
                      {train.stops[0].departure} – {train.stops.at(-1)!.arrival}
                    </time>
                  </strong>
                  <span>
                    {names.get(train.stops[0].station) || train.stops[0].station} →{' '}
                    {names.get(train.stops.at(-1)!.station) || train.stops.at(-1)!.station}
                  </span>
                  <small>
                    {train.planning
                      ? t(
                          train.planning.status === 'active'
                            ? 'V prevádzke'
                            : train.planning.status === 'draft'
                              ? 'Koncept'
                              : 'Vyradený',
                        )
                      : t('V prevádzke')}
                    {train.sessionId ? ` · ${t('Relácia')}` : ''}
                  </small>
                </button>
              ))}
              {!loading && !visibleTrains.length && <p>{t('Žiadne vlaky pre zvolený filter.')}</p>}
            </div>
            <button
              className="aero-btn"
              disabled={!editable || !selectedId || !canEditSelected}
              onClick={() => void retire()}
            >
              <AeroIcon name="delete" />
              {t('Vyradiť vlak')}
            </button>
          </div>
        </ResizablePanel>
        <main className="gvd-main-workspace">
          {(error || loadError) && (
            <div className="gvd-message error" role="alert">
              {t(error || loadError)}
            </div>
          )}
          {notice && (
            <div className="gvd-message" role="status">
              {t(notice)}
            </div>
          )}
          {recovery && (
            <div className="gvd-message gvd-action-row">
              {t('Je dostupný neuložený návrh.')}
              <button
                className="aero-btn"
                disabled={!editable}
                onClick={() => {
                  setSelectedId(recovery.selectedId);
                  setExpectedUpdatedAt(recovery.expectedUpdatedAt);
                  setHistory({ past: [], present: recovery.draft, future: [] });
                  setBaseline(emptyTrain());
                  setRecovery(null);
                }}
              >
                {t('Obnoviť návrh')}
              </button>
              <button
                className="aero-btn"
                onClick={() => {
                  try {
                    localStorage.removeItem(storageKey);
                  } catch {}
                  setRecovery(null);
                }}
              >
                {t('Zahodiť návrh')}
              </button>
            </div>
          )}
          {!canEditSelected && (
            <p className="gvd-message">
              {t('Tento vlak patrí dennému GVD. V tejto relácii môžete vytvoriť jeho kópiu.')}
            </p>
          )}
          <div className="gvd-document-toolbar gvd-primary-tools">
            <button
              className="aero-btn"
              disabled={!editable || !history.past.length}
              onClick={undo}
            >
              {t('Späť')}
            </button>
            <button
              className="aero-btn"
              disabled={!editable || !history.future.length}
              onClick={redo}
            >
              {t('Znovu')}
            </button>

            {(['copy', 'return', 'shift'] as const).map((action, i) => (
              <button
                key={action}
                className="aero-btn"
                disabled={!editable || (action === 'shift' && !canEditSelected)}
                onClick={() => {
                  setTool(action);
                  setToolNumber('');
                  setToolStart(0);
                  setToolMinutes(action === 'shift' ? 5 : 30);
                }}
              >
                {t(['Kópia vlaku', 'Spiatočný výkon', 'Posun časov'][i])}
              </button>
            ))}
          </div>
          <details className="gvd-extra-tools">
            <summary>{t('Nástroje a export')}</summary>
            <div className="gvd-document-toolbar">
              {(['repeat', 'dwell', 'import'] as const).map((action, i) => (
                <button
                  key={action}
                  className="aero-btn"
                  disabled={!editable || (action === 'dwell' && !canEditSelected)}
                  onClick={() => {
                    setTool(action);
                    setToolNumber('');
                    setToolStart(0);
                  }}
                >
                  {t(['Taktové vlaky', 'Nastaviť pobyty', 'Import GVD'][i])}
                </button>
              ))}
              <button
                className="aero-btn"
                onClick={() => {
                  try {
                    downloadGvd('gvd.json', exportGvd(value.timetables));
                  } catch (reason) {
                    setError(String(reason));
                  }
                }}
              >
                {t('Export GVD')}
              </button>
              <button
                className="aero-btn"
                onClick={() =>
                  downloadGvd('vlak.csv', csvTimetable(draft, names), 'text/csv;charset=utf-8')
                }
              >
                {t('Export CSV')}
              </button>
            </div>
          </details>
          <fieldset className="gvd-train-header" disabled={!editable || !canEditSelected}>
            <label>
              {t('Číslo vlaku')}
              <input
                className="aero-input"
                value={draft.trainNumber}
                maxLength={32}
                onChange={(e) => update({ trainNumber: e.target.value })}
              />
            </label>
            <label>
              {t('Kategória')}
              <select
                className="aero-select"
                value={draft.trainType}
                onChange={(e) =>
                  update({ trainType: e.target.value as TimetableInput['trainType'] })
                }
              >
                <TrainCategoryOptions />
              </select>
            </label>
            <label>
              {t('Trať')}
              <select
                className="aero-select"
                value={line?.id || ''}
                onChange={(e) =>
                  update({
                    planning: {
                      ...(draft.planning || newPlanning()),
                      lineId: e.target.value || undefined,
                      calculationFingerprint: undefined,
                    },
                  })
                }
              >
                <option value="">{t('Vyberte trať')}</option>
                {network.lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="aero-btn" onClick={() => setInfrastructure(true)}>
              {t('Šablóny trás')}
            </button>
            <label>
              {t('Stav vlaku')}
              <select
                className="aero-select"
                value={draft.planning?.status || 'active'}
                onChange={(e) =>
                  update({
                    planning: {
                      ...(draft.planning || newPlanning()),
                      daily: true,
                      mode: 'manual',
                      status: e.target.value as 'active' | 'draft' | 'retired',
                    },
                  })
                }
              >
                <option value="active">{t('V prevádzke')}</option>
                <option value="draft">{t('Koncept')}</option>
                <option value="retired">{t('Vyradený')}</option>
              </select>
            </label>
          </fieldset>
          <div className="gvd-tabbar" role="tablist" aria-label={t('Zobrazenie GVD')}>
            {(['table', 'graph', 'booklet', 'station-list'] as const).map((name, i) => (
              <button
                role="tab"
                aria-selected={tab === name}
                aria-controls={`gvd-panel-${name}`}
                id={`gvd-tab-${name}`}
                key={name}
                className="aero-btn"
                onClick={() => setTab(name)}
              >
                {t(
                  ['Cestovný poriadok', 'Grafikon', 'Zošitový poriadok', 'Staničný zoznam vlakov'][
                    i
                  ],
                )}
              </button>
            ))}
          </div>
          <div
            className="gvd-tab-content"
            role="tabpanel"
            id={`gvd-panel-${tab}`}
            aria-labelledby={`gvd-tab-${tab}`}
          >
            {tab === 'table' && (
              <>
                <GvdStopGrid
                  train={draft}
                  stations={place.stations}
                  disabled={!editable || !canEditSelected}
                  onChange={change}
                />
                <details className="gvd-extra-tools">
                  <summary>{t('Ďalšie údaje vlaku')}</summary>
                  <fieldset disabled={!editable || !canEditSelected} className="gvd-notes-fields">
                    <label>
                      {t('Rýchlosť (km/h)')}
                      <input
                        className="aero-input"
                        type="number"
                        min="1"
                        max="300"
                        value={draft.maxSpeed}
                        onChange={(e) => update({ maxSpeed: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      {t('Dĺžka (m)')}
                      <input
                        className="aero-input"
                        type="number"
                        min="1"
                        max="1000"
                        value={draft.trainLength}
                        onChange={(e) => update({ trainLength: Number(e.target.value) })}
                      />
                    </label>

                    <label>
                      {t('Nadväzujúci vlak')}
                      <select
                        className="aero-select"
                        value={draft.nextTrainId || ''}
                        onChange={(e) => update({ nextTrainId: e.target.value || undefined })}
                      >
                        <option value="">{t('Bez nadväzujúceho vlaku')}</option>
                        {value.timetables
                          .filter((item) => item.$id !== selectedId)
                          .map((item) => (
                            <option key={item.$id} value={item.$id}>
                              {item.trainType} {item.trainNumber}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {t('Poznámky k vlaku')}
                      <input
                        className="aero-input"
                        value={draft.notes || ''}
                        maxLength={1000}
                        onChange={(e) => update({ notes: e.target.value })}
                      />
                    </label>
                  </fieldset>
                </details>
              </>
            )}
            {
              <div hidden={tab !== 'graph'} className="gvd-graph-panel">
                <TimetableGraph
                  trains={[
                    ...value.timetables.filter(
                      (train) =>
                        train.$id !== selectedId &&
                        (showInactive || !train.planning || train.planning.status === 'active'),
                    ),
                    { ...draft, $id: selectedId || 'draft' },
                  ]}
                  stations={(line?.stations || place.stations.map((s) => s.stationId)).map(
                    (id) => ({
                      stationId: id,
                      name: names.get(id) || id,
                    }),
                  )}
                  stationPositions={lineStationPositions(line)}
                  editableId={selectedId || 'draft'}
                  onEdit={editable && canEditSelected ? change : undefined}
                  onSelect={(train) => {
                    if (train.$id !== 'draft' && train.$id !== selectedId) select(train);
                  }}
                />
              </div>
            }
            {tab === 'station-list' && (
              <GvdStationList trains={visibleTrains} stations={place.stations} />
            )}
            {tab === 'booklet' && (
              <>
                <div className="gvd-action-row">
                  <button className="aero-btn" onClick={() => window.print()}>
                    {t('Tlač / PDF')}
                  </button>
                </div>
                <BookletTimetable
                  timetable={{ ...draft, $id: selectedId || 'draft' }}
                  stationNames={names}
                  positions={lineStationPositions(line)}
                />
              </>
            )}
          </div>
          <div className="gvd-diagnostics">
            {report && (
              <ul className="gvd-problems">
                {!report.conflicts.length && !report.warnings.length && (
                  <li>{t('Bez zistených kolízií v dostupných údajoch.')}</li>
                )}
                {report.conflicts.map((r, i) => (
                  <li key={`c${i}`}>
                    <strong>{t('Kolízia')}</strong>: {describeIssue(r.message)}
                  </li>
                ))}
                {report.warnings.map((r, i) => (
                  <li key={`w${i}`}>
                    {t('Upozornenie')}: {describeIssue(r.message)}
                  </li>
                ))}
              </ul>
            )}
            {!!pending.length && (
              <div className="gvd-pending">
                <strong>
                  {t('Pripravené vlaky')}: {pending.length}
                </strong>
                <ul>
                  {pending.map((train, i) => (
                    <li key={i}>
                      {train.trainType} {train.trainNumber} · {train.stops[0].departure} ·{' '}
                      {names.get(train.stops[0].station) || train.stops[0].station} →{' '}
                      {names.get(train.stops.at(-1)!.station) || train.stops.at(-1)!.station}
                    </li>
                  ))}
                </ul>
                <button
                  className="aero-btn"
                  disabled={!editable}
                  onClick={() => void savePending()}
                >
                  {t('Uložiť pripravené vlaky')}
                </button>
                <button className="aero-btn" disabled={busy} onClick={() => setPending([])}>
                  {t('Zrušiť')}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
      <footer className="gvd-statusbar">
        <span>{t(dirty ? 'Neuložené zmeny' : 'Uložený stav')}</span>
        <span>
          {draft.trainType} {draft.trainNumber || '—'}
        </span>
        <span>
          {draft.stops.length} · {t('Dopravne')}
        </span>
      </footer>
      {infrastructure && (
        <GvdDialog title={t('Šablóny trás')} onClose={() => setInfrastructure(false)}>
          <GvdRouteTemplates
            placeId={place.placeId}
            stations={place.stations}
            lines={network.lines}
            train={draft}
            disabled={!editable || !canEditSelected}
            onSaved={refreshLines}
            onApply={(next) => {
              if (
                draft.stops.some((stop) => stop.station) &&
                !window.confirm(t('Nahradiť trasu vlaku stanicami vybranej trate?'))
              )
                return;
              change(next);
              setTab('table');
              setInfrastructure(false);
            }}
          />
        </GvdDialog>
      )}
      {tool && (
        <GvdDialog title={t('Nástroje GVD')} onClose={() => setTool(null)} compact>
          {tool === 'import' ? (
            <label>
              {t('Vložte export GVD vo formáte JSON')}
              <textarea
                className="aero-input"
                rows={12}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </label>
          ) : (
            <div className="gvd-properties">
              {['copy', 'return', 'repeat'].includes(tool) && (
                <label>
                  {t('Nové číslo vlaku')}
                  <input
                    className="aero-input"
                    value={toolNumber}
                    onChange={(e) => setToolNumber(e.target.value)}
                  />
                </label>
              )}
              <label>
                {t(tool === 'dwell' ? 'Pobyt (min)' : 'Posun / interval (min)')}
                <input
                  className="aero-input"
                  type="number"
                  value={toolMinutes}
                  onChange={(e) => setToolMinutes(Number(e.target.value))}
                />
              </label>
              {tool === 'repeat' && (
                <label>
                  {t('Počet vlakov (najviac 20)')}
                  <input
                    className="aero-input"
                    type="number"
                    min="1"
                    max="20"
                    value={toolCount}
                    onChange={(e) => setToolCount(Number(e.target.value))}
                  />
                </label>
              )}
              {['shift', 'dwell'].includes(tool) && (
                <label>
                  {t('Od dopravne')}
                  <select
                    className="aero-select"
                    value={toolStart}
                    onChange={(e) => setToolStart(Number(e.target.value))}
                  >
                    {draft.stops.map((s, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {names.get(s.station) || s.station}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {tool === 'return' && (
            <p>{t('Skontrolujte časy a koľaje spiatočného vlaku pred uložením.')}</p>
          )}
          <p>{t('Nástroj pripraví návrh. Uloženie je samostatný krok.')}</p>
          <button className="aero-btn" onClick={applyTool}>
            {t('Pripraviť návrh')}
          </button>
          {error && <p role="alert">{error}</p>}
        </GvdDialog>
      )}
    </>
  );
}
