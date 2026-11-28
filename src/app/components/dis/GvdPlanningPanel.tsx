'use client';
import { disFetch } from '@/lib/dis/api-client';
import {
  estimated750,
  newPlanning,
  stockProfileSchema,
  type StockProfile,
} from '@/lib/dis/gvd-planning';
import type { TimetableInput } from '@/lib/dis/timetable';
import { useDisResource } from '@/lib/dis/use-dis-resource';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';

const stockFields = [
  ['locomotiveMassT', 'Hmotnosť HDV (t)'],
  ['hauledMassT', 'Hmotnosť vozňov (t)'],
  ['powerKW', 'Výkon na obvode kolies (kW)'],
  ['maxEffortKN', 'Najvyššia ťažná sila (kN)'],
  ['maxSpeedKmh', 'Rýchlosť súpravy (km/h)'],
  ['serviceBrakeMps2', 'Prevádzkové spomalenie (m/s²)'],
  ['brakeBuildUpSeconds', 'Nábeh brzdy (s)'],
  ['tractionBuildUpSeconds', 'Nábeh trakcie (s)'],
  ['rotatingMassFactor', 'Súčiniteľ rotačných hmôt'],
  ['adhesion', 'Súčiniteľ adhézie'],
  ['resistanceA', 'Odpor A (N)'],
  ['resistanceB', 'Odpor B (N/(m/s))'],
  ['resistanceC', 'Odpor C (N/(m/s)²)'],
] as const;
export function GvdPlanningPanel({
  train,
  placeId,
  disabled,
  onChange,
}: {
  train: TimetableInput;
  placeId: string;
  disabled: boolean;
  onChange: (train: TimetableInput) => void;
}) {
  const t = useTranslation();
  const planning = train.planning || newPlanning();
  const stock = planning.stock;
  const { value, refresh, applyConfirmed } = useDisResource<{ profiles: StockProfile[] }>(
    `/api/dis/gvd-profiles?placeId=${encodeURIComponent(placeId)}`,
    { profiles: [] },
  );
  const [notice, setNotice] = useState('');
  const [curve, setCurve] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const change = (patch: Partial<typeof planning>) =>
    onChange({ ...train, planning: { ...planning, ...patch, calculationFingerprint: undefined } });
  const changeStock = (patch: Partial<StockProfile>) => {
    if (stock) change({ stock: { ...stock, ...patch } });
  };
  async function saveProfile(remove = false) {
    if (!stock || disabled || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const profile = stockProfileSchema.parse(stock);
      const result = await disFetch<{ profile?: StockProfile }>('/api/dis/gvd-profiles', {
        method: remove ? 'DELETE' : 'POST',
        body: JSON.stringify(remove ? { placeId, id: profile.id } : { placeId, profile }),
      });
      applyConfirmed((previous) => ({
        profiles: [
          ...previous.profiles.filter((item) => item.id !== profile.id),
          ...(result.profile ? [result.profile] : []),
        ].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      void refresh();
      setNotice(t('Profil bol spracovaný.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gvd-planning-panel">
      <fieldset disabled={disabled} className="gvd-section">
        <legend>{t('Platnosť a spôsob výpočtu')}</legend>
        <div className="gvd-properties">
          <label>
            {t('Obdobie GVD')}
            <select
              className="aero-select"
              value={planning.era}
              onChange={(e) => {
                const era = e.target.value as typeof planning.era;
                change({
                  era,
                  ...(era === '2004/2005'
                    ? { validFrom: '2004-12-12', validTo: '2005-12-10' }
                    : era === '2005/2006'
                      ? { validFrom: '2005-12-11', validTo: '2006-12-09' }
                      : {}),
                });
              }}
            >
              {['2004/2005', '2005/2006', 'custom'].map((s) => (
                <option key={s} value={s}>
                  {s === 'custom' ? t('Vlastné obdobie') : s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Platí od')}
            <input
              className="aero-input"
              type="date"
              value={planning.validFrom}
              onChange={(e) => change({ validFrom: e.target.value })}
            />
          </label>
          <label>
            {t('Platí do')}
            <input
              className="aero-input"
              type="date"
              value={planning.validTo}
              onChange={(e) => change({ validTo: e.target.value })}
            />
          </label>
          <label>
            {t('Stav plánu')}
            <select
              className="aero-select"
              value={planning.status}
              onChange={(e) => change({ status: e.target.value as typeof planning.status })}
            >
              {['draft', 'active', 'retired'].map((s, i) => (
                <option key={s} value={s}>
                  {t(['Koncept', 'V prevádzke', 'Vyradený'][i])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Spôsob výpočtu')}
            <select
              className="aero-select"
              value={planning.mode}
              onChange={(e) => change({ mode: e.target.value as typeof planning.mode })}
            >
              {['manual', 'estimated', 'calibrated'].map((s, i) => (
                <option key={s} value={s}>
                  {t(['Ručný', 'Odhadovaný', 'Kalibrovaný'][i])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Prirážka (%)')}
            <input
              className="aero-input"
              type="number"
              min="0"
              max="50"
              value={planning.allowancePercent}
              onChange={(e) => change({ allowancePercent: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('Prirážka na úsek (s)')}
            <input
              className="aero-input"
              type="number"
              min="0"
              max="3600"
              value={planning.allowanceSeconds}
              onChange={(e) => change({ allowanceSeconds: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('Čas na obrat (min)')}
            <input
              className="aero-input"
              type="number"
              min="0"
              max="1440"
              value={planning.turnaroundMinutes}
              onChange={(e) => change({ turnaroundMinutes: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="gvd-weekdays">
          {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={planning.weekdays.includes(i + 1)}
                onChange={(e) =>
                  change({
                    weekdays: e.target.checked
                      ? [...planning.weekdays, i + 1].sort()
                      : planning.weekdays.filter((d) => d !== i + 1),
                  })
                }
              />
              {t(day)}
            </label>
          ))}
        </div>
        <div className="gvd-properties">
          {(['includedDates', 'excludedDates'] as const).map((key, i) => (
            <label key={key}>
              {t(
                i === 0 ? 'Ide tiež (dátumy oddelené čiarkou)' : 'Nejde (dátumy oddelené čiarkou)',
              )}
              <DateExceptions
                values={planning[key]}
                placeholder={t('RRRR-MM-DD')}
                onChange={(text) =>
                  change({
                    [key]: text
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="gvd-help">
          {t(
            'Kalendár je prevádzkový dátum GVD, nie aktuálny dátum počítača. Výnimky sviatkov zadajte výslovne.',
          )}
        </p>
      </fieldset>
      <fieldset className="gvd-section" disabled={disabled || busy}>
        <legend>{t('Súprava a jazdné vlastnosti')}</legend>
        <div className="gvd-action-row">
          <select
            className="aero-select"
            aria-label={t('Uložený profil súpravy')}
            value=""
            onChange={(e) => {
              const found = value.profiles.find((p) => p.id === e.target.value);
              if (found) {
                change({ stock: structuredClone(found) });
                setCurve(null);
              }
            }}
          >
            <option value="">{t('Uložený profil súpravy')}</option>
            {value.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.version}
              </option>
            ))}
          </select>
          <button
            className="aero-btn"
            onClick={() => {
              change({ stock: { ...estimated750, id: crypto.randomUUID() }, mode: 'estimated' });
              setCurve(null);
            }}
          >
            {t('Nový odhadovaný profil')}
          </button>
        </div>
        {!stock ? (
          <p>
            {t(
              'Pre výpočet vyberte alebo vytvorte profil. Ručné cestovné poriadky profil nepotrebujú.',
            )}
          </p>
        ) : (
          <>
            <div className="gvd-properties">
              <label>
                {t('Názov profilu')}
                <input
                  className="aero-input"
                  value={stock.name}
                  onChange={(e) => changeStock({ name: e.target.value })}
                />
              </label>
              <label>
                {t('Verzia profilu')}
                <input
                  className="aero-input"
                  type="number"
                  min="1"
                  value={stock.version}
                  onChange={(e) => changeStock({ version: Number(e.target.value) })}
                />
              </label>
              <label>
                {t('Kvalita údajov')}
                <select
                  className="aero-select"
                  value={stock.quality}
                  onChange={(e) =>
                    changeStock({ quality: e.target.value as StockProfile['quality'] })
                  }
                >
                  <option value="estimated">{t('Odhad')}</option>
                  <option value="calibrated">{t('Overený profil')}</option>
                </select>
              </label>
              {stockFields.map(([key, label]) => (
                <label key={key}>
                  {t(label)}
                  <input
                    className="aero-input"
                    type="number"
                    step="any"
                    min="0"
                    value={stock[key]}
                    onChange={(e) => changeStock({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="gvd-properties">
              <label>
                {t('Režim brzdenia')}
                <select
                  className="aero-select"
                  value={stock.brakeMode || ''}
                  onChange={(e) =>
                    changeStock({
                      brakeMode: (e.target.value as StockProfile['brakeMode']) || undefined,
                    })
                  }
                >
                  <option value="">{t('Nezadané')}</option>
                  {['P', 'R', 'G'].map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('Brzdiaca hmotnosť celej súpravy (t)')}
                <input
                  className="aero-input"
                  type="number"
                  min="1"
                  value={stock.brakedWeightT ?? ''}
                  onChange={(e) =>
                    changeStock({
                      brakedWeightT: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </label>
              <label>
                {t('Počet náprav celej súpravy')}
                <input
                  className="aero-input"
                  type="number"
                  min="1"
                  value={stock.axles ?? ''}
                  onChange={(e) =>
                    changeStock({ axles: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </label>
            </div>
            <label>
              {t('Zdroj a platnosť technických údajov')}
              <textarea
                className="aero-input"
                maxLength={1000}
                rows={2}
                value={stock.source}
                onChange={(e) => changeStock({ source: e.target.value })}
              />
            </label>
            <label>
              {t('Trakčná krivka: km/h; kN, jeden bod na riadok')}
              <textarea
                className="aero-input"
                rows={4}
                value={
                  curve ?? stock.effortCurve.map((p) => `${p.speedKmh}; ${p.effortKN}`).join('\n')
                }
                onChange={(e) => setCurve(e.target.value)}
              />
            </label>
            <div className="gvd-action-row">
              <button
                className="aero-btn"
                disabled={curve === null}
                onClick={() => {
                  try {
                    const effortCurve = (curve || '').trim()
                      ? curve!
                          .trim()
                          .split(/\r?\n/)
                          .map((line) => {
                            const values = line.split(/[;\t]/).map(Number);
                            if (values.length !== 2 || values.some((v) => !Number.isFinite(v)))
                              throw new Error(t('Neplatný bod trakčnej krivky.'));
                            return { speedKmh: values[0], effortKN: values[1] };
                          })
                      : [];
                    stockProfileSchema.parse({ ...stock, effortCurve });
                    changeStock({ effortCurve });
                    setCurve(null);
                    setNotice('');
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : String(error));
                  }
                }}
              >
                {t('Použiť krivku')}
              </button>
              <button className="aero-btn" onClick={() => void saveProfile()}>
                {t('Uložiť profil do katalógu')}
              </button>
              <button
                className="aero-btn"
                disabled={!value.profiles.some((p) => p.id === stock.id)}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        'Odstrániť profil z katalógu? Uložené snímky vo vlakoch zostanú zachované.',
                      ),
                    )
                  )
                    void saveProfile(true);
                }}
              >
                {t('Odstrániť profil')}
              </button>
            </div>
            <p className="gvd-help">
              {t(
                'Predvolený profil 750 je iba upraviteľný odhad. Brzdiaca hmotnosť sa neprepočítava priamo na silu. Výpočet používa prevádzkové, nie núdzové brzdenie.',
              )}
            </p>
          </>
        )}
        {notice && <p role="status">{t(notice)}</p>}
      </fieldset>
    </div>
  );
}

function DateExceptions({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (text: string) => void;
}) {
  const text = values.join(', ');
  return (
    <input
      key={text}
      className="aero-input"
      defaultValue={text}
      placeholder={placeholder}
      onBlur={(e) => onChange(e.target.value)}
    />
  );
}
