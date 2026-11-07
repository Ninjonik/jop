'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';

import { disFetch } from '@/lib/dis/api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import type { PlannedShift, ShiftPlan } from '@/lib/dis/shift-plan';
import { useCallback, useEffect, useState } from 'react';
import { ShiftPlanView } from './ShiftPlanView';

type Shift = PlannedShift;
type Booking = {
  $id: string;
  shiftId: string;
  userId: string;
  userName: string;
  assignedRole: string;
  assignedLocation: string;
  attendance: string;
};

export function ShiftManagementView() {
  const { profile, canManageStaff, canDriveTrain, canOperateStation } = useDisAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [role, setRole] = useState(canOperateStation ? 'dispatcher' : 'driver');
  const [location, setLocation] = useState('');

  const loadShifts = useCallback(async () => {
    const result = await disFetch<{ shifts: Shift[] }>('/api/dis/shifts');
    const loaded = result.shifts;
    setShifts(loaded);
    setSelectedShiftId((previous) =>
      loaded.some((shift) => shift.$id === previous) ? previous : loaded[0]?.$id || '',
    );
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
      loadShifts()
        .catch((error) =>
          setError(error instanceof Error ? error.message : 'Zmeny sa nepodarilo načítať.'),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(initial);
  }, [loadShifts]);

  useEffect(() => {
    if (!selectedShiftId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await disFetch<{ bookings: Booking[]; plan: ShiftPlan | null }>(
          `/api/dis/shifts?${new URLSearchParams({ shiftId: selectedShiftId })}`,
        );
        if (!cancelled) {
          setBookings(result.bookings);
          setShifts((previous) =>
            previous.map((shift) =>
              shift.$id === selectedShiftId ? { ...shift, plan: result.plan } : shift,
            ),
          );
        }
      } catch (error) {
        if (!cancelled)
          setError(error instanceof Error ? error.message : 'Registrácie sa nepodarilo načítať.');
      }
    };
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedShiftId]);

  async function manage(command: 'status' | 'attendance', id: string, value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disFetch<{ booking?: Booking }>('/api/dis/shifts', {
        method: 'POST',
        body: JSON.stringify({
          command,
          id,
          [command === 'status' ? 'status' : 'attendance']: value,
        }),
      });
      if (result.booking)
        setBookings((previous) =>
          previous.map((booking) => (booking.$id === id ? result.booking! : booking)),
        );
      await loadShifts();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Zmenu sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  }

  const currentShift = shifts.find((shift) => shift.$id === selectedShiftId);
  const currentBookings = bookings.filter((booking) => booking.shiftId === selectedShiftId);
  const alreadyRegistered = currentBookings.some((booking) => booking.userId === profile?.userId);

  async function createShift(event: React.FormEvent) {
    event.preventDefault();
    if (!canManageStaff || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await disFetch<{ shift: Shift }>('/api/dis/shifts', {
        method: 'POST',
        body: JSON.stringify({ command: 'create', title, date, startTime }),
      });
      await loadShifts();
      setSelectedShiftId(result.shift.$id);
      setTitle('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Zmenu sa nepodarilo vytvoriť.');
    } finally {
      setBusy(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (
      !profile ||
      !currentShift ||
      currentShift.status !== 'open' ||
      alreadyRegistered ||
      busy ||
      !location.trim()
    )
      return;
    if ((role === 'dispatcher' && !canOperateStation) || (role === 'driver' && !canDriveTrain))
      return;
    setBusy(true);
    setError(null);
    try {
      const result = await disFetch<{ booking: Booking }>('/api/dis/shifts', {
        method: 'POST',
        body: JSON.stringify({
          command: 'register',
          shiftId: currentShift.$id,
          assignedRole: role,
          assignedLocation: location,
        }),
      });
      setBookings((previous) => [
        ...previous.filter((item) => item.$id !== result.booking.$id),
        result.booking,
      ]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Registrácia sa nepodarila.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-white p-3 text-xs gap-3">
      <strong>Plánovač a registrácia šicht — 2,5 hodiny</strong>
      {currentShift && canManageStaff && (
        <div className="flex gap-2">
          {currentShift.status === 'open' && (
            <button
              className="aero-btn"
              disabled={busy}
              onClick={() => manage('status', currentShift.$id, 'active')}
            >
              <AeroIcon name="play" />
              Začať zmenu
            </button>
          )}
          {currentShift.status === 'active' && (
            <button
              className="aero-btn"
              disabled={busy}
              onClick={() => manage('status', currentShift.$id, 'completed')}
            >
              <AeroIcon name="confirm" />
              Ukončiť zmenu
            </button>
          )}
          {['open', 'active'].includes(currentShift.status) && (
            <button
              className="aero-btn"
              disabled={busy}
              onClick={() => manage('status', currentShift.$id, 'cancelled')}
            >
              <AeroIcon name="close" />
              Zrušiť zmenu
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {canManageStaff && (
        <form onSubmit={createShift} className="flex flex-wrap gap-2 items-center">
          <input
            aria-label="Názov zmeny"
            placeholder="Názov zmeny"
            className="aero-input"
            required
            maxLength={128}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            aria-label="Dátum zmeny"
            className="aero-input"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <input
            aria-label="Začiatok zmeny"
            className="aero-input"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <button className="aero-btn" disabled={busy || !title.trim()}>
            <AeroIcon name="calendar" />
            Vytvoriť zmenu
          </button>
        </form>
      )}
      {loading ? (
        <p>Načítavam...</p>
      ) : shifts.length === 0 ? (
        <p>Žiadne plánované zmeny.</p>
      ) : (
        <>
          <select
            aria-label="Vybrať zmenu"
            className="aero-select"
            value={selectedShiftId}
            onChange={(event) => setSelectedShiftId(event.target.value)}
          >
            {shifts.map((shift) => (
              <option key={shift.$id} value={shift.$id}>
                {shift.date} {shift.startTime}–{shift.endTime} — {shift.title} ({shift.status})
              </option>
            ))}
          </select>
          {currentShift && (
            <ShiftPlanView
              key={currentShift.$id}
              shift={currentShift}
              canManage={canManageStaff}
              onPlan={(plan) =>
                setShifts((previous) =>
                  previous.map((shift) =>
                    shift.$id === currentShift.$id ? { ...shift, plan } : shift,
                  ),
                )
              }
            />
          )}
          {currentShift?.status === 'open' &&
            !alreadyRegistered &&
            (canDriveTrain || canOperateStation) && (
              <form onSubmit={register} className="flex gap-2">
                <select
                  aria-label="Pracovná rola"
                  className="aero-select"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                >
                  <option value="dispatcher" disabled={!canOperateStation}>
                    Výpravca
                  </option>
                  <option value="driver" disabled={!canDriveTrain}>
                    Rušňovodič
                  </option>
                </select>
                <input
                  aria-label="Stanica alebo turnus"
                  placeholder="Stanica / turnus"
                  required
                  maxLength={64}
                  className="aero-input"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
                <button className="aero-btn" disabled={busy}>
                  <AeroIcon name="addUser" />
                  Zapísať sa na zmenu
                </button>
              </form>
            )}
          {alreadyRegistered && <p className="text-emerald-700">Na túto zmenu ste prihlásený.</p>}
          <table className="aero-grid w-full text-left">
            <thead>
              <tr>
                <th>Zamestnanec</th>
                <th>Rola</th>
                <th>Stanica / turnus</th>
                <th>Dochádzka</th>
              </tr>
            </thead>
            <tbody>
              {currentBookings.map((booking) => (
                <tr key={booking.$id}>
                  <td>{booking.userName}</td>
                  <td>{booking.assignedRole}</td>
                  <td>{booking.assignedLocation}</td>
                  <td>
                    {canManageStaff ? (
                      <select
                        aria-label={`Dochádzka ${booking.userName}`}
                        className="aero-select"
                        disabled={busy}
                        value={booking.attendance}
                        onChange={(event) => manage('attendance', booking.$id, event.target.value)}
                      >
                        {['registered', 'present', 'strike', 'excused'].map((attendance) => (
                          <option key={attendance}>{attendance}</option>
                        ))}
                      </select>
                    ) : (
                      booking.attendance
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
