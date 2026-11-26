'use client';
import { recordedEddTimeSchema } from '@/lib/dis/edd';
import { parseCompactClock } from '@/lib/dis/gvd-running-times';
import { downloadGvd } from '@/lib/dis/gvd-tools';
import type { EddRecord } from '@/lib/dis/records';
import {
  alignClockMinute,
  changeStopTime,
  checkTimetableConflicts,
  clockMinutes,
  clockSchema,
  completeEndpointTimes,
  formatMinute,
  shiftTimetable,
  stationKey,
  unfoldStops,
  type Timetable,
  type TimetableInput,
} from '@/lib/dis/timetable';
import { preferenceHash, useUserPreference } from '@/lib/dis/use-user-preference';
import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';

export function TimetableGraph({
  trains,
  stations: incomingStations,
  records = [],
  highlighted = '',
  currentMinute,
  editableId,
  onEdit,
  onSelect,
  stationPositions,
  preferenceScope = 'graph',
}: {
  trains: Timetable[];
  stations: { stationId: string; name: string }[];
  records?: EddRecord[];
  highlighted?: string;
  currentMinute?: number;
  editableId?: string;
  onEdit?: (train: TimetableInput) => void;
  onSelect?: (train: Timetable) => void;
  stationPositions?: Record<string, number>;
  preferenceScope?: string;
}) {
  const t = useTranslation();
  const [preferences, setPreferences, preferenceError] = useUserPreference(
    `ncp:${preferenceScope}:${preferenceHash(
      incomingStations
        .map((s) => s.stationId)
        .sort()
        .join('|'),
    )}`,
    {
      onlySelected: false,
      dragEnabled: false,
      reverse: false,
      timeScale: 5,
      stationScale: 60,
      snapMinutes: 1,
      order: incomingStations.map((s) => s.stationId),
    },
  );
  const orderedIds = [
    ...preferences.order.filter((id) => incomingStations.some((s) => s.stationId === id)),
    ...incomingStations
      .filter((s) => !preferences.order.includes(s.stationId))
      .map((s) => s.stationId),
  ];
  const stations = (preferences.reverse ? [...orderedIds].reverse() : orderedIds).map((id) =>
    incomingStations.find((s) => s.stationId === id)!,
  );
  const timeScale = Math.max(0.2, Math.min(20, preferences.timeScale));
  const setTimeScale = (timeScale: number) => setPreferences({ timeScale });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [fullDay, setFullDay] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [direction, setDirection] = useState('');
  const onlySelected = preferences.onlySelected;
  const setOnlySelected = (onlySelected: boolean) => setPreferences({ onlySelected });
  const [selectedTrainId, setSelectedTrainId] = useState(editableId || '');
  const [reference, setReference] = useState('');
  const [referenceMinute, setReferenceMinute] = useState<number>();
  const [hover, setHover] = useState('');
  const [dragDelta, setDragDelta] = useState(0);
  const dragEnabled = preferences.dragEnabled;
  const setDragEnabled = (dragEnabled: boolean) => setPreferences({ dragEnabled });
  const [colours, setColours] = useState<Record<string, string>>({});
  const activeId = editableId || selectedTrainId;
  const activeTrain = trains.find((train) => train.$id === activeId);
  const categories = [...new Set(trains.map((train) => train.trainType))];
  const stationIndex = (id: string) =>
    stations.findIndex((station) => stationKey(station.stationId) === stationKey(id));
  const stationScale = Math.max(40, Math.min(180, preferences.stationScale));
  const setStationScale = (stationScale: number) => setPreferences({ stationScale });
  const snapMinutes = Math.max(0.5, Math.min(30, preferences.snapMinutes));
  const setSnapMinutes = (snapMinutes: number) => setPreferences({ snapMinutes });
  const scroll = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [selectedStation, setSelectedStation] = useState(highlighted);
  const [drag, setDrag] = useState<{
    x: number;
    scrollLeft: number;
    trainId: string;
    stop?: number;
    field?: 'arrival' | 'departure';
  } | null>(null);
  const validSchedules = useMemo(
    () =>
      trains
        .map((train) => ({ ...train, stops: completeEndpointTimes(train.stops) }))
        .filter(
          (train) =>
            train.stops.length >= 2 &&
            train.stops.every(
              (stop) =>
                clockSchema.safeParse(stop.arrival).success &&
                clockSchema.safeParse(stop.departure).success,
            ),
        )
        .map((train) => ({ train, stops: unfoldStops(train.stops) })),
    [trains],
  );
  const graphIssues = useMemo(() => {
    const selected = validSchedules.find((item) => item.train.$id === activeId);
    if (!selected) return [];
    const report = checkTimetableConflicts(
      selected.train,
      validSchedules
        .filter(
          (item) =>
            item.train.$id !== activeId &&
            (!item.train.planning || item.train.planning.status === 'active'),
        )
        .map((item) => item.train),
    );
    return [...report.conflicts, ...report.warnings];
  }, [validSchedules, activeId]);
  const schedules = validSchedules.filter(
    ({ train }) =>
      (!search ||
        (train.trainType + ' ' + train.trainNumber)
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase())) &&
      (!category || train.trainType === category) &&
      (!onlySelected || train.$id === activeId) &&
      (!direction ||
        (stationIndex(train.stops.at(-1)!.station) >= stationIndex(train.stops[0].station)
          ? 'forward'
          : 'reverse') === direction),
  );
  const minimum = fullDay
    ? 0
    : Math.floor(Math.min(...validSchedules.map((s) => s.stops[0].arrivalMinute), 1440) / 60) * 60;
  const maximum = Math.max(
    fullDay ? 1440 : minimum + 60,
    ...validSchedules.map((s) => s.stops.at(-1)!.departureMinute),
  );
  const tickMinutes =
    [5, 10, 15, 30, 60, 120, 180, 240, 360].find((minutes) => minutes * timeScale >= 55) || 360;
  const width = Math.max(420, 200 + (maximum - minimum) * timeScale);
  const height = Math.max(260, 65 + stations.length * stationScale);
  const distances = stations.map((s) => stationPositions?.[s.stationId]);
  const proportional =
    stations.length >= 2 &&
    distances.every((d) => d !== undefined && Number.isFinite(d)) &&
    new Set(distances).size === distances.length;
  const minDistance = Math.min(...distances.filter((d): d is number => d !== undefined));
  const maxDistance = Math.max(...distances.filter((d): d is number => d !== undefined));
  const x = (minute: number) => 180 + (minute - minimum) * timeScale;
  const y = (id: string) =>
    proportional
      ? 60 +
        ((stationPositions![stations[0].stationId] > stationPositions![stations.at(-1)!.stationId]
          ? maxDistance - stationPositions![id]
          : stationPositions![id] - minDistance) /
          (maxDistance - minDistance)) *
          (height - 100)
      : 60 + stations.findIndex((s) => stationKey(s.stationId) === stationKey(id)) * stationScale;
  const visible = (id: string) => stations.some((s) => stationKey(s.stationId) === stationKey(id));
  const actual = (train: Timetable) => records.filter((r) => r.trainNumber === train.trainNumber);
  const cursorMinute = referenceMinute ?? currentMinute;
  const current =
    cursorMinute !== undefined && cursorMinute < minimum && maximum >= 1440
      ? cursorMinute + 1440
      : cursorMinute;
  function zoom(next: number, anchor = (scroll.current?.clientWidth || 900) / 2) {
    const container = scroll.current;
    const minuteOffset = ((container?.scrollLeft || 0) + anchor - 180) / timeScale;
    const scale = Math.max(0.2, Math.min(20, next));
    setTimeScale(scale);
    requestAnimationFrame(() => {
      if (container) container.scrollLeft = 180 + minuteOffset * scale - anchor;
    });
  }
  useEffect(() => {
    const container = scroll.current;
    if (!container) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        zoom(
          timeScale * (event.deltaY < 0 ? 1.2 : 1 / 1.2),
          event.clientX - container.getBoundingClientRect().left,
        );
      } else if (!event.shiftKey) {
        event.preventDefault();
        container.scrollLeft += event.deltaY;
      }
    };
    container.addEventListener('wheel', wheel, { passive: false });
    return () => container.removeEventListener('wheel', wheel);
  });
  function chooseTrain(train: Timetable) {
    setSelectedTrainId(train.$id);
    onSelect?.(train);
    setInspectorOpen(true);
  }
  function showHover(
    train: Timetable,
    stops: ReturnType<typeof unfoldStops>,
    event: React.PointerEvent<SVGElement>,
  ) {
    const minute =
      minimum +
      (event.clientX -
        (event.currentTarget.closest('svg')?.getBoundingClientRect().left || 0) -
        180) /
        timeScale;
    const nearest = stops
      .filter((stop) => visible(stop.station))
      .reduce<(typeof stops)[number] | undefined>(
        (best, stop) =>
          !best || Math.abs(stop.arrivalMinute - minute) < Math.abs(best.arrivalMinute - minute)
            ? stop
            : best,
        undefined,
      );
    if (nearest)
      setHover(
        `${train.trainType} ${train.trainNumber} · ${stations.find((s) => stationKey(s.stationId) === stationKey(nearest.station))?.name || nearest.station} · ${nearest.arrival} – ${nearest.departure}`,
      );
  }
  function colour(train: Timetable) {
    if (colours[train.$id]) return colours[train.$id];
    if (train.$id === activeId) return 'var(--sig-red)';
    if (graphIssues.some((issue) => issue.trains.includes(train.trainNumber)))
      return 'var(--sig-orange)';
    return /^(R|Ex|EC|IC|EN)/.test(train.trainType)
      ? 'var(--sig-orange)'
      : /^(Mn|Pn|Nex|Vleč)/.test(train.trainType)
        ? 'var(--sig-green)'
        : 'var(--sig-blue)';
  }
  function beginDrag(
    event: React.PointerEvent<SVGElement>,
    train: Timetable,
    stop?: number,
    field?: 'arrival' | 'departure',
  ) {
    if (!onEdit || !dragEnabled || train.$id !== editableId || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      x: event.clientX,
      scrollLeft:
        (event.currentTarget.closest('.timetable-graph-scroll') as HTMLDivElement | null)
          ?.scrollLeft || 0,
      trainId: train.$id,
      stop,
      field,
    });
    setDragDelta(0);
  }
  function finishDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (pan.current) {
      pan.current = null;
      return;
    }
    const start = drag;
    setDrag(null);
    setDragDelta(0);
    const train = trains.find((train) => train.$id === start?.trainId);
    if (!start || !train || !onEdit) return;
    const delta =
      Math.round(
        (event.clientX - start.x + (scroll.current?.scrollLeft || 0) - start.scrollLeft) /
          timeScale /
          snapMinutes,
      ) * snapMinutes;
    if (!delta) return;
    if (start.stop === undefined) onEdit(shiftTimetable(train, delta));
    else {
      const stops = unfoldStops(train.stops);
      const stop = stops[start.stop];
      const field = start.field!;
      const minute = (field === 'arrival' ? stop.arrivalMinute : stop.departureMinute) + delta;
      // Keep individual event dragging inside its neighboring events. Whole-train
      // dragging handles crossing midnight without introducing a spurious new day.
      const lower =
        field === 'arrival'
          ? (stops[start.stop - 1]?.departureMinute ?? stop.arrivalMinute - 720)
          : start.stop === 0
            ? stop.arrivalMinute - 720
            : stop.arrivalMinute;
      const upper =
        field === 'arrival'
          ? start.stop === stops.length - 1
            ? stop.departureMinute + 720
            : stop.departureMinute
          : (stops[start.stop + 1]?.arrivalMinute ?? stop.departureMinute + 720);
      const time = formatMinute(Math.max(lower, Math.min(upper, minute)));
      onEdit(changeStopTime(train, start.stop, field, time));
    }
  }
  return (
    <div className="timetable-graph">
      <div className="ribbon-bar flex-wrap gvd-graph-toolbar">
        <strong>{t('Nákresný cestovný poriadok')}</strong>
        <button
          className="aero-btn"
          onClick={() => setPreferences({ reverse: !preferences.reverse })}
        >
          {t('Obrátiť poradie dopravní')}
        </button>
        {preferenceError && <span role="status">{t(preferenceError)}</span>}
        <button
          className="aero-btn"
          onClick={() => {
            if (!svg.current) return;
            const copy = svg.current.cloneNode(true) as SVGSVGElement;
            copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            // Resolve theme tokens so the standalone file retains its colours.
            const original = [svg.current, ...svg.current.querySelectorAll('*')];
            const cloned = [copy, ...copy.querySelectorAll('*')];
            original.forEach((element, i) => {
              const style = getComputedStyle(element);
              cloned[i].setAttribute(
                'style',
                `fill:${style.fill};stroke:${style.stroke};font-family:${style.fontFamily};font-size:${style.fontSize}`,
              );
            });
            downloadGvd('gvd.svg', new XMLSerializer().serializeToString(copy), 'image/svg+xml');
          }}
        >
          {t('Export SVG')}
        </button>
        <button className="aero-btn" onClick={() => window.print()}>
          {t('Tlač / PDF')}
        </button>
        <button className="aero-btn" onClick={() => zoom(timeScale * 1.25)}>
          <AeroIcon name="zoomIn" />
          {t('Čas +')}
        </button>
        <button className="aero-btn" onClick={() => zoom(timeScale / 1.25)}>
          <AeroIcon name="zoomOut" />
          {t('Čas −')}
        </button>
        <button
          className="aero-btn"
          onClick={() => setStationScale(Math.min(180, stationScale + 20))}
        >
          {t('Stanice +')}
        </button>
        <button
          className="aero-btn"
          onClick={() => setStationScale(Math.max(40, stationScale - 20))}
        >
          {t('Stanice −')}
        </button>
        <span>
          {t(
            onEdit && dragEnabled
              ? 'Potiahnite čiaru pre posun celého vlaku; body upravujú jednotlivé časy. Zmeny potvrďte uložením.'
              : 'Bodkovaná čiara: plán. Plná čiara a body: hlásenia EDD. Kliknutím zobrazíte vlak.',
          )}
        </span>
        <label>
          {t('Prichytenie (min)')}{' '}
          <select
            className="aero-select"
            value={snapMinutes}
            onChange={(e) => setSnapMinutes(Number(e.target.value))}
          >
            {[1, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          className="aero-btn"
          onClick={() => {
            const available = scroll.current?.clientWidth || 900;
            setTimeScale(Math.max(0.2, Math.min(20, (available - 220) / (maximum - minimum))));
          }}
        >
          {t('Prispôsobiť čas')}
        </button>
        <span>{t(proportional ? 'Vzdialenostná mierka' : 'Schematické rozstupy staníc')}</span>
      </div>
      <div className="gvd-graph-controls">
        {activeTrain && (
          <button
            className="aero-btn"
            aria-expanded={inspectorOpen}
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            {t('Časy vybraného vlaku')}
          </button>
        )}
        <label>
          {t('Vyhľadať vlak')}
          <input
            className="aero-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          {t('Kategória')}
          <select
            className="aero-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t('Všetky')}</option>
            {categories.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Smer')}
          <select
            className="aero-select"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="">{t('Oba smery')}</option>
            <option value="forward">{t('Tam')}</option>
            <option value="reverse">{t('Spätný smer')}</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(e) => setOnlySelected(e.target.checked)}
          />
          {t('Iba vybraný vlak')}
        </label>
        {onEdit && (
          <label>
            <input
              type="checkbox"
              checked={dragEnabled}
              onChange={(e) => setDragEnabled(e.target.checked)}
            />
            {t('Upravovať ťahaním')}
          </label>
        )}
        {activeId && (
          <label>
            {t('Farba vlaku')}
            <input
              type="color"
              aria-label={t('Farba vlaku')}
              value={colours[activeId] || '#b74040'}
              onChange={(e) => setColours({ ...colours, [activeId]: e.target.value })}
            />
          </label>
        )}
        <label>
          {t('Prejsť na čas')}
          <input
            className="aero-input"
            type="time"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <button
          className="aero-btn"
          disabled={!clockSchema.safeParse(reference).success}
          onClick={() => {
            const minute = clockMinutes(reference);
            const aligned = minute < minimum && maximum >= 1440 ? minute + 1440 : minute;
            setReferenceMinute(aligned);
            if (scroll.current)
              scroll.current.scrollLeft = Math.max(0, x(aligned) - scroll.current.clientWidth / 2);
          }}
        >
          {t('Zobraziť čas')}
        </button>
        <button
          className="aero-btn"
          onClick={() => {
            setFullDay(!fullDay);
            const available = scroll.current?.clientWidth || 900;
            setTimeScale(
              Math.max(
                0.2,
                (available - 220) /
                  (fullDay
                    ? Math.max(
                        60,
                        Math.max(
                          ...validSchedules.map((s) => s.stops.at(-1)!.departureMinute),
                          60,
                        ) -
                          Math.floor(
                            Math.min(...validSchedules.map((s) => s.stops[0].arrivalMinute), 1440) /
                              60,
                          ) *
                            60,
                      )
                    : Math.max(1440, maximum)),
              ),
            );
            if (scroll.current) scroll.current.scrollLeft = 0;
          }}
        >
          {t(fullDay ? 'Rozsah vlakov' : 'Celý deň')}
        </button>
      </div>
      {!!graphIssues.length && (
        <details className="gvd-graph-conflicts">
          <summary>
            {t('Možné súbehy vybraného vlaku')}: {graphIssues.length}
          </summary>
          <ul>
            {graphIssues.map((issue, i) => (
              <li key={i}>{t(issue.message)}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="gvd-graph-body">
        <div className="timetable-graph-scroll gvd-graph-canvas" ref={scroll}>
          {!schedules.length ? (
            <p className="p-3">{t('Pre zobrazenie grafu vyplňte stanice a časy vlaku.')}</p>
          ) : (
            <div style={{ width, height, position: 'relative' }}>
              <div className="gvd-sticky-time" style={{ width }}>
                <svg width={width} height={36} aria-hidden="true">
                  <rect width={width} height={36} fill="var(--aero-panel-bg)" />
                  {Array.from(
                    { length: Math.ceil((maximum - minimum) / tickMinutes) + 1 },
                    (_, i) => minimum + i * tickMinutes,
                  ).map((minute) => (
                    <text
                      key={minute}
                      x={x(minute)}
                      y={24}
                      textAnchor="middle"
                      fill="var(--aero-text)"
                      fontSize={11}
                    >
                      {formatMinute(minute)}
                      {minute >= 1440 ? ' +1' : ''}
                    </text>
                  ))}
                </svg>
              </div>
              <svg
                ref={svg}
                width={width}
                height={height}
                aria-label={t('Časový graf vlakov podľa GVD a EDD')}
                onPointerUp={finishDrag}
                onPointerDown={(e) => {
                  if (
                    e.button !== 0 ||
                    !scroll.current ||
                    (e.target as Element).closest('[role="button"]')
                  )
                    return;
                  pan.current = {
                    x: e.clientX,
                    y: e.clientY,
                    left: scroll.current.scrollLeft,
                    top: scroll.current.scrollTop,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (drag)
                    setDragDelta(
                      Math.round(
                        (e.clientX - drag.x + (scroll.current?.scrollLeft || 0) - drag.scrollLeft) /
                          timeScale /
                          snapMinutes,
                      ) * snapMinutes,
                    );
                  if (!pan.current || !scroll.current) return;
                  scroll.current.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
                  scroll.current.scrollTop = pan.current.top - (e.clientY - pan.current.y);
                }}
                onPointerCancel={() => {
                  pan.current = null;
                  setDrag(null);
                  setDragDelta(0);
                }}
              >
                <rect width={width} height={height} fill="var(--tpv-bg)" />
                {Array.from(
                  { length: Math.ceil((maximum - minimum) / tickMinutes) + 1 },
                  (_, i) => minimum + i * tickMinutes,
                ).map((minute) => (
                  <g key={minute}>
                    <line
                      x1={x(minute)}
                      x2={x(minute)}
                      y1={38}
                      y2={height - 20}
                      stroke="var(--tpv-grid-line)"
                      strokeWidth={minute % 60 === 0 ? 1.5 : 0.5}
                    />
                    <text x={x(minute) - 15} y={25} fill="var(--aero-text)" fontSize={11}>
                      {formatMinute(minute)}
                      {minute >= 1440 ? ' +1' : ''}
                    </text>
                  </g>
                ))}
                {stations.map((station) => (
                  <g
                    key={station.stationId}
                    role="button"
                    tabIndex={0}
                    aria-label={t('Zvýrazniť stanicu {0}', station.name)}
                    onClick={() => setSelectedStation(station.stationId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedStation(station.stationId);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <line
                      x1={175}
                      x2={width - 20}
                      y1={y(station.stationId)}
                      y2={y(station.stationId)}
                      stroke={
                        selectedStation === station.stationId
                          ? 'var(--sig-green)'
                          : 'var(--tpv-grid-line)'
                      }
                    />
                    <circle
                      cx={8}
                      cy={y(station.stationId) - 9}
                      r={3}
                      fill={
                        selectedStation === station.stationId
                          ? 'var(--sig-green)'
                          : 'var(--aero-text-muted)'
                      }
                    />
                    <text x={18} y={y(station.stationId) - 5} fontSize={11} fill="var(--aero-text)">
                      {station.name}
                    </text>
                  </g>
                ))}
                {schedules.map(({ train, stops }) => {
                  const color = colour(train);
                  const points = stops.flatMap((stop) =>
                    visible(stop.station)
                      ? [
                          `${x(stop.arrivalMinute)},${y(stop.station)}`,
                          `${x(stop.departureMinute)},${y(stop.station)}`,
                        ]
                      : [],
                  );
                  const events = stops.flatMap((stop) =>
                    actual(train)
                      .filter(
                        (r) =>
                          stationKey(r.stationId) === stationKey(stop.station) &&
                          r.schedArrival === stop.arrival,
                      )
                      .flatMap((r) =>
                        [
                          { time: r.actualArrival, reference: stop.arrivalMinute },
                          { time: r.actualDeparture, reference: stop.departureMinute },
                        ]
                          .filter((e) => recordedEddTimeSchema.safeParse(e.time).success)
                          .map((e) => ({
                            minute: alignClockMinute(e.time, e.reference),
                            station: stop.station,
                          })),
                      ),
                  );
                  const labelStop = stops.find((s) => visible(s.station));
                  return (
                    <g key={train.$id} opacity={activeId && train.$id !== activeId ? 0.65 : 1}>
                      {drag?.trainId === train.$id && dragDelta !== 0 && (
                        <polyline
                          points={points.join(' ')}
                          transform={
                            drag.stop === undefined
                              ? `translate(${dragDelta * timeScale} 0)`
                              : undefined
                          }
                          stroke={color}
                          strokeWidth={4}
                          strokeDasharray="5 3"
                          fill="none"
                          pointerEvents="none"
                          opacity={0.5}
                        />
                      )}
                      <g
                        role="button"
                        tabIndex={0}
                        aria-label={`${train.trainType} ${train.trainNumber}`}
                        onClick={() => {
                          if (!dragDelta) chooseTrain(train);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            chooseTrain(train);
                          }
                        }}
                        onPointerDown={(e) => beginDrag(e, train)}
                        onPointerMove={(event) => showHover(train, stops, event)}
                        style={{
                          cursor: dragEnabled && train.$id === editableId ? 'ew-resize' : 'pointer',
                        }}
                      >
                        <polyline
                          points={points.join(' ')}
                          fill="none"
                          stroke={color}
                          strokeWidth={train.$id === activeId ? 2.5 : 1.5}
                          strokeDasharray={onEdit ? undefined : '3 3'}
                        />
                        <polyline
                          points={points.join(' ')}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={12}
                        />
                        <title>
                          {train.trainType} {train.trainNumber}
                        </title>
                        {labelStop && (
                          <text
                            x={x(labelStop.departureMinute) + 4}
                            y={y(labelStop.station) - 10}
                            fill={color}
                            fontSize={11}
                          >
                            {train.trainNumber}
                          </text>
                        )}
                      </g>
                      <polyline
                        points={events
                          .filter((e) => visible(e.station))
                          .map((e) => `${x(e.minute)},${y(e.station)}`)
                          .join(' ')}
                        fill="none"
                        stroke="var(--aero-text)"
                        strokeWidth={2}
                      />
                      {train.$id === activeId &&
                        timeScale >= 5 &&
                        stops
                          .filter((stop) => visible(stop.station))
                          .map((stop, i) => (
                            <text
                              key={i}
                              x={x(stop.departureMinute) + 7}
                              y={y(stop.station) - 7}
                              fill={color}
                              fontSize={10}
                              pointerEvents="none"
                            >
                              {stop.arrival === stop.departure
                                ? stop.arrival
                                : stop.arrival + '–' + stop.departure}
                            </text>
                          ))}
                      {events
                        .filter((e) => visible(e.station))
                        .map((e, i) => (
                          <circle
                            key={i}
                            cx={x(e.minute)}
                            cy={y(e.station)}
                            r={3}
                            fill="var(--sig-green)"
                          />
                        ))}
                      {train.$id === activeId &&
                        stops.map(
                          (stop, index) =>
                            visible(stop.station) &&
                            (['arrival', 'departure'] as const).map((field) => (
                              <circle
                                key={`${index}/${field}`}
                                display={
                                  (index === 0 && field === 'arrival') ||
                                  (index === stops.length - 1 && field === 'departure')
                                    ? 'none'
                                    : undefined
                                }
                                cx={x(
                                  field === 'arrival' ? stop.arrivalMinute : stop.departureMinute,
                                )}
                                cy={
                                  y(stop.station) +
                                  (stop.arrival === stop.departure
                                    ? field === 'arrival'
                                      ? -4
                                      : 4
                                    : 0)
                                }
                                r={5}
                                fill={color}
                                stroke="var(--aero-panel-bg)"
                                style={{ cursor: 'ew-resize' }}
                                onPointerDown={(e) => beginDrag(e, train, index, field)}
                              >
                                <title>
                                  {t(field)} {stop[field]}
                                </title>
                              </circle>
                            )),
                        )}
                    </g>
                  );
                })}
                {current !== undefined && current >= minimum && current <= maximum && (
                  <g>
                    <line
                      x1={x(current)}
                      x2={x(current)}
                      y1={35}
                      y2={height - 20}
                      stroke="var(--tpv-cursor)"
                      strokeWidth={2}
                    />
                    <text x={x(current)} y={13} fontSize={11} fill="var(--tpv-cursor)">
                      {formatMinute(current)}
                    </text>
                  </g>
                )}
              </svg>
              <div className="gvd-sticky-stations" style={{ height }}>
                <strong>{t('Dopravňa')}</strong>
                {stations.map((station) => (
                  <button
                    key={station.stationId}
                    className="gvd-station-label"
                    style={{ top: y(station.stationId) - 14 }}
                    onClick={() => setSelectedStation(station.stationId)}
                  >
                    {station.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {inspectorOpen && activeTrain && (
          <aside className="gvd-graph-inspector" aria-label={t('Časy vybraného vlaku')}>
            <strong>
              {activeTrain.trainType} {activeTrain.trainNumber}
            </strong>
            <table className="aero-grid">
              <thead>
                <tr>
                  <th>{t('Dopravňa')}</th>
                  <th>{t('Príchod')}</th>
                  <th>{t('Odchod')}</th>
                </tr>
              </thead>
              <tbody>
                {activeTrain.stops.map((stop, index) => (
                  <tr key={index}>
                    <td>
                      {stations.find(
                        (station) => stationKey(station.stationId) === stationKey(stop.station),
                      )?.name || stop.station}
                    </td>
                    {(['arrival', 'departure'] as const).map((field) => (
                      <td key={field}>
                        <input
                          className="aero-input"
                          aria-label={t(field) + ' ' + (index + 1)}
                          disabled={
                            !onEdit ||
                            (index === 0 && field === 'arrival') ||
                            (index === activeTrain.stops.length - 1 && field === 'departure') ||
                            activeTrain.$id !== editableId ||
                            (stop.kind === 'pass' && field === 'departure' && index > 0)
                          }
                          placeholder="—"
                          value={
                            (index === 0 && field === 'arrival') ||
                            (index === activeTrain.stops.length - 1 && field === 'departure')
                              ? ''
                              : stop[field]
                          }
                          onChange={(event) =>
                            onEdit?.(changeStopTime(activeTrain, index, field, event.target.value))
                          }
                          onBlur={(event) => {
                            const time = parseCompactClock(event.target.value);
                            if (time !== event.target.value)
                              onEdit?.(changeStopTime(activeTrain, index, field, time));
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
        )}
      </div>
      <div className="gvd-graph-status" role="status">
        <span>
          {drag
            ? `${t('Posun časov')}: ${dragDelta > 0 ? '+' : ''}${dragDelta} min`
            : hover ||
              t('Kliknutím vyberte vlak. Kolieskom posúvate čas, Ctrl + koliesko mení mierku.')}
        </span>
        <span>
          {schedules.length} / {trains.length} · {t('Vlaky v GVD')}
        </span>
      </div>
    </div>
  );
}
