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

// ============================================================================
// Group-based state system
// ============================================================================

/**
 * A state variant provides additional CSS properties that override or extend the base state.
 */
export interface StateVariant {
  [key: string]: string;
}

/**
 * A state definition within a group. It has a base set of CSS properties and
 * optional variants (like "blinking" for signals).
 */
export interface GroupState {
  /** Base CSS properties for this state */
  base: Record<string, string>;
  /** Optional variants that extend/override the base */
  variants?: Record<string, Record<string, string>>;
}

/**
 * A state group represents a category of related states (e.g., "signal", "occupation").
 */
export interface StateGroup {
  /** The available states in this group */
  states: Record<string, GroupState>;
  /** The default state name for this group */
  defaultState: string;
  /** The default variant name for this group */
  defaultVariant: string;
  /** Human-readable label for the group (used in UI) */
  label: string;
}

/**
 * Global registry of all state groups.
 * Components reference these groups by key.
 */
export type StateGroupRegistry = Record<string, StateGroup>;

/**
 * Component state configuration.
 * For each group the component uses, specify which states are available
 * and optionally override defaults.
 */
export interface ComponentGroups {
  [groupKey: string]: {
    /** List of state names from this group that the component supports */
    states: string[];
    /** Optional default state (overrides group default) */
    defaultState?: string;
    /** Optional default variant (overrides group default) */
    defaultVariant?: string;
  };
}

/**
 * TileData with group-based state configuration.
 */
export interface TileData {
  component: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  space: Space;
  usedSpace: [number, number][];
  traversable: false | TraversableStateMap;
  /** Group-based state configuration */
  groups?: ComponentGroups;
  /** Static styles that are always applied */
  staticStyles?: Record<string, string>;
  texts?: Record<string, TextConfig>;
}

export type TileCatalog = Record<string, TileData>;

interface ClientProps {
  tiles: TileCatalog;
  /** Global state group registry */
  stateGroups: StateGroupRegistry;
  tileSize?: number;
}

// ============================================================================
// Helper functions
// ============================================================================

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
  if (!cssString) return styles;
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

/**
 * Resolve the CSS properties for a given group, state, and variant.
 */
function resolveGroupState(
    group: StateGroup,
    stateName: string,
    variantName: string
): Record<string, string> {
  if (!group || !group.states) return {};

  const state = group.states[stateName];
  if (!state) return {};

  const result = { ...state.base };

  if (state.variants && state.variants[variantName]) {
    Object.assign(result, state.variants[variantName]);
  }

  return result;
}

/**
 * Resolve all CSS properties for a component based on selected group states.
 */
function resolveComponentStyles(
    tile: TileData,
    groupSelections: Record<string, { state: string; variant: string }>,
    stateGroups: StateGroupRegistry,
): Record<string, string> {
  let result: Record<string, string> = {};

  // Apply static styles first
  if (tile.staticStyles) {
    Object.assign(result, tile.staticStyles);
  }

  // Resolve group-based states
  if (tile.groups && stateGroups) {
    for (const [groupKey, config] of Object.entries(tile.groups)) {
      const group = stateGroups[groupKey];
      if (!group) continue;

      const selection = groupSelections[groupKey];
      if (!selection) continue;

      if (!config.states.includes(selection.state)) continue;

      const resolved = resolveGroupState(group, selection.state, selection.variant);
      Object.assign(result, resolved);
    }
  }

  return result;
}

/**
 * Get all available states for a component's group.
 */
function getGroupStateOptions(
    tile: TileData,
    groupKey: string,
    stateGroups: StateGroupRegistry
): string[] {
  if (!tile.groups || !tile.groups[groupKey]) return [];
  const config = tile.groups[groupKey];
  const group = stateGroups[groupKey];
  if (!group || !group.states) return [];

  return config.states.filter(state => group.states[state]);
}

/**
 * Get all available variants for a component's group state.
 */
function getGroupVariantOptions(
    tile: TileData,
    groupKey: string,
    stateName: string,
    stateGroups: StateGroupRegistry
): string[] {
  if (!tile.groups || !tile.groups[groupKey]) return [];
  const group = stateGroups[groupKey];
  if (!group) return [];

  const state = group.states[stateName];
  if (!state) return [];

  const variants = Object.keys(state.variants || {});
  return ['normal', ...variants];
}

/**
 * Get the default state and variant for a component's group.
 */
function getDefaultGroupSelection(
    tile: TileData,
    groupKey: string,
    stateGroups: StateGroupRegistry
): { state: string; variant: string } {
  if (!tile.groups || !tile.groups[groupKey]) {
    return { state: '', variant: '' };
  }

  const config = tile.groups[groupKey];
  const group = stateGroups[groupKey];
  if (!group) return { state: '', variant: '' };

  const defaultState = config.defaultState || group.defaultState;
  const defaultVariant = config.defaultVariant || group.defaultVariant;

  if (!config.states.includes(defaultState)) {
    return { state: config.states[0] || '', variant: defaultVariant };
  }

  return { state: defaultState, variant: defaultVariant };
}

// ============================================================================
// Main Component
// ============================================================================

export default function TileCatalogViewerClient({
                                                  tiles,
                                                  stateGroups,
                                                  tileSize = 75,
                                                }: ClientProps) {
  const [groupSelections, setGroupSelections] = useState<
      Record<string, Record<string, { state: string; variant: string }>>
  >({});

  const [showBounds, setShowBounds] = useState(true);
  const [textOverrides, setTextOverrides] = useState<
      Record<string, Record<string, Partial<TextConfig>>>
  >({});

  const [traversableSelections, setTraversableSelections] = useState<
      Record<string, number>
  >({});

  const safeStateGroups = stateGroups || {};

  const handleGroupStateChange = (
      tileKey: string,
      groupKey: string,
      state: string
  ) => {
    setGroupSelections((prev) => {
      const tileSelections = prev[tileKey] || {};
      const current = tileSelections[groupKey] || { state: '', variant: '' };
      const group = safeStateGroups[groupKey];
      const defaultVariant = group?.defaultVariant || 'normal';
      return {
        ...prev,
        [tileKey]: {
          ...tileSelections,
          [groupKey]: {
            ...current,
            state,
            variant: current.variant || defaultVariant,
          },
        },
      };
    });
  };

  const handleGroupVariantChange = (
      tileKey: string,
      groupKey: string,
      variant: string
  ) => {
    setGroupSelections((prev) => {
      const tileSelections = prev[tileKey] || {};
      const current = tileSelections[groupKey] || { state: '', variant: '' };
      return {
        ...prev,
        [tileKey]: {
          ...tileSelections,
          [groupKey]: {
            ...current,
            variant,
          },
        },
      };
    });
  };

  const handleTraversableChange = (tileKey: string, stateIdx: number) => {
    setTraversableSelections((prev) => ({
      ...prev,
      [tileKey]: stateIdx,
    }));
  };

  const handleTextOverride = (
      tileKey: string,
      textKey: string,
      field: keyof TextConfig,
      value: string
  ) => {
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

  // Initialize selections for a tile if not present
  const getTileSelections = (tileKey: string, tile: TileData) => {
    if (!groupSelections[tileKey]) {
      const initial: Record<string, { state: string; variant: string }> = {};
      if (tile.groups) {
        for (const [groupKey] of Object.entries(tile.groups)) {
          const defaultSelection = getDefaultGroupSelection(
              tile,
              groupKey,
              safeStateGroups
          );
          if (defaultSelection.state) {
            initial[groupKey] = defaultSelection;
          }
        }
      }
      setTimeout(() => {
        setGroupSelections((prev) => ({
          ...prev,
          [tileKey]: initial,
        }));
      }, 0);
      return initial;
    }
    return groupSelections[tileKey];
  };

  // If no tiles, show empty state
  if (!tiles || Object.keys(tiles).length === 0) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <p className="text-lg">No tiles found in catalog.</p>
        </div>
    );
  }

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
          {Object.entries(tiles || {}).map(([key, tile]) => {
            if (!tile || !tile.space) return null;

            const widthPx = tile.space.x * tileSize;
            const heightPx = tile.space.y * tileSize;

            const traversableStates = tile.traversable
                ? Object.keys(tile.traversable).map(Number)
                : [];
            const currentTraversable =
                traversableSelections[key] ??
                (traversableStates.length > 0 ? traversableStates[0] : 0);
            const currentRoutes: TraversableRouteMap =
                tile.traversable && tile.traversable[currentTraversable]
                    ? tile.traversable[currentTraversable]
                    : {};

            const tileSelections = groupSelections[key] || {};

            const resolvedStyles = resolveComponentStyles(
                tile,
                tileSelections,
                safeStateGroups
            );

            const texts = tile.texts ?? {};
            const overrides = textOverrides[key] ?? {};

            const customStyleVars: Record<string, string> = {};
            let rawCssStyles: CSSProperties = {};
            const stateClasses: string[] = [];

            Object.entries(resolvedStyles).forEach(([styleKey, value]) => {
              if (styleKey.startsWith('--')) {
                customStyleVars[styleKey] = value;
              } else if (styleKey === 'css') {
                rawCssStyles = parseCssString(value);
              } else if (styleKey === 'tailwind') {
                const tailwindClasses = value
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((cls) => (cls.startsWith('!') ? cls : `!${cls}`));
                stateClasses.push(...tailwindClasses);
              } else if (styleKey === 'class') {
                stateClasses.push(...value.split(/\s+/).filter(Boolean));
              }
            });

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

            const groupKeys = tile.groups ? Object.keys(tile.groups) : [];
            const hasGroups = groupKeys.length > 0;
            const hasTexts = Object.keys(texts).length > 0;
            const hasTraversable = traversableStates.length > 0;

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
                      {tile.space.x}×{tile.space.y} Tile
                      {tile.space.x * tile.space.y > 1 ? 's' : ''}
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
                          tile.usedSpace &&
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

                      {showBounds && hasTraversable && (
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

                            {Object.entries(currentRoutes).map(
                                ([fromStr, toStr], routeIdx) => {
                                  const start = getClosestEdgePoint(
                                      fromStr,
                                      tile.space,
                                      tileSize
                                  );
                                  const end = getClosestEdgePoint(
                                      toStr,
                                      tile.space,
                                      tileSize
                                  );

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
                                }
                            )}
                          </svg>
                      )}
                    </div>
                  </div>

                  {hasGroups &&
                      groupKeys.map((groupKey) => {
                        const group = safeStateGroups[groupKey];
                        if (!group) return null;

                        const config = tile.groups?.[groupKey];
                        if (!config) return null;

                        const availableStates = config.states.filter(
                            (s) => group.states && group.states[s]
                        );
                        if (availableStates.length === 0) return null;

                        const currentSelection = tileSelections[groupKey] || {
                          state: '',
                          variant: '',
                        };
                        const currentState =
                            currentSelection.state ||
                            getDefaultGroupSelection(tile, groupKey, safeStateGroups).state ||
                            availableStates[0] ||
                            '';
                        const currentVariant =
                            currentSelection.variant ||
                            getDefaultGroupSelection(tile, groupKey, safeStateGroups).variant ||
                            group.defaultVariant ||
                            'normal';

                        const variants = currentState
                            ? getGroupVariantOptions(
                                tile,
                                groupKey,
                                currentState,
                                safeStateGroups
                            )
                            : ['normal'];

                        return (
                            <div key={groupKey} className="mt-3 border-t border-slate-700/60 pt-3">
                              <label className="mb-1 block text-xs font-medium text-slate-400">
                                {group.label}:
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <select
                                    value={currentState}
                                    onChange={(e) =>
                                        handleGroupStateChange(key, groupKey, e.target.value)
                                    }
                                    className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                                >
                                  {availableStates.map((stateName) => (
                                      <option key={stateName} value={stateName}>
                                        {stateName}
                                      </option>
                                  ))}
                                </select>
                                {variants.length > 1 && (
                                    <select
                                        value={currentVariant}
                                        onChange={(e) =>
                                            handleGroupVariantChange(key, groupKey, e.target.value)
                                        }
                                        className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                                    >
                                      {variants.map((variantName) => (
                                          <option key={variantName} value={variantName}>
                                            {variantName}
                                          </option>
                                      ))}
                                    </select>
                                )}
                              </div>
                            </div>
                        );
                      })}

                  {hasTraversable && (
                      <div className="mt-3 border-t border-slate-700/60 pt-3">
                        <label className="mb-1 block text-xs font-medium text-slate-400">
                          Traversable State:
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {traversableStates.map((stIdx) => (
                              <button
                                  key={stIdx}
                                  onClick={() => handleTraversableChange(key, stIdx)}
                                  className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                                      currentTraversable === stIdx
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

                  {hasTexts && (
                      <div className="mt-3 flex max-h-40 flex-col gap-3 overflow-y-auto border-t border-slate-700/60 pt-3">
                        <label className="block text-xs font-medium text-slate-400">
                          Text Elements:
                        </label>
                        {Object.entries(texts).map(([textKey, defaultConfig]) => {
                          const currentConfig = {
                            ...defaultConfig,
                            ...(overrides[textKey] ?? {}),
                          };
                          return (
                              <div
                                  key={textKey}
                                  className="rounded border border-slate-700/40 bg-slate-900/50 p-2"
                              >
                                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-lime-400/70">
                                  {textKey}
                                </div>
                                <div className="flex flex-col gap-2">
                                  <input
                                      type="text"
                                      value={currentConfig.text}
                                      onChange={(e) =>
                                          handleTextOverride(
                                              key,
                                              textKey,
                                              'text',
                                              e.target.value
                                          )
                                      }
                                      className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                                      placeholder="Content..."
                                  />
                                  <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={currentConfig.fill}
                                        onChange={(e) =>
                                            handleTextOverride(
                                                key,
                                                textKey,
                                                'fill',
                                                e.target.value
                                            )
                                        }
                                        className="h-6 w-10 cursor-pointer rounded border border-slate-600 bg-slate-700"
                                    />
                                    <input
                                        type="text"
                                        value={currentConfig.size}
                                        onChange={(e) =>
                                            handleTextOverride(
                                                key,
                                                textKey,
                                                'size',
                                                e.target.value
                                            )
                                        }
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

                  {!hasGroups && !hasTexts && !hasTraversable && (
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