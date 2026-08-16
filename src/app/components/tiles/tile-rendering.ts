import type {
  ComponentGroups,
  GroupSelection,
  StateGroup,
  StateGroupRegistry,
  TileData,
} from './tile-catalog';

export function getDefaultGroupSelection(
  groups: ComponentGroups | undefined,
  groupKey: string,
  stateGroups: StateGroupRegistry
): GroupSelection {
  if (!groups || !groups[groupKey]) {
    return { state: '', variant: '' };
  }

  const config = groups[groupKey];
  const group = stateGroups[groupKey];
  if (!group) {
    return { state: '', variant: '' };
  }

  const defaultState = config.defaultState || group.defaultState;
  const defaultVariant = config.defaultVariant || group.defaultVariant;

  if (!config.states.includes(defaultState)) {
    return { state: config.states[0] || '', variant: defaultVariant };
  }

  return { state: defaultState, variant: defaultVariant };
}

export function getInitialGroupSelections(
  tile: TileData,
  stateGroups: StateGroupRegistry
): Record<string, GroupSelection> {
  if (!tile.groups) {
    return {};
  }

  const initialSelections: Record<string, GroupSelection> = {};

  for (const groupKey of Object.keys(tile.groups)) {
    const selection = getDefaultGroupSelection(tile.groups, groupKey, stateGroups);
    if (selection.state) {
      initialSelections[groupKey] = selection;
    }
  }

  return initialSelections;
}

export function getDefaultTextValues(tile: TileData): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tile.texts ?? {}).map(([textKey, config]) => [textKey, config.text])
  );
}

function resolveGroupState(
  group: StateGroup,
  stateName: string,
  variantName: string
): Record<string, string> {
  const state = group?.states?.[stateName];
  if (!state) {
    return {};
  }

  const result = { ...state.base };

  if (state.variants && state.variants[variantName]) {
    Object.assign(result, state.variants[variantName]);
  }

  return result;
}

export function resolveComponentStyles(
  tile: TileData,
  selections: Record<string, GroupSelection>,
  stateGroups: StateGroupRegistry
): Record<string, string> {
  const result: Record<string, string> = {};

  if (tile.staticStyles) {
    Object.assign(result, tile.staticStyles);
  }

  if (!tile.groups) {
    return result;
  }

  for (const [groupKey, config] of Object.entries(tile.groups)) {
    const group = stateGroups[groupKey];
    const selection = selections[groupKey];

    if (!group || !selection || !config.states.includes(selection.state)) {
      continue;
    }

    Object.assign(result, resolveGroupState(group, selection.state, selection.variant));
  }

  return result;
}
