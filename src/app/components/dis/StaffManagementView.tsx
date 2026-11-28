'use client';
import { ActionFeedback } from '@/app/components/ui/DispatcherFeedback';
import { WorkspacePage } from '@/app/components/ui/WorkspacePage';
import { useTranslation } from '@/lib/i18n/client';

import { AeroIcon } from '@/app/components/ui/AeroIcon';

import { disFetch } from '@/lib/dis/api-client';
import type { UserProfile } from '@/lib/dis/appwrite-client';
import { useDisAuth } from '@/lib/dis/auth-context';
import { useCallback, useEffect, useRef, useState } from 'react';

export function StaffManagementView() {
  const t = useTranslation();
  const { canManageStaff } = useDisAuth();
  const [activeTab, setActiveTab] = useState<'employees' | 'cadets' | 'strikes'>('employees');
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strikeTargetId, setStrikeTargetId] = useState('');
  const [notice, setNotice] = useState('');
  const profileGeneration = useRef(0);
  const saveLock = useRef(false);

  const loadProfiles = useCallback(async () => {
    const generation = ++profileGeneration.current;
    try {
      setError(null);
      const res = await disFetch<{ profiles: UserProfile[] }>('/api/dis/staff');
      if (generation === profileGeneration.current) setEmployees(res.profiles);
    } catch (err: unknown) {
      if (generation !== profileGeneration.current) return;
      setError(
        t(
          'Chyba pri načítaní personálu: {0}',
          err instanceof Error ? t(err.message) : t('Neznáma chyba'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const initial = setTimeout(loadProfiles, 0);
    return () => clearTimeout(initial);
  }, [loadProfiles]);

  async function saveProfile() {
    if (!canManageStaff || !editing?.$id || saveLock.current) return;
    saveLock.current = true;
    setError(null);
    setSaving(true);
    try {
      const result = await disFetch<{ profile: UserProfile }>('/api/dis/staff', {
        method: 'POST',
        body: JSON.stringify({
          id: editing.$id,
          trainingStage: editing.trainingStage,
          strikes: editing.strikes,
          notes: editing.notes || '',
        }),
      });
      profileGeneration.current++;
      setEmployees((previous) =>
        previous.map((person) => (person.$id === result.profile.$id ? result.profile : person)),
      );
      setNotice(`Hodnotenie a sankcie pre ${editing.name} boli uložené.`);
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Profil sa nepodarilo uložiť.');
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const roleTitleMap: Record<string, string> = {
    admin: 'Administrátor',
    dispatcher_manager: 'Vedúci výpravca',
    driver_manager: 'Vedúci rušňovodič',
    dispatcher_instructor: 'Inštruktor výpravca',
    driver_instructor: 'Inštruktor rušňovodič',
    dispatcher: 'Výpravca ZSSK',
    driver: 'Rušňovodič ZSSK',
    dispatcher_trainee: 'Výpravca v zácviku',
    driver_trainee: 'Kadet rušňovodič',
    other_staff: 'Ostatný personál',
    conductor: 'Sprievodca',
    shuntman: 'Posunovač',
    operations_dispatcher: 'Prevádzkový dispečer',
    vehicle_manager: 'Vozmajster',
    conductor_manager: 'Vedúci sprievodcov',
    relations_manager: 'Manažér komunikácie',
    workforce_director: 'Personálny riaditeľ',
  };

  const filtered = employees.filter((emp) => {
    if (activeTab === 'cadets') return emp.trainingStage !== 'certified';
    if (activeTab === 'strikes') return (emp.strikes || 0) > 0;
    return true;
  });

  return (
    <WorkspacePage
      title={t('Personálne oddelenie ZSSK')}
      icon="staff"
      scroll={false}
      toolbar={
        <>
          <div className="workspace-page-actions">
            <div className="workspace-page-actions">
              <button
                onClick={() => setActiveTab('employees')}
                className={`aero-btn ${activeTab === 'employees' ? 'active' : ''}`}
              >
                <AeroIcon name="staff" /> {t('Zamestnanci')}{' '}
              </button>
              <button
                onClick={() => setActiveTab('cadets')}
                className={`aero-btn ${activeTab === 'cadets' ? 'active' : ''}`}
              >
                <AeroIcon name="assessment" /> {t('Kadetný program & Zácvik')}{' '}
              </button>
              <button
                onClick={() => setActiveTab('strikes')}
                className={`aero-btn ${activeTab === 'strikes' ? 'active' : ''}`}
              >
                <AeroIcon name="warning" /> {t('Evidencia sankcií (Strikes)')}{' '}
              </button>
            </div>
          </div>

          <div className="workspace-page-actions">
            <button
              onClick={loadProfiles}
              className="aero-btn text-[11px] flex items-center space-x-1"
            >
              <AeroIcon name="refresh" />
              <span>{t('Obnoviť')}</span>
            </button>
          </div>
        </>
      }
    >
      {activeTab === 'strikes' && canManageStaff && (
        <div className="flex flex-wrap items-end gap-2 border-b border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] p-3">
          <label className="grid gap-1">
            {' '}
            {t('Pridať sankciu zamestnancovi')}{' '}
            <select
              className="aero-select max-w-full"
              value={strikeTargetId}
              disabled={loading || saving}
              onChange={(event) => setStrikeTargetId(event.target.value)}
            >
              <option value="">{t('Vyberte zamestnanca')}</option>
              {employees.map((employee) => (
                <option key={employee.$id} value={employee.$id}>
                  {employee.name}
                  {employee.robloxUsername ? ` (@${employee.robloxUsername})` : ''} —{' '}
                  {employee.strikes || 0} {t('sankcií')}{' '}
                </option>
              ))}
            </select>
          </label>
          <button
            className="aero-btn"
            disabled={
              !strikeTargetId ||
              saving ||
              (employees.find((employee) => employee.$id === strikeTargetId)?.strikes || 0) >= 10
            }
            onClick={() => {
              const employee = employees.find((person) => person.$id === strikeTargetId);
              if (!employee) return;
              setError(null);
              setNotice('');
              setEditing({ ...employee, strikes: Math.min(10, (employee.strikes || 0) + 1) });
            }}
          >
            <AeroIcon name="add" /> {t('Pridať sankciu…')}{' '}
          </button>
          <span className="text-[var(--aero-text-muted)]">
            {' '}
            {t('Vybrať môžete aj zamestnanca bez sankcií. Zmenu potvrďte v okne hodnotenia.')}{' '}
          </span>
        </div>
      )}
      <ActionFeedback message={t(notice)} />
      <ActionFeedback message={!editing ? t(error) : null} error />

      {editing && canManageStaff && (
        <dialog
          ref={(dialog) => {
            if (dialog && !dialog.open) dialog.showModal();
          }}
          aria-labelledby="staff-assessment-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!saving) setEditing(null);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setEditing(null);
          }}
          className="m-auto w-[min(480px,calc(100vw-2rem))] max-h-[90vh] overflow-auto rounded-[3px] border border-[var(--aero-window-border)] bg-[var(--aero-panel-bg)] p-0 text-xs text-[var(--aero-text)] shadow-xl backdrop:bg-black/40"
        >
          <header className="authoring-caption">
            <h2 id="staff-assessment-title" className="mr-auto font-semibold">
              {' '}
              {t('Hodnotenie a sankcie —')} {editing.name}
            </h2>
            <button
              type="button"
              className="aero-btn"
              disabled={saving}
              onClick={() => setEditing(null)}
              aria-label={t('Zavrieť hodnotenie')}
            >
              <AeroIcon name="close" />
            </button>
          </header>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <fieldset disabled={saving} className="space-y-4 p-4">
              <p className="text-[var(--aero-text-muted)]">
                {editing.robloxUsername ? `@${editing.robloxUsername}` : editing.callsign} ·{' '}
                {t(roleTitleMap[editing.role]) || editing.role}
                {editing.robloxRoleName && ` · Roblox: ${editing.robloxRoleName}`}
              </p>
              <p role="alert" className="dialog-feedback" data-error={!!error || undefined}>
                {t(error)}
              </p>
              <label className="grid gap-1">
                {' '}
                {t('Fáza výcviku')}{' '}
                <select
                  className="aero-select w-full"
                  value={editing.trainingStage}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      trainingStage: event.target.value as UserProfile['trainingStage'],
                    })
                  }
                >
                  <option value="cadet">{t('Základná príprava')}</option>
                  <option value="theory">{t('Teoretická príprava')}</option>
                  <option value="simulator">{t('Služba pod dohľadom')}</option>
                  <option value="exam">{t('Skúška')}</option>
                  <option value="certified">{t('Autorizovaný (plný výkon)')}</option>
                </select>
              </label>
              <section
                className="space-y-2 border border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] p-3"
                aria-label={t('Správa sankcií')}
              >
                <h3 className="font-semibold">{t('Sankcie (strikes)')}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="aero-btn"
                    disabled={saving || (editing.strikes || 0) <= 0}
                    onClick={() =>
                      setEditing({ ...editing, strikes: Math.max(0, (editing.strikes || 0) - 1) })
                    }
                  >
                    <AeroIcon name="delete" />
                    {t('− Odobrať sankciu')}{' '}
                  </button>
                  <label className="grid gap-1">
                    {' '}
                    {t('Počet sankcií')}{' '}
                    <input
                      className="aero-input w-24"
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      required
                      value={editing.strikes || 0}
                      onChange={(event) =>
                        setEditing({ ...editing, strikes: Number(event.target.value) })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="aero-btn"
                    disabled={saving || (editing.strikes || 0) >= 10}
                    onClick={() =>
                      setEditing({ ...editing, strikes: Math.min(10, (editing.strikes || 0) + 1) })
                    }
                  >
                    <AeroIcon name="add" />
                    {t('+ Pridať sankciu')}{' '}
                  </button>
                </div>
                <p className="text-[var(--aero-text-muted)]">
                  {' '}
                  {t(
                    'Počet môže byť od 0 do 10. Zmeny sa prejavia až po uložení. Dôvod môžete zapísať do poznámok nižšie.',
                  )}{' '}
                </p>
              </section>
              <label className="grid gap-1">
                {' '}
                {t('Poznámky a dôvod sankcie')}{' '}
                <textarea
                  className="aero-input h-auto! min-h-28 w-full resize-y p-2!"
                  rows={5}
                  maxLength={2000}
                  value={editing.notes || ''}
                  onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                />
              </label>
            </fieldset>
            <footer className="flex justify-end gap-2 border-t border-[var(--aero-panel-border)] bg-[var(--aero-ribbon-bg)] p-3">
              <button
                className="aero-btn"
                disabled={saving}
                type="button"
                onClick={() => setEditing(null)}
              >
                <AeroIcon name="close" /> {t('Zrušiť')}{' '}
              </button>
              <button className="aero-btn" disabled={saving} type="submit">
                <AeroIcon name="save" />
                {saving ? t('Ukladám…') : t('Uložiť hodnotenie a sankcie')}
              </button>
            </footer>
          </form>
        </dialog>
      )}
      {/* Main Content Grid View */}
      <div className="workspace-page-scroll">
        <table className="workspace-page-table border-collapse aero-grid text-left text-[11.5px]">
          <colgroup>
            {['12%', '22%', '10%', '18%', '18%', '7%', '13%'].map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="py-1.5 px-2">{t('Roblox ID')}</th>
              <th className="py-1.5 px-2">{t('Meno & Roblox')}</th>
              <th className="py-1.5 px-2">{t('Volací znak')}</th>
              <th className="py-1.5 px-2">{t('Zaradenie / Rola')}</th>
              <th className="py-1.5 px-2">{t('Fáza výcviku')}</th>
              <th className="py-1.5 px-2 text-center">{t('Strikes')}</th>
              <th className="py-1.5 px-2 text-right">{t('Správa oprávnení')}</th>
            </tr>
          </thead>
          <tbody>
            {loading || !filtered.length ? (
              <tr>
                <td colSpan={7} className="workspace-page-state">
                  {loading
                    ? t('Načítavam zoznam personálu...')
                    : activeTab === 'strikes'
                      ? t('Žiadny zamestnanec nemá aktívne sankcie.')
                      : activeTab === 'cadets'
                        ? t('Žiadni aktívni kadeti alebo stážisti.')
                        : t('Žiadny personál zatiaľ. Prihláste sa cez Roblox OAuth.')}
                </td>
              </tr>
            ) : null}
            {!loading &&
              filtered.map((emp) => (
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
                      {t(roleTitleMap[emp.role]) || emp.role}
                    </span>
                    {emp.robloxRoleName && (
                      <span className="ml-2 text-[var(--aero-text-muted)]">
                        {' '}
                        {t('Roblox:')} {emp.robloxRoleName}
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-2">
                    {emp.trainingStage === 'certified' ? (
                      <span className="text-[var(--sig-green)] font-semibold">
                        {' '}
                        {t('Autorizovaný (Plný výkon)')}{' '}
                      </span>
                    ) : emp.trainingStage === 'simulator' ? (
                      <span className="text-[var(--sig-orange)] font-semibold">
                        {' '}
                        {t('Jazda / Služba pod dohľadom')}{' '}
                      </span>
                    ) : emp.trainingStage === 'exam' ? (
                      <span className="text-amber-600 font-semibold">{t('Skúška')}</span>
                    ) : emp.trainingStage === 'theory' ? (
                      <span className="text-blue-600 font-semibold">
                        {t('Teoréticka príprava')}
                      </span>
                    ) : (
                      <span className="text-[var(--sig-blue)] font-semibold">
                        {' '}
                        {t('Základná príprava')}{' '}
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
                        onClick={() => {
                          setError(null);
                          setNotice('');
                          setEditing({ ...emp });
                        }}
                        className="aero-btn text-[10.5px] font-semibold"
                      >
                        <AeroIcon name="assessment" />
                        {activeTab === 'strikes' ? t('Spravovať sankcie') : t('Hodnotenie')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </WorkspacePage>
  );
}
