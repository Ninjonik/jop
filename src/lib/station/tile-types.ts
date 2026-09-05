import type React from 'react';

export interface Space {
  x: number;
  y: number;
}

export type TraversableStateKey = string | number;
export type TraversableRouteMap = Record<string, string>;
export type TraversableStateMap = Partial<Record<TraversableStateKey, TraversableRouteMap>>;

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
    variants?: Record<string, string[]>;
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

export interface GroupSelection {
  state: string;
  variant: string;
}

export interface PieceOrientation {
  rotation: 0 | 180;
  mirrored: boolean;
}
