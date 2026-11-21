'use client';
import { disFetch } from '@/lib/dis/api-client';
import type { RailwayLine } from '@/lib/dis/lines';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
import { AeroAutocomplete } from '../ui/AeroAutocomplete';
import { AeroIcon } from '../ui/AeroIcon';

export function LineEditor({
  placeId,
  stations,
  onChange,
}: {
  onChange?: () => Promise<void>;
  placeId: string;
  stations: { stationId: string; name: string }[];
}) {
  const t = useTranslation();
  const { value, error, refresh } = useDisResource<{ lines: RailwayLine[] }>(
    `/api/dis/lines?${new URLSearchParams({ placeId })}`,
    { lines: [] },
  );
  const [draft, setDraft] = useState<RailwayLine | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function save(remove = false) {
    if (!draft || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await disFetch('/api/dis/lines', {
        method: remove ? 'DELETE' : 'POST',
        body: JSON.stringify(draft),
      });
      await refresh();
      await onChange?.();
      setDraft(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Trať sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="gvd-section">
      <summary>{t('Trate a poradie staníc')}</summary>
      {(error || notice) && <p role="alert">{t(error || notice)}</p>}
      <div className="ribbon-bar flex-wrap">
        {value.lines.map((line) => (
          <button className="aero-btn" key={line.id} disabled={busy} onClick={() => setDraft(line)}>
            <AeroIcon name="network" />
            {line.name}
          </button>
        ))}
        <button
          className="aero-btn"
          disabled={busy}
          onClick={() => setDraft({ id: crypto.randomUUID(), placeId, name: '', stations: [] })}
        >
          <AeroIcon name="add" />
          {t('Nová trať')}
        </button>
      </div>
      {draft && (
        <fieldset disabled={busy} className="p-2 space-y-2">
          <label>
            {t('Názov trate')}{' '}
            <input
              className="aero-input"
              maxLength={128}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <ol>
            {draft.stations.map((id, index) => (
              <li key={id} className="flex gap-2 items-center py-1">
                <span>
                  {index + 1}. {stations.find((s) => s.stationId === id)?.name || id}
                </span>
                <button
                  className="aero-btn"
                  disabled={index === 0}
                  onClick={() => {
                    const order = [...draft.stations];
                    [order[index - 1], order[index]] = [order[index], order[index - 1]];
                    setDraft({ ...draft, stations: order });
                  }}
                >
                  {t('Vyššie')}
                </button>
                <button
                  className="aero-btn"
                  disabled={index === draft.stations.length - 1}
                  onClick={() => {
                    const order = [...draft.stations];
                    [order[index + 1], order[index]] = [order[index], order[index + 1]];
                    setDraft({ ...draft, stations: order });
                  }}
                >
                  {t('Nižšie')}
                </button>
                <button
                  className="aero-btn"
                  onClick={() =>
                    setDraft({ ...draft, stations: draft.stations.filter((s) => s !== id) })
                  }
                >
                  <AeroIcon name="delete" />
                  {t('Odstrániť')}
                </button>
              </li>
            ))}
          </ol>
          <AeroAutocomplete
            label={t('Pridať stanicu na trať')}
            value=""
            options={stations
              .filter((s) => !draft.stations.includes(s.stationId))
              .map((s) => ({ value: s.stationId, label: s.name }))}
            onInput={() => {}}
            onSelect={(option) =>
              setDraft({ ...draft, stations: [...draft.stations, option.value] })
            }
          />
          <div className="flex gap-2 flex-wrap">
            <button
              className="aero-btn"
              disabled={draft.stations.length < 2 || !draft.name.trim()}
              onClick={() => void save()}
            >
              <AeroIcon name="save" />
              {t('Uložiť trať')}
            </button>
            <button className="aero-btn" onClick={() => setDraft(null)}>
              {t('Zrušiť')}
            </button>
            {value.lines.some((l) => l.id === draft.id) && (
              <button className="aero-btn" onClick={() => void save(true)}>
                <AeroIcon name="delete" />
                {t('Odstrániť trať')}
              </button>
            )}
          </div>
        </fieldset>
      )}
    </details>
  );
}
