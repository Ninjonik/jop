'use client';
import { useTranslation } from '@/lib/i18n/client';

import { isPublicStation } from '@/lib/station/visibility';

import { AeroIcon } from '@/app/components/ui/AeroIcon';
import { disFetch } from '@/lib/dis/api-client';
import type { UserProfile } from '@/lib/dis/appwrite-client';
import { canAssignShiftRole, type PlannedShift, type ShiftPlan } from '@/lib/dis/shift-plan';
import type { Timetable } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useState } from 'react';

type Place = { placeId: string; name: string; hasTemplate: boolean };

export function ShiftPlanView({
  shift,
  canManage,
  onPlan,
}: {
  shift: PlannedShift;
  canManage: boolean;
  onPlan: (plan: ShiftPlan) => void;
}) {
  const t = useTranslation();
  const [editing, setEditing] = useState(false);
  const [placeId, setPlaceId] = useState(shift.plan?.placeId || '');
  const [selected, setSelected] = useState<string[]>(
    shift.plan?.trains.map((train) => train.$id) || [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const places = useDisResource<{ places: Place[] }>(canManage ? '/api/dis/places' : null, {
    places: [],
  });
  const staff = useDisResource<{ profiles: UserProfile[] }>(canManage ? '/api/dis/staff' : null, {
    profiles: [],
  });
  const timetables = useDisResource<{ timetables: Timetable[] }>(
    canManage && placeId ? `/api/dis/timetables?placeId=${encodeURIComponent(placeId)}` : null,
    { timetables: [] },
  );
  const editable = canManage && ['draft', 'open', 'active'].includes(shift.status);
  const plan = shift.plan;

  async function save(command: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await disFetch<{ plan: ShiftPlan }>('/api/dis/shifts', {
        method: 'POST',
        body: JSON.stringify({ ...command, id: shift.$id }),
      });
      onPlan(result.plan);
      if (command.command === 'plan') setEditing(false);
      setMessage('Plán zmeny bol uložený.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Plán sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  }

  function assignmentSelect(role: 'dispatcher' | 'driver', targetId: string) {
    const assignment = plan?.assignments.find(
      (item) => item.role === role && item.targetId === targetId,
    );
    if (!editable) return assignment?.userName || 'Neobsadené';
    const candidates = staff.value.profiles.filter((person) => canAssignShiftRole(person, role));
    return (
      <select
        className="aero-select"
        aria-label={`${role === 'dispatcher' ? t('Výpravca') : t('Rušňovodič')} – ${role === 'dispatcher' ? targetId : plan?.trains.find((train) => train.$id === targetId)?.trainNumber}`}
        disabled={busy || staff.loading || !!staff.error}
        value={assignment?.userId || ''}
        onChange={(event) =>
          void save({ command: 'assign', role, targetId, userId: event.target.value })
        }
      >
        <option value="">{t('Neobsadené')}</option>
        {assignment && !candidates.some((person) => person.userId === assignment.userId) && (
          <option value={assignment.userId}>
            {assignment.userName} {t('(nedostupný)')}
          </option>
        )}
        {candidates.map((person) => (
          <option key={person.userId} value={person.userId}>
            {person.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <section className="flex flex-col gap-2 border border-[var(--aero-panel-border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong>
          <AeroIcon name="table" /> {t('Grafikon a obsadenie zmeny')}{' '}
        </strong>
        {plan && (
          <span>
            {plan.placeName} · {plan.trains.length} {t('vlakov ·')} {plan.stations.length}{' '}
            {t('staníc')}{' '}
          </span>
        )}
        {editable && shift.status !== 'active' && !editing && (
          <button
            className="aero-btn"
            onClick={() => {
              setPlaceId(plan?.placeId || '');
              setSelected(plan?.trains.map((train) => train.$id) || []);
              setEditing(true);
            }}
          >
            <AeroIcon name="edit" />
            {plan ? t('Zmeniť grafikon') : t('Vybrať grafikon')}
          </button>
        )}
      </div>
      {(error || places.error || staff.error || timetables.error) && (
        <p role="alert" className="text-red-700">
          {t(error || places.error || staff.error || timetables.error)}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {editing && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save({ command: 'plan', placeId, timetableIds: selected });
          }}
        >
          <label className="flex flex-wrap items-center gap-2">
            {' '}
            {t('Sieť staníc')}{' '}
            <select
              className="aero-select"
              required
              value={placeId}
              disabled={busy || places.loading}
              onChange={(event) => {
                setPlaceId(event.target.value);
                setSelected([]);
              }}
            >
              <option value="">{t('Vyberte sieť')}</option>
              {places.value.places
                .filter((place) => place.hasTemplate)
                .map((place) => (
                  <option key={place.placeId} value={place.placeId}>
                    {place.name}
                  </option>
                ))}
            </select>
          </label>
          <p>
            {t('Vyberte vlaky z uloženého GVD. Ich cestovné poriadky sa skopírujú do tejto zmeny.')}
          </p>
          {placeId && (
            <fieldset
              disabled={busy || timetables.loading || !!timetables.error}
              className="max-h-52 overflow-auto border border-[var(--aero-panel-border)] p-2"
            >
              <legend>{t('Vlaky v zmene')}</legend>
              {timetables.loading ? (
                <p>{t('Načítavam grafikon…')}</p>
              ) : timetables.value.timetables.length === 0 ? (
                <p>{t('Pre túto sieť nie sú uložené vlaky. Pridajte ich v tvorbe GVD.')}</p>
              ) : (
                timetables.value.timetables.map((train) => (
                  <label key={train.$id} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected.includes(train.$id)}
                      onChange={(event) =>
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, train.$id]
                            : previous.filter((id) => id !== train.$id),
                        )
                      }
                    />
                    {train.trainType} {train.trainNumber} · {train.stops[0].station} –{' '}
                    {train.stops.at(-1)?.station} · {train.stops[0].departure}–
                    {train.stops.at(-1)?.arrival}
                  </label>
                ))
              )}
            </fieldset>
          )}
          {plan && (
            <p>
              {' '}
              {t(
                'Priradenia pre zostávajúce stanice a vlaky sa zachovajú. Priradenia vyradených položiek sa odstránia.',
              )}{' '}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="aero-btn"
              disabled={
                busy || !placeId || !selected.length || !!timetables.error || timetables.loading
              }
            >
              <AeroIcon name="save" /> {t('Uložiť grafikon')}{' '}
            </button>
            <button
              type="button"
              className="aero-btn"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <AeroIcon name="close" /> {t('Zavrieť')}{' '}
            </button>
          </div>
        </form>
      )}
      {!plan ? (
        <p>
          {' '}
          {t(
            'Grafikon zatiaľ nie je vybraný. Po jeho uložení sa tu zobrazia stanice, vlaky a pridelení zamestnanci.',
          )}{' '}
        </p>
      ) : (
        <>
          <p>
            {' '}
            {t('Obsadené stanice:')}{' '}
            {plan.assignments.filter((item) => item.role === 'dispatcher').length}/
            {plan.stations.length} {t('· Obsadené vlaky:')}{' '}
            {plan.assignments.filter((item) => item.role === 'driver').length}/{plan.trains.length}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="overflow-auto">
              <table className="aero-grid w-full text-left">
                <caption className="text-left font-semibold">
                  <AeroIcon name="network" /> {t('Stanice a výpravcovia')}{' '}
                </caption>
                <thead>
                  <tr>
                    <th>{t('Stanica')}</th>
                    <th>{t('Výpravca')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.stations
                    .filter((station) => isPublicStation(station.stationId))
                    .map((station) => (
                      <tr key={station.stationId}>
                        <td>{station.name}</td>
                        <td>{assignmentSelect('dispatcher', station.stationId)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-auto">
              <table className="aero-grid w-full text-left">
                <caption className="text-left font-semibold">
                  <AeroIcon name="train" /> {t('Vlaky a rušňovodiči')}{' '}
                </caption>
                <thead>
                  <tr>
                    <th>{t('Vlak a trasa')}</th>
                    <th>{t('Rušňovodič')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.trains.map((train) => (
                    <tr key={train.$id}>
                      <td>
                        <strong>
                          {train.trainType} {train.trainNumber}
                        </strong>
                        <details>
                          <summary>
                            {train.stops[0].station} – {train.stops.at(-1)?.station}
                          </summary>
                          <ol>
                            {train.stops.map((stop, index) => (
                              <li key={index}>
                                {stop.station} · {stop.arrival}–{stop.departure} {t('· koľaj')}{' '}
                                {stop.track}
                              </li>
                            ))}
                          </ol>
                        </details>
                      </td>
                      <td>{assignmentSelect('driver', train.$id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {editable && (
            <p>
              {' '}
              {t(
                'Výpravca môže obsluhovať jednu stanicu. Rušňovodičovi možno prideliť viac vlakov; skontrolujte, či sa ich jazdy neprekrývajú.',
              )}{' '}
            </p>
          )}
        </>
      )}
    </section>
  );
}
