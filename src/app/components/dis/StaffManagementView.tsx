'use client';

import { disFetch } from '@/lib/dis/api-client';
import type { UserProfile } from '@/lib/dis/appwrite-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import { useCallback, useEffect, useState } from 'react';

export function StaffManagementView() {
  const { canManageStaff } = useDisAuth();
  const [activeTab, setActiveTab] = useState<'employees' | 'cadets' | 'strikes'>('employees');
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      setError(null);
      const res = await disFetch<{ profiles: UserProfile[] }>('/api/dis/staff');
      setEmployees(res.profiles);
    } catch (err: unknown) {
      setError(
        'Chyba pri načítaní personálu: ' + (err instanceof Error ? err.message : 'Neznáma chyba'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(loadProfiles, 0);
    return () => clearTimeout(initial);
  }, [loadProfiles]);

  async function saveProfile() {
    if (!canManageStaff || !editing?.$id || saving) return;
    setSaving(true);
    try {
      await disFetch('/api/dis/staff', {
        method: 'POST',
        body: JSON.stringify({
          id: editing.$id,
          trainingStage: editing.trainingStage,
          strikes: editing.strikes,
          notes: editing.notes || '',
        }),
      });
      await loadProfiles();
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Profil sa nepodarilo uložiť.');
    } finally {
      setSaving(false);
    }
  }

  const roleTitleMap: Record<string, string> = {
    admin: 'Administrátor & Hl. Výpravca',
    dispatcher_manager: 'Vedúci výpravca',
    driver_manager: 'Vedúci rušňovodič',
    dispatcher_instructor: 'Inštruktor výpravca',
    driver_instructor: 'Inštruktor rušňovodič',
    dispatcher: 'Výpravca ZSSK',
    driver: 'Rušňovodič ZSSK',
    dispatcher_trainee: 'Výpravca v zácviku',
    driver_trainee: 'Kadet rušňovodič',
  };

  const filtered = employees.filter((emp) => {
    if (activeTab === 'cadets') return emp.trainingStage !== 'certified';
    if (activeTab === 'strikes') return (emp.strikes || 0) > 0;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden text-[12px] font-sans">
      {/* Top Filter and Action Bar */}
      <div className="h-8 bg-[var(--aero-ribbon-bg)] border-b border-[var(--aero-ribbon-border)] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-[var(--aero-text)]">Personálne oddelenie ZSSK</span>
          <span className="text-[var(--aero-text-muted)]">|</span>
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('employees')}
              className={`aero-btn ${activeTab === 'employees' ? 'active' : ''}`}
            >
              Zamestnanci
            </button>
            <button
              onClick={() => setActiveTab('cadets')}
              className={`aero-btn ${activeTab === 'cadets' ? 'active' : ''}`}
            >
              Kadetný program & Zácvik
            </button>
            <button
              onClick={() => setActiveTab('strikes')}
              className={`aero-btn ${activeTab === 'strikes' ? 'active' : ''}`}
            >
              Evidencia sankcií (Strikes)
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadProfiles}
            className="aero-btn text-[11px] flex items-center space-x-1"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Obnoviť</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {editing && canManageStaff && (
        <form
          className="p-3 border-b space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <strong>{editing.name} — Hodnotenie</strong>
          <label className="block">
            Fáza výcviku{' '}
            <select
              className="aero-select"
              value={editing.trainingStage}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  trainingStage: event.target.value as UserProfile['trainingStage'],
                })
              }
            >
              {['cadet', 'theory', 'simulator', 'exam', 'certified'].map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <label className="block">
            Strikes{' '}
            <input
              className="aero-input"
              type="number"
              min="0"
              max="10"
              step="1"
              required
              value={editing.strikes}
              onChange={(event) => setEditing({ ...editing, strikes: Number(event.target.value) })}
            />
          </label>
          <label className="block">
            Poznámky{' '}
            <textarea
              className="aero-input"
              maxLength={2000}
              value={editing.notes || ''}
              onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
            />
          </label>
          <button className="aero-btn" disabled={saving} type="submit">
            {saving ? 'Ukladám...' : 'Uložiť hodnotenie'}
          </button>
          <button
            className="aero-btn"
            disabled={saving}
            type="button"
            onClick={() => setEditing(null)}
          >
            Zrušiť
          </button>
        </form>
      )}

      {/* Main Content Grid View */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="text-xs text-slate-400 p-4 text-center">
            Načítavam zoznam personálu...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-slate-400 p-4 text-center italic">
            {activeTab === 'strikes'
              ? 'Žiadny zamestnanec nemá aktívne sankcie.'
              : activeTab === 'cadets'
                ? 'Žiadni aktívni kadeti alebo stážisti.'
                : 'Žiadny personál zatiaľ. Prihláste sa cez Roblox OAuth.'}
          </div>
        ) : (
          <table className="w-full border-collapse aero-grid text-left text-[11.5px]">
            <thead>
              <tr>
                <th className="py-1.5 px-2">Roblox ID</th>
                <th className="py-1.5 px-2">Meno & Roblox</th>
                <th className="py-1.5 px-2">Volací znak</th>
                <th className="py-1.5 px-2">Zaradenie / Rola</th>
                <th className="py-1.5 px-2">Fáza výcviku</th>
                <th className="py-1.5 px-2 text-center">Strikes</th>
                <th className="py-1.5 px-2 text-right">Správa oprávnení</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr key={emp.$id} className="hover:bg-blue-50/50">
                  <td className="py-1 px-2 font-mono text-[11px] text-[var(--aero-text-muted)]">
                    {emp.robloxUserId || emp.userId}
                  </td>
                  <td className="py-1 px-2 font-semibold">
                    {emp.name}{' '}
                    {emp.robloxUsername && (
                      <span className="font-normal text-[var(--aero-text-muted)]">
                        (@{emp.robloxUsername})
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-blue-800">{emp.callsign}</td>
                  <td className="py-1 px-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10.5px]">
                      {roleTitleMap[emp.role] || emp.role}
                    </span>
                  </td>
                  <td className="py-1 px-2">
                    {emp.trainingStage === 'certified' ? (
                      <span className="text-[var(--sig-green)] font-semibold">
                        Autorizovaný (Plný výkon)
                      </span>
                    ) : emp.trainingStage === 'simulator' ? (
                      <span className="text-[var(--sig-orange)] font-semibold">
                        Jazda / Služba pod dohľadom
                      </span>
                    ) : emp.trainingStage === 'exam' ? (
                      <span className="text-amber-600 font-semibold">Skúška</span>
                    ) : emp.trainingStage === 'theory' ? (
                      <span className="text-blue-600 font-semibold">Teoréticka príprava</span>
                    ) : (
                      <span className="text-[var(--sig-blue)] font-semibold">
                        Základná príprava
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-center font-bold">
                    {(emp.strikes || 0) > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">
                        {emp.strikes}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-right space-x-1">
                    {canManageStaff && (
                      <button
                        onClick={() => setEditing({ ...emp })}
                        className="aero-btn text-[10.5px] font-semibold"
                      >
                        Hodnotenie
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
