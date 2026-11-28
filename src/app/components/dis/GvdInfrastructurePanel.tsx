'use client';
import { ActionFeedback } from '@/app/components/ui/DispatcherFeedback';
import { disFetch } from '@/lib/dis/api-client';
import type { RailwayLine } from '@/lib/dis/lines';
import { railwayLineSchema } from '@/lib/dis/lines';
import { useTranslation } from '@/lib/i18n/client';
import { useEffect, useState } from 'react';

export function GvdInfrastructurePanel({
  line,
  stations,
  onSaved,
  disabled,
  onDirty,
}: {
  line: RailwayLine;
  stations: { stationId: string; name: string }[];
  onSaved: (line: RailwayLine) => void;
  disabled: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState(() => structuredClone(line));
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState(() => JSON.stringify(line));
  useEffect(() => onDirty(JSON.stringify(draft) !== baseline), [draft, baseline, onDirty]);
  const [notice, setNotice] = useState('');
  const names = new Map(stations.map((s) => [s.stationId, s.name]));
  const sections = draft.sections || [];
  const tracks = draft.stationTracks || [];
  const section = (index: number, patch: Partial<(typeof sections)[number]>) =>
    setDraft({
      ...draft,
      sections: sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  async function save() {
    setNotice('');
    setBusy(true);
    try {
      const result = await disFetch<{ line: RailwayLine }>('/api/dis/lines', {
        method: 'POST',
        body: JSON.stringify(railwayLineSchema.parse(draft)),
      });
      onSaved(result.line);
      setBaseline(JSON.stringify(draft));
      setNotice(t('Profil trate bol uložený.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="gvd-section" disabled={disabled || busy}>
      <legend>{t('Smerové profily a staničné koľaje')}</legend>
      <p className="gvd-help">
        {t(
          'Každý smer má vlastný profil. Vzdialenosti sú metre, sklony ‰ v smere jazdy. Chýbajúce údaje sa nedopočítavajú z nákresu.',
        )}
      </p>
      {sections.map((s, index) => (
        <details key={index} className="gvd-profile-section" open>
          <summary>
            {names.get(s.from) || s.from} → {names.get(s.to) || s.to} ·{' '}
            {(s.segments.reduce((n, p) => n + p.lengthM, 0) / 1000).toFixed(3)} {t('km')}
          </summary>
          <div className="gvd-properties">
            {(['from', 'to'] as const).map((key, i) => (
              <label key={key}>
                {t(i === 0 ? 'Z dopravne' : 'Do dopravne')}
                <select
                  className="aero-select"
                  value={s[key]}
                  onChange={(e) => section(index, { [key]: e.target.value })}
                >
                  {draft.stations.map((id) => (
                    <option key={id} value={id}>
                      {names.get(id) || id}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              {t('Počet traťových koľají')}
              <input
                className="aero-input"
                type="number"
                min="1"
                max="8"
                value={s.tracks}
                onChange={(e) => section(index, { tracks: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('Plánovacie medzidobie (s; 0 = nezadané)')}
              <input
                className="aero-input"
                type="number"
                min="0"
                max="3600"
                value={s.headwaySeconds}
                onChange={(e) => section(index, { headwaySeconds: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('Verzia profilu')}
              <input
                className="aero-input"
                type="number"
                min="1"
                value={s.version}
                onChange={(e) => section(index, { version: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('Zdroj a platnosť technických údajov')}
              <input
                className="aero-input"
                maxLength={1000}
                value={s.source}
                onChange={(e) => section(index, { source: e.target.value })}
              />
            </label>
          </div>
          <table className="aero-grid">
            <thead>
              <tr>
                {['Dĺžka úseku (m)', 'Rýchlosť (km/h)', 'Sklon (‰)', 'Úpravy'].map((label) => (
                  <th key={label}>{t(label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.segments.map((segment, row) => (
                <tr key={row}>
                  {(['lengthM', 'speedKmh', 'gradientPermille'] as const).map((key) => (
                    <td key={key}>
                      <input
                        className="aero-input"
                        type="number"
                        step="any"
                        aria-label={t(
                          key === 'lengthM'
                            ? 'Dĺžka úseku (m)'
                            : key === 'speedKmh'
                              ? 'Rýchlosť (km/h)'
                              : 'Sklon (‰)',
                        )}
                        value={segment[key]}
                        onChange={(e) =>
                          section(index, {
                            segments: s.segments.map((p, j) =>
                              j === row ? { ...p, [key]: Number(e.target.value) } : p,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="aero-btn"
                      disabled={s.segments.length <= 1}
                      onClick={() =>
                        section(index, { segments: s.segments.filter((_, j) => j !== row) })
                      }
                    >
                      {t('Odstrániť')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>{t('Traťové oddiely')}</h4>
          <p className="gvd-help">
            {t(
              'Polohy sú metre od začiatku tohto smerového úseku. Kontrola oddielov je plánovací odhad podľa jazdných časov, nie zabezpečovacie zariadenie.',
            )}
          </p>
          <table className="aero-grid">
            <thead>
              <tr>
                {['Označenie', 'Začiatok (m)', 'Koniec (m)', 'Uvoľnenie (s)', 'Úpravy'].map(
                  (label) => (
                    <th key={label}>{t(label)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(s.blocks || []).map((block, row) => (
                <tr key={row}>
                  {(['id', 'startM', 'endM', 'clearanceSeconds'] as const).map((key, col) => (
                    <td key={key}>
                      <input
                        className="aero-input"
                        aria-label={t(
                          ['Označenie', 'Začiatok (m)', 'Koniec (m)', 'Uvoľnenie (s)'][col],
                        )}
                        type={key === 'id' ? 'text' : 'number'}
                        min="0"
                        value={block[key]}
                        onChange={(e) =>
                          section(index, {
                            blocks: s.blocks!.map((b, i) =>
                              i === row
                                ? {
                                    ...b,
                                    [key]: key === 'id' ? e.target.value : Number(e.target.value),
                                  }
                                : b,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="aero-btn"
                      onClick={() =>
                        section(index, { blocks: s.blocks!.filter((_, i) => i !== row) })
                      }
                    >
                      {t('Odstrániť')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="aero-btn"
            onClick={() =>
              section(index, {
                blocks: [
                  ...(s.blocks || []),
                  {
                    id: `O${(s.blocks?.length || 0) + 1}`,
                    startM: s.blocks?.at(-1)?.endM || 0,
                    endM: s.segments.reduce((n, p) => n + p.lengthM, 0),
                    clearanceSeconds: 30,
                  },
                ],
              })
            }
          >
            {t('Pridať oddiel')}
          </button>
          <h4>{t('Potrebné brzdiace percentá')}</h4>
          <p className="gvd-help">
            {t(
              'Zadajte iba hodnoty z doloženej tabuľky pre túto trať. Zdroj uveďte v profile úseku; brzdiace percentá nenahrádzajú fyzikálne spomalenie.',
            )}
          </p>
          <table className="aero-grid">
            <thead>
              <tr>
                {['Režim brzdenia', 'Najviac náprav', 'Najviac km/h', 'Potrebné %', 'Úpravy'].map(
                  (label) => (
                    <th key={label}>{t(label)}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(s.brakeRequirements || []).map((rule, row) => (
                <tr key={row}>
                  <td>
                    <select
                      className="aero-select"
                      aria-label={t('Režim brzdenia')}
                      value={rule.mode}
                      onChange={(e) =>
                        section(index, {
                          brakeRequirements: s.brakeRequirements!.map((r, i) =>
                            i === row ? { ...r, mode: e.target.value as 'P' | 'R' | 'G' } : r,
                          ),
                        })
                      }
                    >
                      {['P', 'R', 'G'].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </td>
                  {(['maxAxles', 'maxSpeedKmh', 'requiredPercent'] as const).map((key, col) => (
                    <td key={key}>
                      <input
                        className="aero-input"
                        type="number"
                        min="1"
                        aria-label={t(['Najviac náprav', 'Najviac km/h', 'Potrebné %'][col])}
                        value={rule[key]}
                        onChange={(e) =>
                          section(index, {
                            brakeRequirements: s.brakeRequirements!.map((r, i) =>
                              i === row ? { ...r, [key]: Number(e.target.value) } : r,
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      className="aero-btn"
                      onClick={() =>
                        section(index, {
                          brakeRequirements: s.brakeRequirements!.filter((_, i) => i !== row),
                        })
                      }
                    >
                      {t('Odstrániť')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="aero-btn"
            onClick={() =>
              section(index, {
                brakeRequirements: [
                  ...(s.brakeRequirements || []),
                  { mode: 'P', maxAxles: 100, maxSpeedKmh: 100, requiredPercent: 100 },
                ],
              })
            }
          >
            {t('Pridať požiadavku brzdenia')}
          </button>
          <div className="gvd-action-row">
            <button
              className="aero-btn"
              onClick={() =>
                section(index, {
                  segments: [...s.segments, { lengthM: 1000, speedKmh: 60, gradientPermille: 0 }],
                })
              }
            >
              {t('Pridať zmenu profilu')}
            </button>
            <button
              className="aero-btn"
              onClick={() =>
                setDraft({
                  ...draft,
                  sections: [
                    ...sections,
                    {
                      ...s,
                      from: s.to,
                      to: s.from,
                      segments: [...s.segments]
                        .reverse()
                        .map((p) => ({ ...p, gradientPermille: -p.gradientPermille })),
                      blocks: s.blocks
                        ?.slice()
                        .reverse()
                        .map((b) => {
                          const length = s.segments.reduce((n, p) => n + p.lengthM, 0);
                          return { ...b, startM: length - b.endM, endM: length - b.startM };
                        }),
                      // Directional braking tables must be checked independently.
                      brakeRequirements: [],
                    },
                  ],
                })
              }
            >
              {t('Vytvoriť opačný smer na kontrolu')}
            </button>
            <button
              className="aero-btn"
              onClick={() =>
                setDraft({ ...draft, sections: sections.filter((_, i) => i !== index) })
              }
            >
              {t('Odstrániť úsek')}
            </button>
          </div>
        </details>
      ))}
      <button
        className="aero-btn"
        disabled={draft.stations.length < 2}
        onClick={() =>
          setDraft({
            ...draft,
            sections: [
              ...sections,
              {
                from: draft.stations[0],
                to: draft.stations[1],
                version: 1,
                source: '',
                tracks: 1,
                headwaySeconds: 0,
                segments: [{ lengthM: 1000, speedKmh: 60, gradientPermille: 0 }],
              },
            ],
          })
        }
      >
        {t('Pridať smerový úsek')}
      </button>
      <h3>{t('Použiteľné dĺžky koľají')}</h3>
      <table className="aero-grid">
        <thead>
          <tr>
            {['Dopravňa', 'Koľaj', 'Dĺžka (m)', 'Uvoľnenie (s)', 'Úpravy'].map((s) => (
              <th key={s}>{t(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map((track, i) => (
            <tr key={i}>
              <td>
                <select
                  className="aero-select"
                  value={track.station}
                  aria-label={t('Dopravňa')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stationTracks: tracks.map((p, j) =>
                        j === i ? { ...p, station: e.target.value } : p,
                      ),
                    })
                  }
                >
                  {draft.stations.map((id) => (
                    <option key={id} value={id}>
                      {names.get(id) || id}
                    </option>
                  ))}
                </select>
              </td>
              {(['track', 'lengthM', 'clearanceSeconds'] as const).map((key) => (
                <td key={key}>
                  <input
                    className="aero-input"
                    aria-label={t(
                      key === 'track' ? 'Koľaj' : key === 'lengthM' ? 'Dĺžka (m)' : 'Uvoľnenie (s)',
                    )}
                    type={key === 'track' ? 'text' : 'number'}
                    value={track[key]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        stationTracks: tracks.map((p, j) =>
                          j === i
                            ? {
                                ...p,
                                [key]: key === 'track' ? e.target.value : Number(e.target.value),
                              }
                            : p,
                        ),
                      })
                    }
                  />
                </td>
              ))}
              <td>
                <button
                  className="aero-btn"
                  onClick={() =>
                    setDraft({ ...draft, stationTracks: tracks.filter((_, j) => j !== i) })
                  }
                >
                  {t('Odstrániť')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="gvd-action-row">
        <button
          className="aero-btn"
          onClick={() =>
            setDraft({
              ...draft,
              stationTracks: [
                ...tracks,
                { station: draft.stations[0], track: '', lengthM: 250, clearanceSeconds: 60 },
              ],
            })
          }
        >
          {t('Pridať koľaj')}
        </button>
        <button className="aero-btn" onClick={() => void save()}>
          {t('Uložiť technické údaje trate')}
        </button>
      </div>
      <ActionFeedback message={t(notice)} />
    </fieldset>
  );
}
