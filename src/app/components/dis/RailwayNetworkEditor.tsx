'use client';
import { disFetch } from '@/lib/dis/api-client';
import {
  operatingSymbols,
  pointKinds,
  railwayNetworkSchema,
  type NetworkSnapshot,
  type RailwayNetwork,
} from '@/lib/dis/railway-network';
import { useTranslation } from '@/lib/i18n/client';
import { useState } from 'react';
export function RailwayNetworkEditor({
  placeId,
  snapshot,
  disabled,
  onSaved,
}: {
  placeId: string;
  snapshot: NetworkSnapshot;
  disabled: boolean;
  onSaved: (snapshot: NetworkSnapshot) => void;
}) {
  const t = useTranslation();
  const [network, setNetwork] = useState<RailwayNetwork>(snapshot.network);
  const [version, setVersion] = useState(snapshot.updatedAt);
  const [selection, setSelection] = useState({ type: 'point', id: network.points[0]?.id || '' });
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<RailwayNetwork[]>([]);
  const [zoom, setZoom] = useState(0.75);
  const point = network.points.find((p) => selection.type === 'point' && p.id === selection.id);
  const section = network.sections.find(
    (s) => selection.type === 'section' && s.id === selection.id,
  );
  const edit = (next: RailwayNetwork) => {
    setHistory((previous) => [...previous.slice(-29), network]);
    setNetwork(next);
    setDirty(true);
    setNotice('');
  };
  const patchPoint = (patch: Partial<RailwayNetwork['points'][number]>) => {
    if (point)
      edit({
        ...network,
        points: network.points.map((p) => (p.id === point.id ? { ...p, ...patch } : p)),
      });
  };
  const patchSection = (patch: Partial<RailwayNetwork['sections'][number]>) => {
    if (section)
      edit({
        ...network,
        sections: network.sections.map((s) => (s.id === section.id ? { ...s, ...patch } : s)),
      });
  };
  const save = async () => {
    try {
      setBusy(true);
      railwayNetworkSchema.parse(network);
      const next = await disFetch<NetworkSnapshot>('/api/dis/railway-network', {
        method: 'POST',
        body: JSON.stringify({ placeId, network, expectedUpdatedAt: version }),
      });
      setVersion(next.updatedAt);
      setDirty(false);
      onSaved(next);
      setNotice('Sieť bola uložená. ZCP používa uložené vlastnosti.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Sieť sa nepodarilo uložiť.');
    } finally {
      setBusy(false);
    }
  };
  const width = Math.max(1380, ...network.points.map((p) => p.x + 250)),
    height = Math.max(1160, ...network.points.map((p) => p.y + 100));
  const groupNames = Object.fromEntries(
    pointKinds.map((k) => [k, network.points.filter((p) => p.kind === k)]),
  );
  return (
    <div className="railway-network-editor">
      <div className="gvd-document-toolbar">
        <strong>{t('Mapa a dopravné body')}</strong>
        <button
          className="aero-btn"
          disabled={disabled || busy}
          onClick={() => {
            const name = window.prompt(t('Názov nového dopravného bodu'));
            if (!name?.trim()) return;
            const id = crypto.randomUUID();
            edit({
              ...network,
              points: [
                ...network.points,
                { id, name: name.trim(), kind: 'Stanica', x: 80, y: 80, symbols: [] },
              ],
            });
            setSelection({ type: 'point', id });
          }}
        >
          {t('Pridať bod')}
        </button>
        <button
          className="aero-btn"
          disabled={disabled || busy || !history.length}
          onClick={() => {
            const previous = history.at(-1)!;
            setHistory(history.slice(0, -1));
            setNetwork(previous);
            setDirty(true);
          }}
        >
          {t('Späť')}
        </button>
        <button
          className="aero-btn"
          disabled={disabled || busy || !dirty}
          onClick={() => void save()}
        >
          {t('Uložiť sieť')}
        </button>
        <button
          className="aero-btn"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm(t('Zahodiť neuložené zmeny siete?'))) {
              setNetwork(snapshot.network);
              setVersion(snapshot.updatedAt);
              setDirty(false);
            }
          }}
        >
          {t('Obnoviť')}
        </button>
        <button className="aero-btn" onClick={() => setZoom(Math.max(0.4, zoom - 0.1))}>
          −
        </button>
        <button className="aero-btn" onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}>
          +
        </button>
        <span>
          {Math.round(zoom * 100)} % · {t(dirty ? 'Neuložené zmeny' : 'Uložený stav')}
        </span>
      </div>
      {notice && (
        <p role="status" className="p-2">
          {t(notice)}
        </p>
      )}
      <div className="network-groups">
        {pointKinds.map((kind) => (
          <details key={kind}>
            <summary>
              {t(kind)} ({groupNames[kind].length})
            </summary>
            {groupNames[kind].map((p) => (
              <button
                key={p.id}
                className="aero-btn"
                onClick={() => setSelection({ type: 'point', id: p.id })}
              >
                {p.name}
              </button>
            ))}
          </details>
        ))}
      </div>
      <div className="network-workspace">
        <div className="network-canvas">
          <svg
            width={width * zoom}
            height={height * zoom}
            viewBox={`0 0 ${width} ${height}`}
            aria-label={t('Schéma železničnej siete')}
          >
            <defs>
              <pattern id="network-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="currentColor" opacity=".15" />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#network-grid)" />
            {network.sections.map((s) => {
              const a = network.points.find((p) => p.id === s.from)!,
                b = network.points.find((p) => p.id === s.to)!;
              return (
                <g
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.name} — ${b.name}`}
                  onClick={() => setSelection({ type: 'section', id: s.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelection({ type: 'section', id: s.id });
                  }}
                  className={selection.id === s.id ? 'selected' : ''}
                >
                  <path className="network-hit" d={`M${a.x} ${a.y} H${b.x} V${b.y}`} />
                  {Array.from({ length: s.tracks }, (_, i) => (
                    <path
                      key={i}
                      className="network-track"
                      d={`M${a.x} ${a.y + i * 7} H${b.x} V${b.y + i * 7}`}
                    />
                  ))}
                </g>
              );
            })}
            {network.points.map((p) => (
              <g
                key={p.id}
                className={`network-point ${selection.id === p.id ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={p.name}
                onClick={() => setSelection({ type: 'point', id: p.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSelection({ type: 'point', id: p.id });
                }}
              >
                {p.kind === 'Zastávka' ? (
                  <circle cx={p.x} cy={p.y} r="8" />
                ) : (
                  <rect x={p.x - 16} y={p.y - 9} width="32" height="18" />
                )}
                <text
                  x={p.x + (p.y < 550 || p.x > 900 ? 25 : -10)}
                  y={p.y + (p.y < 550 || p.x > 900 ? 5 : -20)}
                  fontWeight={p.kind === 'Stanica' ? 'bold' : 'normal'}
                >
                  {p.name}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <fieldset className="network-inspector" disabled={disabled || busy}>
          <legend>
            {point?.name ||
              (section
                ? `${network.points.find((p) => p.id === section.from)?.name} — ${network.points.find((p) => p.id === section.to)?.name}`
                : t('Vyberte bod alebo úsek'))}
          </legend>
          {point && (
            <>
              <label>
                {t('Názov')}
                <input
                  className="aero-input"
                  value={point.name}
                  onChange={(e) => patchPoint({ name: e.target.value })}
                />
              </label>
              <label>
                {t('Druh dopravného bodu')}
                <select
                  className="aero-select"
                  value={point.kind}
                  onChange={(e) => patchPoint({ kind: e.target.value as typeof point.kind })}
                >
                  {pointKinds.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <div className="gvd-action-row">
                {(['x', 'y'] as const).map((axis) => (
                  <label key={axis}>
                    {axis.toUpperCase()}
                    <input
                      className="aero-input"
                      type="number"
                      min="0"
                      max="4000"
                      step="40"
                      value={point[axis]}
                      onChange={(e) => patchPoint({ [axis]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <strong>{t('Osobitné opatrenia · stĺpec 2')}</strong>
              <div className="network-symbols">
                {operatingSymbols.map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={point.symbols.includes(id)}
                      onChange={(e) =>
                        patchPoint({
                          symbols: e.target.checked
                            ? [...point.symbols, id]
                            : point.symbols.filter((s) => s !== id),
                        })
                      }
                    />
                    {t(label)}
                  </label>
                ))}
              </div>
              <button
                className="aero-btn"
                onClick={() => {
                  const name = window.prompt(t('Názov nového dopravného bodu'));
                  if (!name?.trim()) return;
                  const id = crypto.randomUUID();
                  edit({
                    points: [
                      ...network.points,
                      {
                        id,
                        name: name.trim(),
                        kind: 'Stanica',
                        x: Math.min(4000, point.x + 240),
                        y: Math.min(4000, point.y + 160),
                        symbols: [],
                      },
                    ],
                    sections: [
                      ...network.sections,
                      {
                        id: crypto.randomUUID(),
                        from: point.id,
                        to: id,
                        tracks: 1,
                        block: 'unknown',
                        against: false,
                      },
                    ],
                  });
                  setSelection({ type: 'point', id });
                }}
              >
                {t('Pridať vetvu')}
              </button>
            </>
          )}
          {section && (
            <>
              <label>
                {t('Počet traťových koľají')}
                <select
                  className="aero-select"
                  value={section.tracks}
                  onChange={(e) => patchSection({ tracks: Number(e.target.value) as 1 | 2 })}
                >
                  <option value="1">{t('Jednokoľajná')}</option>
                  <option value="2">{t('Dvojkoľajná')}</option>
                </select>
              </label>
              <label>
                {t('Zabezpečenie úseku')}
                <select
                  className="aero-select"
                  value={section.block}
                  onChange={(e) => patchSection({ block: e.target.value as typeof section.block })}
                >
                  <option value="unknown">{t('Nezadané')}</option>
                  <option value="AH">{t('AH')}</option>
                  <option value="AB">{t('Automatický blok')}</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={section.against}
                  onChange={(e) => patchSection({ against: e.target.checked })}
                />
                {t('Jazdy proti správnemu smeru dovolené')}
              </label>
              <p>{t('Nastavenia platia iba pre tento úsek. Ostatné vetvy zostávajú nezmenené.')}</p>
              {(['speed', 'requiredBrakePercent'] as const).map((key, i) => (
                <label key={key}>
                  {t(i ? 'Požadované brzdiace percentá (%)' : 'Stanovená rýchlosť (km/h)')}
                  <input
                    className="aero-input"
                    type="number"
                    min="1"
                    max="300"
                    step="1"
                    placeholder={t('Nezadané')}
                    value={section[key] ?? ''}
                    onChange={(e) =>
                      patchSection({ [key]: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </label>
              ))}
            </>
          )}
          <details>
            <summary>{t('Spojiť existujúce body')}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                edit({
                  ...network,
                  sections: [
                    ...network.sections,
                    {
                      id: crypto.randomUUID(),
                      from: String(data.get('from')),
                      to: String(data.get('to')),
                      tracks: 1,
                      block: 'unknown',
                      against: false,
                    },
                  ],
                });
              }}
            >
              {['from', 'to'].map((name) => (
                <select
                  key={name}
                  name={name}
                  aria-label={t(name === 'from' ? 'Z bodu' : 'Do bodu')}
                  className="aero-select"
                >
                  {network.points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ))}
              <button className="aero-btn">{t('Spojiť')}</button>
            </form>
          </details>
        </fieldset>
      </div>
    </div>
  );
}
