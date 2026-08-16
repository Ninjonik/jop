'use client';

import React, { useEffect } from 'react';
import TileSvg from '@/app/components/tiles/TileSvg';
import { getDefaultGroupSelection } from '@/app/components/tiles/tile-rendering';
import type {
  StateGroupRegistry,
  TextConfig,
  TileData,
  TraversableRouteMap,
} from '@/app/components/tiles/tile-catalog';

interface TileCatalogTileCardProps {
  tileKey: string;
  tile: TileData;
  tileSize: number;
  showBounds: boolean;
  stateGroups: StateGroupRegistry;
  groupSelections: Record<string, { state: string; variant: string }>;
  traversableSelection?: number;
  textOverrides: Record<string, Partial<TextConfig>>;
  onInitializeSelections: (
    tileKey: string,
    selections: Record<string, { state: string; variant: string }>
  ) => void;
  onGroupStateChange: (tileKey: string, groupKey: string, state: string) => void;
  onGroupVariantChange: (tileKey: string, groupKey: string, variant: string) => void;
  onTraversableChange: (tileKey: string, stateIdx: number) => void;
  onTextOverride: (
    tileKey: string,
    textKey: string,
    field: keyof TextConfig,
    value: string
  ) => void;
}

function getClosestEdgePoint(
  coordStr: string,
  space: { x: number; y: number },
  tileSize: number
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

function getGroupVariantOptions(
  tile: TileData,
  groupKey: string,
  stateName: string,
  stateGroups: StateGroupRegistry
): string[] {
  if (!tile.groups || !tile.groups[groupKey]) return [];

  const group = stateGroups[groupKey];
  const state = group?.states[stateName];
  if (!state) return [];

  return ['normal', ...Object.keys(state.variants || {})];
}

export default function TileCatalogTileCard({
  tileKey,
  tile,
  tileSize,
  showBounds,
  stateGroups,
  groupSelections,
  traversableSelection,
  textOverrides,
  onInitializeSelections,
  onGroupStateChange,
  onGroupVariantChange,
  onTraversableChange,
  onTextOverride,
}: TileCatalogTileCardProps) {
  useEffect(() => {
    if (Object.keys(groupSelections).length > 0 || !tile.groups) {
      return;
    }

    const initialSelections: Record<string, { state: string; variant: string }> = {};

    for (const groupKey of Object.keys(tile.groups)) {
      const selection = getDefaultGroupSelection(tile.groups, groupKey, stateGroups);
      if (selection.state) {
        initialSelections[groupKey] = selection;
      }
    }

    if (Object.keys(initialSelections).length > 0) {
      onInitializeSelections(tileKey, initialSelections);
    }
  }, [groupSelections, onInitializeSelections, stateGroups, tile.groups, tileKey]);

  if (!tile.space) {
    return null;
  }

  const widthPx = tile.space.x * tileSize;
  const heightPx = tile.space.y * tileSize;
  const traversableStates = tile.traversable
    ? Object.keys(tile.traversable).map(Number)
    : [];
  const currentTraversable =
    traversableSelection ?? (traversableStates.length > 0 ? traversableStates[0] : 0);
  const currentRoutes: TraversableRouteMap =
    tile.traversable && tile.traversable[currentTraversable]
      ? tile.traversable[currentTraversable]
      : {};
  const texts = tile.texts ?? {};
  const groupKeys = tile.groups ? Object.keys(tile.groups) : [];
  const hasGroups = groupKeys.length > 0;
  const hasTexts = Object.keys(texts).length > 0;
  const hasTraversable = traversableStates.length > 0;

  return (
    <div className="flex flex-col rounded-xl border border-slate-700 bg-slate-800 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
        <span className="font-mono text-sm font-semibold text-lime-300 capitalize">
          {tileKey}
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

          <TileSvg
            tileKey={tileKey}
            tile={tile}
            stateGroups={stateGroups}
            selections={groupSelections}
            textValues={Object.keys(texts).reduce((acc, textKey) => {
              acc[textKey] = textOverrides[textKey]?.text ?? texts[textKey].text;
              return acc;
            }, {} as Record<string, string>)}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-80"
          />

          {showBounds &&
            tile.usedSpace?.map(([ux, uy], idx) => (
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
                  id={`arrow-${tileKey}`}
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
                      markerEnd={`url(#arrow-${tileKey})`}
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

      {hasGroups &&
        groupKeys.map((groupKey) => {
          const group = stateGroups[groupKey];
          const config = tile.groups?.[groupKey];
          if (!group || !config) return null;

          const availableStates = config.states.filter((stateName) => group.states?.[stateName]);
          if (availableStates.length === 0) return null;

          const currentSelection = groupSelections[groupKey] || {
            state: '',
            variant: '',
          };
          const defaultSelection = getDefaultGroupSelection(tile.groups, groupKey, stateGroups);
          const currentState =
            currentSelection.state || defaultSelection.state || availableStates[0] || '';
          const currentVariant =
            currentSelection.variant ||
            defaultSelection.variant ||
            group.defaultVariant ||
            'normal';
          const variants = currentState
            ? getGroupVariantOptions(tile, groupKey, currentState, stateGroups)
            : ['normal'];

          return (
            <div key={groupKey} className="mt-3 border-t border-slate-700/60 pt-3">
              <label className="mb-1 block text-xs font-medium text-slate-400">
                {group.label}:
              </label>
              <div className="flex flex-wrap gap-2">
                <select
                  value={currentState}
                  onChange={(e) => onGroupStateChange(tileKey, groupKey, e.target.value)}
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
                    onChange={(e) => onGroupVariantChange(tileKey, groupKey, e.target.value)}
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
            {traversableStates.map((stateIdx) => (
              <button
                key={stateIdx}
                onClick={() => onTraversableChange(tileKey, stateIdx)}
                className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                  currentTraversable === stateIdx
                    ? 'bg-sky-500 font-bold text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                State {stateIdx}
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
              ...(textOverrides[textKey] ?? {}),
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
                    onChange={(e) => onTextOverride(tileKey, textKey, 'text', e.target.value)}
                    className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                    placeholder="Text content"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={currentConfig.fill}
                      onChange={(e) => onTextOverride(tileKey, textKey, 'fill', e.target.value)}
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                      placeholder="Color"
                    />
                    <input
                      type="text"
                      value={currentConfig.size}
                      onChange={(e) => onTextOverride(tileKey, textKey, 'size', e.target.value)}
                      className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-lime-500 focus:outline-none"
                      placeholder="Size"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
