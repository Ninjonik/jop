'use client';
import type { EddRecord } from '@/lib/dis/records';
import {
  alignClockMinute,
  clockSchema,
  formatMinute,
  shiftTimetable,
  stationKey,
  unfoldStops,
  type Timetable,
  type TimetableInput,
} from '@/lib/dis/timetable';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
import { AeroIcon } from '../ui/AeroIcon';

export function TimetableGraph({
  trains,
  stations,
  records = [],
  highlighted = '',
  currentMinute,
  editableId,
  onEdit,
  onSelect,
}: {
  trains: Timetable[];
  stations: { stationId: string; name: string }[];
  records?: EddRecord[];
  highlighted?: string;
  currentMinute?: number;
  editableId?: string;
  onEdit?: (train: TimetableInput) => void;
  onSelect?: (train: Timetable) => void;
}) {
  const t = useTranslation();
  const [timeScale, setTimeScale] = useState(4);
  const [stationScale, setStationScale] = useState(80);
  const [selectedStation, setSelectedStation] = useState(highlighted);
  const [drag, setDrag] = useState<{
    x: number;
    trainId: string;
    stop?: number;
    field?: 'arrival' | 'departure';
  } | null>(null);
  const schedules = trains
    .filter((train) =>
      train.stops.every(
        (stop) =>
          clockSchema.safeParse(stop.arrival).success &&
          clockSchema.safeParse(stop.departure).success,
      ),
    )
    .map((train) => ({ train, stops: unfoldStops(train.stops) }));
  const minimum =
    Math.floor(Math.min(...schedules.map((s) => s.stops[0].arrivalMinute), 1440) / 60) * 60;
  const maximum = Math.max(minimum + 60, ...schedules.map((s) => s.stops.at(-1)!.departureMinute));
  const width = Math.max(900, 200 + (maximum - minimum) * timeScale);
  const height = Math.max(260, 65 + stations.length * stationScale);
  const x = (minute: number) => 180 + (minute - minimum) * timeScale;
  const y = (id: string) =>
    60 + stations.findIndex((s) => stationKey(s.stationId) === stationKey(id)) * stationScale;
  const visible = (id: string) => stations.some((s) => stationKey(s.stationId) === stationKey(id));
  const actual = (train: Timetable) => records.filter((r) => r.trainNumber === train.trainNumber);
  const current =
    currentMinute !== undefined && currentMinute < minimum && maximum >= 1440
      ? currentMinute + 1440
      : currentMinute;
  function finishDrag(event: React.PointerEvent<SVGSVGElement>) {
    const start = drag;
    setDrag(null);
    const train = trains.find((train) => train.$id === start?.trainId);
    if (!start || !train || !onEdit) return;
    const delta = Math.round((event.clientX - start.x) / timeScale);
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
          : stop.arrivalMinute;
      const upper =
        field === 'arrival'
          ? stop.departureMinute
          : (stops[start.stop + 1]?.arrivalMinute ?? stop.departureMinute + 720);
      const time = formatMinute(Math.max(lower, Math.min(upper, minute)));
      onEdit({
        ...train,
        stops: train.stops.map((s, i) => (i === start.stop ? { ...s, [field]: time } : s)),
      });
    }
  }
  return (
    <div className="timetable-graph">
      <div className="ribbon-bar flex-wrap">
        <strong>{t('Traťová poloha vlakov')}</strong>
        <button className="aero-btn" onClick={() => setTimeScale(Math.min(20, timeScale * 1.25))}>
          <AeroIcon name="zoomIn" />
          {t('Čas +')}
        </button>
        <button className="aero-btn" onClick={() => setTimeScale(Math.max(1, timeScale / 1.25))}>
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
            onEdit
              ? 'Potiahnite čiaru pre posun celého vlaku; body upravujú jednotlivé časy. Zmeny potvrďte uložením.'
              : 'Bodkovaná čiara: plán. Plná čiara a body: hlásenia EDD. Kliknutím zobrazíte vlak.',
          )}
        </span>
      </div>
      <div className="timetable-graph-scroll">
        {!schedules.length ? (
          <p className="p-3">{t('Pre zobrazenie grafu vyplňte stanice a časy vlaku.')}</p>
        ) : (
          <svg
            width={width}
            height={height}
            aria-label={t('Časový graf vlakov podľa GVD a EDD')}
            onPointerUp={finishDrag}
            onPointerCancel={() => {
              setDrag(null);
            }}
          >
            {Array.from(
              { length: Math.ceil((maximum - minimum) / 10) + 1 },
              (_, i) => minimum + i * 10,
            ).map((minute) => (
              <g key={minute}>
                <line
                  x1={x(minute)}
                  x2={x(minute)}
                  y1={38}
                  y2={height - 20}
                  stroke="var(--tpv-grid-line)"
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
                    selectedStation === station.stationId ? 'var(--sig-green)' : 'var(--sig-orange)'
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
              const color = train.$id === editableId ? 'var(--sig-red)' : 'var(--sig-blue)';
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
                      .filter((e) => clockSchema.safeParse(e.time).success)
                      .map((e) => ({
                        minute: alignClockMinute(e.time, e.reference),
                        station: stop.station,
                      })),
                  ),
              );
              const labelStop = stops.find((s) => visible(s.station));
              return (
                <g key={train.$id}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${train.trainType} ${train.trainNumber}`}
                    onClick={() => onSelect?.(train)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSelect?.(train);
                    }}
                    onPointerDown={(e) => {
                      if (!onEdit || train.$id !== editableId || e.button !== 0) return;
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({ x: e.clientX, trainId: train.$id });
                    }}
                    style={{ cursor: train.$id === editableId ? 'ew-resize' : 'pointer' }}
                  >
                    <polyline
                      points={points.join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
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
                  {train.$id === editableId &&
                    stops.map(
                      (stop, index) =>
                        visible(stop.station) &&
                        (['arrival', 'departure'] as const).map((field) => (
                          <circle
                            key={`${index}/${field}`}
                            cx={x(field === 'arrival' ? stop.arrivalMinute : stop.departureMinute)}
                            cy={
                              y(stop.station) +
                              (stop.arrival === stop.departure ? (field === 'arrival' ? -4 : 4) : 0)
                            }
                            r={5}
                            fill={color}
                            stroke="var(--aero-panel-bg)"
                            style={{ cursor: 'ew-resize' }}
                            onPointerDown={(e) => {
                              if (!onEdit || train.$id !== editableId || e.button !== 0) return;
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              setDrag({ x: e.clientX, trainId: train.$id, stop: index, field });
                            }}
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
        )}
      </div>
    </div>
  );
}
