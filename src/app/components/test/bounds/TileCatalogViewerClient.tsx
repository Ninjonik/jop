'use client';

import React, { useState, CSSProperties } from 'react';

export interface Space {
  x: number;
  y: number;
}

export type TraversableRouteMap = Record<string, string>;
export type TraversableStateMap = Record<number, TraversableRouteMap>;

export interface TextConfig {
  fill: string;
  size: string;
  text: string;
}

export type TileStateValue = string | string[];
export type TileStateDefinition = Record<string, TileStateValue>;
export type TileStates = Record<string, TileStateDefinition>;

export interface TileData {
  component: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  space: Space;
  usedSpace: [number, number][];
  traversable: false | TraversableStateMap;
  states?: TileStates;
  texts?: Record<string, TextConfig>;
}

export type TileCatalog = Record<string, TileData>;

interface ClientProps {
  tiles: TileCatalog;
  globalStates?: TileStates;
  tileSize?: number;
}

function getClosestEdgePoint(
    coordStr: string,
    space: { x: number; y: number },
    tileSize: number,
): { x: number; y: number } {
  const [tx, ty] = coordStr.split(',').map(Number);

  let x = (tx + 0.5) * tileSize;
  let y = (ty + 0.5) * tileSize;

  const widthPx = space.x * tileSize;
  const heightPx = space.y * tileSize;

  if (tx < 0) {
    x = 0;
  } else if (tx >= space.x) {
    x = widthPx;
  }

  if (ty < 0) {
    y = 0;
  } else if (ty >= space.y) {
    y = heightPx;
  }

  return { x, y };
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCssString(cssString: string): CSSProperties {
  const styles: Record<string, string> = {};
  cssString.split(';').forEach((rule) => {
    const trimmed = rule.trim();
    if (!trimmed) return;
    const [property, ...valueParts] = trimmed.split(':');
    if (property && valueParts.length > 0) {
      const propName = camelCase(property.trim());
      const value = valueParts.join(':').trim();
      styles[propName] = value;
    }
  });
  return styles as CSSProperties;
}

function normalizeStateNames(input: TileStateValue | undefined): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  return input.split(/\s+/).filter(Boolean);
}

function findStateDefinition(
    name: string,
    localStates: TileStates = {},
    globalStates: TileStates = {}
): TileStateDefinition | undefined {
  if (localStates[name]) return localStates[name];
  if (globalStates[name]) return globalStates[name];

  const nameWithS = name.endsWith('S') ? name : `${name}S`;
  if (localStates[nameWithS]) return localStates[nameWithS];
  if (globalStates[nameWithS]) return globalStates[nameWithS];

  return undefined;
}

function resolveStateDefinition(
    stateName: string,
    localStates: TileStates = {},
    globalStates: TileStates = {},
    visited: Set<string> = new Set()
): Record<string, string> {
  const targetState = findStateDefinition(stateName, localStates, globalStates);

  if (!targetState || visited.has(stateName)) {
    return {};
  }

  visited.add(stateName);

  let merged: Record<string, string> = {};

  if (targetState.states) {
    const parentNames = normalizeStateNames(targetState.states as TileStateValue);
    parentNames.forEach((parentName) => {
      const parentResolved = resolveStateDefinition(
          parentName,
          localStates,
          globalStates,
          new Set(visited)
      );
      merged = { ...merged, ...parentResolved };
    });
  }

  const ownProps = { ...targetState };
  delete ownProps.states;

  const stringProps: Record<string, string> = {};
  Object.entries(ownProps).forEach(([k, v]) => {
    if (typeof v === 'string') {
      stringProps[k] = v;
    }
  });

  return { ...merged, ...stringProps };
}

/**
 * Expands shorthand `states: "departureBlinking shuntActive"` into concrete state entries
 * that inherit from 'default' + the 'S'-suffixed global preset (e.g. "default departureBlinkingS").
 */
function normalizeTileStates(rawStates?: TileStates): TileStates {
  if (!rawStates) return {};

  const normalized: TileStates = {};

  Object.entries(rawStates).forEach(([stateKey, stateDef]) => {
    if (stateKey === 'states') {
      const importedNames = normalizeStateNames(
          stateDef as unknown as TileStateValue
      );
      importedNames.forEach((importedName) => {
        const presetName = importedName.endsWith('S') ? importedName : `${importedName}S`;
        normalized[importedName] = {
          states: rawStates['default'] ? `default ${presetName}` : presetName,
        };
      });
    } else {
      normalized[stateKey] = stateDef;
    }
  });

  return normalized;
}

export default function TileCatalogViewerClient({
                                                  tiles,
                                                  globalStates = {},
                                                  tileSize = 75,
                                                }: ClientProps) {
  const [selectedState, setSelectedState] = useState<Record<string, number>>({});
  const [activeAssetStates, setActiveAssetStates] = useState<Record<string, string>>({});
  const [showBounds, setShowBounds] = useState(true);
  const [textOverrides, setTextOverrides] = useState<Record<string, Record<string, Partial<TextConfig>>>>({});

  const handleStateChange = (key: string, stateIdx: number) => {
    setSelectedState((prev) => ({ ...prev, [key]: stateIdx }));
  };

  const handleAssetStateChange = (key: string, stateName: string) => {
    setActiveAssetStates((prev) => ({ ...prev, [key]: stateName }));
  };

  const handleTextOverride = (tileKey: string, textKey: string, field: keyof TextConfig, value: string) => {
    setTextOverrides((prev) => ({
      ...prev,
      [tileKey]: {
        ...prev[tileKey],
        [textKey]: {
          ...prev[tileKey]?.[textKey],
          [field]: value,
        },
      },
    }));
  };

  return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-md">
          <button
              onClick={() => setShowBounds(!showBounds)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 font-semibold transition-all ${
                  showBounds
                      ? 'bg-lime-500 text-slate-900 shadow-[0_0_15px_rgba(132,204,22,0.4)]'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
          >
            {showBounds ? (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
            ) : (
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                  <path d="M9.88 9.88 2 12s3-7 10-7a9.46 9.46 0 0 1 4.54 1.15" />
                  <path d="M17.3 17.3A9.96 9.96 0 0 1 12 19c-7 0-10-7-10-7a13.3 13.3 0 0 1 1.66-2.04" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
            )}
            {showBounds ? 'Bounds: ON' : 'Bounds: OFF'}
          </button>
          <div className="text-sm text-slate-400">
            Toggle visual overlays for occupied spaces and geometry
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.entries(tiles).map(([key, tile]) => {
            const widthPx = tile.space.x * tileSize;
            const heightPx = tile.space.y * tileSize;

            const states = tile.traversable ? Object.keys(tile.traversable).map(Number) : [];
            const currentState = selectedState[key] ?? (states.length > 0 ? states[0] : 0);
            const currentRoutes: TraversableRouteMap =
                tile.traversable && tile.traversable[currentState] ? tile.traversable[currentState] : {};

            const normalizedLocalStates = normalizeTileStates(tile.states);
            const assetStates = Object.keys(normalizedLocalStates);
            const currentAssetState = activeAssetStates[key] ?? (assetStates.length > 0 ? assetStates[0] : 'default');

            const stateDefinition = resolveStateDefinition(
                currentAssetState,
                normalizedLocalStates,
                globalStates
            );

            const customStyleVars: Record<string, string> = {};
            let rawCssStyles: CSSProperties = {};
            const stateClasses: string[] = [];

            Object.entries(stateDefinition).forEach(([stateKey, value]) => {
              if (stateKey.startsWith('--')) {
                customStyleVars[stateKey] = value;
              } else if (stateKey === 'css') {
                rawCssStyles = parseCssString(value);
              } else if (stateKey === 'tailwind') {
                const tailwindClasses = value
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((cls) => (cls.startsWith('!') ? cls : `!${cls}`));
                stateClasses.push(...tailwindClasses);
              } else if (stateKey === 'class') {
                stateClasses.push(...value.split(/\s+/).filter(Boolean));
              }
            });

            const texts = tile.texts ?? {};
            const overrides = textOverrides[key] ?? {};

            Object.keys(texts).forEach((textKey) => {
              const config = { ...texts[textKey], ...(overrides[textKey] ?? {}) };

              if (textKey === 'text') {
                customStyleVars['--color-text'] = config.fill;
                customStyleVars['--size-text'] = config.size;
              } else {
                customStyleVars[`--color-${textKey}`] = config.fill;
                customStyleVars[`--size-${textKey}`] = config.size;
              }
            });

            const componentClassName = [
              'pointer-events-none absolute inset-0 h-full w-full object-contain opacity-80',
              ...stateClasses,
            ].join(' ');

            const TileComponent = tile.component;

            return (
                <div
                    key={key}
                    className="flex flex-col rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-lg"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
                <span className="font-mono text-sm font-semibold text-lime-300 capitalize">
                  {key}
                </span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-slate-300">
                  {tile.space.x}×{tile.space.y} Tile{tile.space.x * tile.space.y > 1 ? 's' : ''}
                </span>
                  </div>

                  <div className="flex flex-1 items-center justify-center overflow-auto rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <div
                        className="relative border border-slate-700 bg-slate-900 shadow-inner"
                        style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
                    >
                      <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage: `linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                                        linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px)`,
                            backgroundSize: `${tileSize}px ${tileSize}px`,
                          }}
                      />

                      {TileComponent && (
                          <TileComponent
                              className={componentClassName}
                              style={{
                                ...customStyleVars,
                                ...rawCssStyles,
                              }}
                              {...Object.keys(texts).reduce((acc, textKey) => {
                                acc[textKey] = overrides[textKey]?.text ?? texts[textKey].text;
                                return acc;
                              }, {} as Record<string, string>)}
                          />
                      )}

                      {showBounds &&
                          tile.usedSpace.map(([ux, uy], idx) => (
                              <div
                                  key={idx}
                                  className="pointer-events-none absolute border-2 border-lime-400/80 bg-lime-400/30 transition-colors"
                                  style={{
                                    left: `${ux * tileSize}px`,
                                    top: `${uy * tileSize}px`,
                                    width: `${tileSize}px`,
                                    height: `${tileSize}px`,
                                  }}
                              />
                          ))}

                      {showBounds && (
                          <svg
                              className="pointer-events-none absolute inset-0 z-10"
                              width={widthPx}
                              height={heightPx}
                          >
                            <defs>
                              <marker
                                  id={`arrow-${key}`}
                                  viewBox="0 0 10 10"
                                  refX="6"
                                  refY="5"
                                  markerWidth="6"
                                  markerHeight="6"
                                  orient="auto-start-reverse"
                              >
                                <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                              </marker>
                            </defs>

                            {Object.entries(currentRoutes).map(([fromStr, toStr], routeIdx) => {
                              const start = getClosestEdgePoint(fromStr, tile.space, tileSize);
                              const end = getClosestEdgePoint(toStr, tile.space, tileSize);

                              return (
                                  <g key={routeIdx}>
                                    <line
                                        x1={start.x}
                                        y1={start.y}
                                        x2={end.x}
                                        y2={end.y}
                                        stroke="#38bdf8"
                                        strokeWidth="3"
                                        strokeDasharray="4 2"
                                        markerEnd={`url(#arrow-${key})`}
                                    />
                                    <circle cx={start.x} cy={start.y} r="4" fill="#0284c7" />
                                    <circle cx={end.x} cy={end.y} r="4" fill="#38bdf8" />
                                  </g>
                              );
                            })}
                          </svg>
                      )}
                    </div>
                  </div>

                  {tile.traversable && states.length > 0 && (
                      <div className="mt-3 border-t border-slate-700/60 pt-3">
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                          Traversable State:
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {states.map((stIdx) => (
                              <button
                                  key={stIdx}
                                  onClick={() => handleStateChange(key, stIdx)}
                                  className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                                      currentState === stIdx
                                          ? 'bg-sky-500 font-bold text-white'
                                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                              >
                                State {stIdx}
                              </button>
                          ))}
                        </div>
                      </div>
                  )}

                  {assetStates.length > 0 && (
                      <div className="mt-3 border-t border-slate-700/60 pt-3">
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                          Visual State:
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {assetStates.map((stateName) => (
                              <button
                                  key={stateName}
                                  onClick={() => handleAssetStateChange(key, stateName)}
                                  className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                                      currentAssetState === stateName
                                          ? 'bg-lime-500 font-bold text-slate-900'
                                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                              >
                                {stateName}
                              </button>
                          ))}
                        </div>
                      </div>
                  )}

                  {Object.keys(texts).length > 0 && (
                      <div className="mt-3 flex h-40 flex-col gap-3 overflow-y-auto border-t border-slate-700/60 pt-3">
                        <label className="block text-xs font-medium text-slate-400">
                          Text Elements:
                        </label>
                        {Object.entries(texts).map(([textKey, defaultConfig]) => {
                          const currentConfig = { ...defaultConfig, ...(overrides[textKey] ?? {}) };
                          return (
                              <div key={textKey} className="rounded border border-slate-700/40 bg-slate-900/50 p-2">
                                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-lime-400/70">
                                  {textKey}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <input
                                      type="text"
                                      value={currentConfig.text}
                                      onChange={(e) => handleTextOverride(key, textKey, 'text', e.target.value)}
                                      className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                                      placeholder="Content..."
                                  />
                                  <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={currentConfig.fill}
                                        onChange={(e) => handleTextOverride(key, textKey, 'fill', e.target.value)}
                                        className="h-6 w-10 cursor-pointer rounded border border-slate-600 bg-slate-700"
                                    />
                                    <input
                                        type="text"
                                        value={currentConfig.size}
                                        onChange={(e) => handleTextOverride(key, textKey, 'size', e.target.value)}
                                        className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 font-mono text-[10px] text-slate-100 focus:border-lime-500 focus:outline-none"
                                        placeholder="Size (e.g. 10px)"
                                    />
                                  </div>
                                </div>
                              </div>
                          );
                        })}
                      </div>
                  )}

                  {!tile.traversable && assetStates.length === 0 && Object.keys(texts).length === 0 && (
                      <div className="mt-3 border-t border-slate-700/60 pt-3 text-xs italic text-slate-500">
                        Fixed Component
                      </div>
                  )}
                </div>
            );
          })}
        </div>
      </div>
  );
}