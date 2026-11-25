'use client';
import { disFetch } from '@/lib/dis/api-client';
import { parseCompactClock } from '@/lib/dis/gvd-running-times';
import { applyMeasuredRoute } from '@/lib/dis/gvd-simple';
import type { RailwayLine } from '@/lib/dis/lines';
import { normalizeTimetable, type TimetableInput } from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
import { LineEditor } from './LineEditor';

export function GvdRouteTemplates({
  placeId,
  stations,
  lines,
  train,
  disabled,
  onApply,
  onSaved,
}: {
  placeId: string;
  stations: { stationId: string; name: string }[];
  lines: RailwayLine[];
  train: TimetableInput;
  disabled: boolean;
  onApply: (train: TimetableInput) => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslation();
  const [selected, setSelected] = useState(lines[0]?.id || '');
  const [start, setStart] = useState(train.stops[0]?.departure || '08:00');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const line = lines.find((line) => line.id === selected);
  async function saveTemplate() {
    setMessage('');
    setBusy(true);
    try {
      const valid = normalizeTimetable({ ...train, trainNumber: train.trainNumber || 'template' });
      const route: RailwayLine = {
        id: crypto.randomUUID(),
        placeId,
        name: name.trim(),
        stations: valid.stops.map((stop) => stop.station),
        measuredStops: valid.stops,
      };
      await disFetch('/api/dis/lines', { method: 'POST', body: JSON.stringify(route) });
      await onSaved();
      setSelected(route.id);
      setName('');
      setMessage(t('Šablóna bola uložená.'));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gvd-template-editor">
      <p>
        {t(
          'Uložte namerané časy z mapy a použite ich pre ďalšie vlaky. Každý smer môže mať vlastnú šablónu.',
        )}
      </p>
      <fieldset disabled={disabled || busy} className="gvd-properties">
        <label>
          {t('Šablóna trasy')}
          <select
            className="aero-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">{t('Vyberte trať')}</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Prvý odchod')}
          <input
            className="aero-input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            onBlur={(e) => setStart(parseCompactClock(e.target.value))}
            inputMode="numeric"
          />
        </label>
        <button
          className="aero-btn"
          disabled={!line}
          onClick={() => {
            if (!line) return;
            try {
              onApply(applyMeasuredRoute(train, line, parseCompactClock(start)));
            } catch (reason) {
              setMessage(reason instanceof Error ? reason.message : String(reason));
            }
          }}
        >
          {t('Vyplniť cestovný poriadok')}
        </button>
      </fieldset>
      {line && (
        <p className="gvd-help">
          {line.stations
            .map((id) => stations.find((s) => s.stationId === id)?.name || id)
            .join(' → ')}
          <br />
          {t(
            line.measuredStops
              ? 'Použijú sa uložené jazdné časy a pobyty.'
              : 'Trasa nemá namerané časy. Časy vyplňte ručne.',
          )}
        </p>
      )}
      <fieldset disabled={disabled || busy} className="gvd-properties">
        <legend>{t('Uložiť aktuálnu trasu a časy ako šablónu')}</legend>
        <label>
          {t('Názov šablóny')}
          <input
            className="aero-input"
            value={name}
            maxLength={128}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="aero-btn" disabled={!name.trim()} onClick={() => void saveTemplate()}>
          {t('Uložiť šablónu')}
        </button>
      </fieldset>
      {message && <p role="status">{t(message)}</p>}
      <LineEditor placeId={placeId} stations={stations} onChange={onSaved} />
    </div>
  );
}
