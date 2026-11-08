'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';
import type { EddRecord } from '@/lib/dis/records';
import {
  alignClockMinute,
  clockSchema,
  formatMinute,
  stationKey,
  unfoldStops,
  type Timetable,
} from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { isPublicStation } from '@/lib/station/visibility';
import { useEffect, useState } from 'react';

const colors = ['#2563eb', '#b45309', '#7c3aed', '#047857', '#be185d'];
export function TpvFullView({
  sessionId,
  stationId,
  placeId,
}: {
  sessionId: string;
  stationId: string;
  placeId: string;
}) {
  const { value, error, loading } = useDisResource<{ timetables: Timetable[] }>(
    `/api/dis/timetables?placeId=${encodeURIComponent(placeId)}`,
    { timetables: [] },
  );
  const { value: journal, error: journalError } = useDisResource<{ records: EddRecord[] }>(
    sessionId && stationId ? `/api/dis/edd?${new URLSearchParams({ sessionId, stationId })}` : null,
    { records: [] },
  );
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  const timetables = value.timetables.filter(
    (timetable) =>
      !stationId ||
      timetable.stops.some((stop) => stationKey(stop.station) === stationKey(stationId)),
  );
  const stations = [
    ...new Map(
      timetables.flatMap((timetable) =>
        timetable.stops
          .filter((stop) => isPublicStation(stop.station))
          .map((stop) => [stationKey(stop.station), stop.station] as const),
      ),
    ).values(),
  ];
  const schedules = timetables.map((timetable) => ({
    ...timetable,
    timed: unfoldStops(timetable.stops),
  }));
  const actualPoints = schedules.flatMap((timetable) =>
    journal.records
      .filter((record) => record.trainNumber === timetable.trainNumber)
      .flatMap((record) => {
        const stop = timetable.timed.find(
          (stop) =>
            stationKey(stop.station) === stationKey(record.stationId) &&
            stop.arrival === record.schedArrival,
        );
        if (!stop) return [];
        return [
          { time: record.actualArrival, reference: stop.arrivalMinute },
          { time: record.actualDeparture, reference: stop.departureMinute },
        ]
          .filter((event) => clockSchema.safeParse(event.time).success)
          .map((event, index) => ({
            id: `${record.$id}-${index}`,
            timetableId: timetable.$id,
            trainNumber: record.trainNumber,
            station: stop.station,
            time: event.time,
            minute: alignClockMinute(event.time, event.reference),
          }));
      }),
  );
  const minimum =
    Math.floor(
      Math.min(
        ...schedules.map((item) => item.timed[0].arrivalMinute),
        ...actualPoints.map((point) => point.minute),
        1440,
      ) / 60,
    ) * 60;
  const maximum = Math.max(
    minimum + 60,
    ...schedules.map((item) => item.timed.at(-1)!.departureMinute),
    ...actualPoints.map((point) => point.minute),
  );
  const width = Math.max(1000, (maximum - minimum) * 3 * zoom + 210);
  const height = Math.max(300, stations.length * 75 + 80);
  const x = (minute: number) => 180 + ((minute - minimum) / (maximum - minimum)) * (width - 220);
  const y = (station: string) =>
    65 + stations.findIndex((label) => stationKey(label) === stationKey(station)) * 75;
  const clock = now ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 : null;
  const current = clock === null ? null : clock < minimum && maximum >= 1440 ? clock + 1440 : clock;
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white text-xs">
      <div className="flex gap-2 p-2 border-b items-center">
        <strong>TPV — grafikony a hlásené časy EDD</strong>
        <button
          className="aero-btn"
          onClick={() => setZoom((previous) => Math.min(4, previous + 0.5))}
        >
          <AeroIcon name="zoomIn" />
          Priblížiť
        </button>
        <button
          className="aero-btn"
          onClick={() => setZoom((previous) => Math.max(1, previous - 0.5))}
        >
          <AeroIcon name="zoomOut" />
          Oddialiť
        </button>
        <span>{stationId || 'Celá sieť'}</span>
      </div>
      {(error || journalError) && (
        <p role="alert" className="p-2 text-red-700">
          {error || journalError}
        </p>
      )}
      <p className="p-2 text-slate-600">
        Čiary: plán GVD. Body: skutočné hlásenia vybranej stanice. Zvislá zelená čiara: aktuálny
        čas. Rozostupy staníc sú schematické.
      </p>
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <p>Načítavam grafikony...</p>
        ) : schedules.length === 0 ? (
          <p>Pre vybranú stanicu nie sú uložené grafikony. Vytvorte ich v Tvorbe GVD.</p>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Časový graf vlakov podľa GVD a EDD"
          >
            {Array.from(
              { length: Math.ceil((maximum - minimum) / 30) + 1 },
              (_, index) => minimum + index * 30,
            )
              .filter((minute) => minute <= maximum)
              .map((minute) => (
                <g key={minute}>
                  <line x1={x(minute)} y1={40} x2={x(minute)} y2={height - 30} stroke="#e2e8f0" />
                  <text x={x(minute) - 15} y={25} fill="#475569" fontSize={11}>
                    {formatMinute(minute)}
                    {minute >= 1440 ? ' +1' : ''}
                  </text>
                </g>
              ))}
            {stations.map((station) => (
              <g key={station}>
                <line
                  x1={175}
                  y1={y(station)}
                  x2={width - 20}
                  y2={y(station)}
                  stroke={stationKey(station) === stationKey(stationId) ? '#2563eb' : '#cbd5e1'}
                />
                <text x={5} y={y(station) - 8} fill="#334155" fontSize={12}>
                  {station}
                </text>
              </g>
            ))}
            {schedules.map((timetable, index) => (
              <g key={timetable.$id}>
                <polyline
                  points={timetable.timed
                    .flatMap((stop) => [
                      `${x(stop.arrivalMinute)},${y(stop.station)}`,
                      `${x(stop.departureMinute)},${y(stop.station)}`,
                    ])
                    .join(' ')}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                >
                  <title>{timetable.trainNumber}</title>
                </polyline>
                <text
                  x={x(timetable.timed[0].arrivalMinute) + 3}
                  y={y(timetable.timed[0].station) - 8}
                  fill={colors[index % colors.length]}
                  fontSize={11}
                >
                  {timetable.trainNumber}
                </text>
                {actualPoints
                  .filter((point) => point.timetableId === timetable.$id)
                  .map((point) => (
                    <circle
                      key={point.id}
                      cx={x(point.minute)}
                      cy={y(point.station)}
                      r={4}
                      fill={colors[index % colors.length]}
                    >
                      <title>
                        {point.trainNumber} {point.time} — hlásenie EDD
                      </title>
                    </circle>
                  ))}
              </g>
            ))}
            {current !== null && current >= minimum && current <= maximum && (
              <line
                x1={x(current)}
                x2={x(current)}
                y1={35}
                y2={height - 20}
                stroke="#059669"
                strokeWidth={2}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
