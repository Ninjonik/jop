'use client';
import type { RailwayLine } from '@/lib/dis/lines';
import { readTpvLayouts, reorderTpvStations, tpvLayoutSchema } from '@/lib/dis/tpv-layout';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useUserPreference } from '@/lib/dis/use-user-preference';
import { useTranslation } from '@/lib/i18n/client';
import { getStationDisplayName } from '@/lib/station/display-name';
import { useMemo, useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';
import { GvdDialog } from './GvdDialog';
import { TimetableGraph } from './TimetableGraph';
import { useTrainWorkspace } from './TrainWorkspace';
export function TpvFullView({
  stationId,
  placeId,
  active = true,
}: {
  sessionId: string;
  stationId: string;
  placeId: string;
  active?: boolean;
}) {
  const t = useTranslation();
  const traffic = useTrainWorkspace();
  const { value: network, error: networkError } = useDisResource<{ lines: RailwayLine[] }>(
    active ? '/api/dis/lines?' + new URLSearchParams({ placeId }) : null,
    { lines: [] },
    60000,
  );
  const [preferences, setPreferences, prefError] = useUserPreference<{ layouts: string }>(
    'tpv-layouts:' + placeId,
    { layouts: '[]' },
  );
  const layouts = useMemo(() => readTpvLayouts(preferences.layouts), [preferences.layouts]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragged, setDragged] = useState('');
  const [layoutId, setLayoutId] = useState(''),
    [name, setName] = useState(''),
    [lineId, setLineId] = useState(''),
    [first, setFirst] = useState(''),
    [last, setLast] = useState(''),
    [hidden, setHidden] = useState<string[]>([]),
    [error, setError] = useState('');
  const line = network.lines.find((line) => line.id === lineId);
  const allStations = line?.stations || [
    ...new Set(
      traffic.value.timetables.flatMap((train) => train.stops.map((stop) => stop.station)),
    ),
  ];
  const a = first ? Math.max(0, allStations.indexOf(first)) : 0,
    b = last ? Math.max(0, allStations.indexOf(last)) : allStations.length - 1;
  const sectionStations = allStations
    .slice(Math.min(a, b), Math.max(a, b) + 1)
    .filter((id) => !hidden.includes(id));
  const orderedIds = [
    ...order.filter((id) => sectionStations.includes(id)),
    ...sectionStations.filter((id) => !order.includes(id)),
  ];
  const stations = orderedIds.map((stationId) => ({
    stationId,
    name: getStationDisplayName(stationId),
  }));
  function save() {
    try {
      const layout = tpvLayoutSchema.parse({
        id: layoutId || crypto.randomUUID(),
        name,
        lineId,
        first,
        last,
        hidden,
        order: orderedIds,
      });
      if (layouts.length >= 12 && !layoutId) throw Error('Najviac 12 rozložení.');
      const serialized = JSON.stringify([
        ...layouts.filter((item) => item.id !== layout.id),
        layout,
      ]);
      if (serialized.length > 8000) {
        setError('Rozloženie je príliš veľké. Znížte počet uložených rozložení.');
        return;
      }
      setPreferences({ layouts: serialized });
      setLayoutId(layout.id);
      setError('');
    } catch {
      setError('Zadajte názov rozloženia (najviac 12 rozložení).');
    }
  }
  return (
    <section className="tpv-live-workspace">
      <div className="ribbon-bar flex-wrap">
        <strong>{t('TPV — živá traťová poloha vlakov')}</strong>
        <span>{t('Odhady sa aktualizujú z EDD; nenahrádzajú koľajové snímače.')}</span>
        <button className="aero-btn" onClick={() => setSettingsOpen(true)}>
          <AeroIcon name="settings" />
          {t('Rozloženie TPV')}
        </button>
      </div>
      {(traffic.error || networkError || prefError || error) && (
        <p role="alert" className="p-2">
          {t(traffic.error || networkError || prefError || error)}
        </p>
      )}
      {settingsOpen && (
        <GvdDialog compact title={t('Rozloženie TPV')} onClose={() => setSettingsOpen(false)}>
          <div className="tpv-layout-dialog">
            <div className="tpv-layout-toolbar">
              <label>
                {t('Rozloženie')}
                <select
                  className="aero-select"
                  value={layoutId}
                  onChange={(e) => {
                    setLayoutId(e.target.value);
                    const layout = layouts.find((item) => item.id === e.target.value);
                    if (layout) {
                      setName(layout.name);
                      setLineId(layout.lineId);
                      setFirst(layout.first);
                      setLast(layout.last);
                      setHidden(layout.hidden);
                      setOrder(layout.order);
                    } else setName('');
                  }}
                >
                  <option value="">{t('Vlastné rozloženie')}</option>
                  {layouts.map((layout) => (
                    <option key={layout.id} value={layout.id}>
                      {layout.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Názov')}
                <input
                  className="aero-input"
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="aero-btn" onClick={save}>
                <AeroIcon name="save" />
                {t('Uložiť rozloženie')}
              </button>
              <button
                className="aero-btn"
                disabled={!layoutId}
                onClick={() => {
                  setPreferences({
                    layouts: JSON.stringify(layouts.filter((item) => item.id !== layoutId)),
                  });
                  setLayoutId('');
                  setName('');
                }}
              >
                <AeroIcon name="delete" />
                {t('Odstrániť')}
              </button>
              <label>
                {t('Trať')}
                <select
                  className="aero-select"
                  value={lineId}
                  onChange={(e) => {
                    setLineId(e.target.value);
                    setFirst('');
                    setLast('');
                    setHidden([]);
                    setOrder([]);
                  }}
                >
                  <option value="">{t('Celá sieť')}</option>
                  {network.lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                    </option>
                  ))}
                </select>
              </label>
              {(['first', 'last'] as const).map((field) => (
                <label key={field}>
                  {t(field === 'first' ? 'Od dopravne' : 'Po dopravňu')}
                  <select
                    className="aero-select"
                    value={field === 'first' ? first : last}
                    onChange={(e) =>
                      field === 'first' ? setFirst(e.target.value) : setLast(e.target.value)
                    }
                  >
                    <option value="">{t('Celý úsek')}</option>
                    {allStations.map((id) => (
                      <option key={id} value={id}>
                        {getStationDisplayName(id)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="tpv-station-checks">
              {allStations.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(id)}
                    onChange={() =>
                      setHidden((previous) =>
                        previous.includes(id)
                          ? previous.filter((item) => item !== id)
                          : [...previous, id],
                      )
                    }
                  />
                  {getStationDisplayName(id)}
                </label>
              ))}
            </div>
            <p className="tpv-layout-hint">
              {t('Poradie zmeníte potiahnutím alebo šípkami. Časy a trasa vlaku sa nemenia.')}
            </p>
            <ol className="tpv-order-list">
              {orderedIds.map((id, index) => (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragged(id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOrder(reorderTpvStations(orderedIds, dragged, id));
                    setDragged('');
                  }}
                >
                  <span aria-hidden="true">↕</span>
                  <span>{getStationDisplayName(id)}</span>
                  <button
                    className="aero-btn"
                    disabled={index === 0}
                    aria-label={t('Vyššie') + ' ' + getStationDisplayName(id)}
                    onClick={() =>
                      setOrder(reorderTpvStations(orderedIds, id, orderedIds[index - 1]))
                    }
                  >
                    ↑
                  </button>
                  <button
                    className="aero-btn"
                    disabled={index === orderedIds.length - 1}
                    aria-label={t('Nižšie') + ' ' + getStationDisplayName(id)}
                    onClick={() =>
                      setOrder(reorderTpvStations(orderedIds, id, orderedIds[index + 1]))
                    }
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
            <div className="tpv-layout-footer">
              <button className="aero-btn" onClick={() => setSettingsOpen(false)}>
                {t('Hotovo')}
              </button>
            </div>
          </div>
        </GvdDialog>
      )}
      {active && (
        <TimetableGraph
          trains={traffic.value.timetables}
          stations={stations}
          records={traffic.value.records}
          highlighted={stationId}
          currentMinute={traffic.minute}
          live
          preferenceScope={'tpv:' + placeId + ':' + (layoutId || 'custom')}
          followStationOrder
          onOpenTrain={traffic.openTrain}
        />
      )}
    </section>
  );
}
