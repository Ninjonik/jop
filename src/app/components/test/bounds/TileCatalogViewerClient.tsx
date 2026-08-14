'use client';

import React, { useState } from 'react';
import TileCatalogTileCard from './TileCatalogTileCard';

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

export interface StateVariant {
  [key: string]: string;
}

export interface GroupState {
  base: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
}

export interface StateGroup {
  states: Record<string, GroupState>;
  defaultState: string;
  defaultVariant: string;
  label: string;
}

export type StateGroupRegistry = Record<string, StateGroup>;

export interface ComponentGroups {
  [groupKey: string]: {
    states: string[];
    defaultState?: string;
    defaultVariant?: string;
  };
}

export interface TileData {
  component: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  space: Space;
  usedSpace: [number, number][];
  traversable: false | TraversableStateMap;
  groups?: ComponentGroups;
  staticStyles?: Record<string, string>;
  texts?: Record<string, TextConfig>;
}

export type TileCatalog = Record<string, TileData>;

interface ClientProps {
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
  tileSize?: number;
}

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

  const handleInitializeSelections = (
    tileKey: string,
    selections: Record<string, { state: string; variant: string }>
  ) => {
    setGroupSelections((prev) => {
      if (prev[tileKey] && Object.keys(prev[tileKey]).length > 0) {
        return prev;
      }

      return {
        ...prev,
        [tileKey]: selections,
      };
    });
  };

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
        {Object.entries(tiles || {}).map(([key, tile]) =>
          tile ? (
            <TileCatalogTileCard
              key={key}
              tileKey={key}
              tile={tile}
              tileSize={tileSize}
              showBounds={showBounds}
              stateGroups={safeStateGroups}
              groupSelections={groupSelections[key] || {}}
              traversableSelection={traversableSelections[key]}
              textOverrides={textOverrides[key] ?? {}}
              onInitializeSelections={handleInitializeSelections}
              onGroupStateChange={handleGroupStateChange}
              onGroupVariantChange={handleGroupVariantChange}
              onTraversableChange={handleTraversableChange}
              onTextOverride={handleTextOverride}
            />
          ) : null
        )}
      </div>
    </div>
  );
}
