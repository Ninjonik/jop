import type { StationDocument } from './domain';
import type { StationLayout } from './layout';

export type SwitchControlSlot = 'main' | 'upper' | 'lower';
export type SwitchMotorPosition = 'left' | 'right';
export type SwitchMotorPositions = Partial<Record<SwitchControlSlot, SwitchMotorPosition>>;

export type ConnectedSwitchControl = {
  buttonPieceId: string;
  switchPieceId: string;
  slot: SwitchControlSlot;
};

function normalizeSwitchType(pieceType: string) {
  return pieceType.endsWith('NoOcp') ? pieceType.slice(0, -'NoOcp'.length) : pieceType;
}

export function isPhysicalSwitchType(pieceType: string) {
  const normalized = normalizeSwitchType(pieceType);
  return (
    normalized === 'singleSwitch' ||
    normalized === 'extendedSwitch' ||
    normalized === 'crossoverSwitch'
  );
}

export function isCrossoverSwitchType(pieceType: string) {
  return normalizeSwitchType(pieceType) === 'crossoverSwitch';
}

export function isDivergingSwitchTraversal(pieceType: string, traversalState: string) {
  const normalized = normalizeSwitchType(pieceType);
  if (normalized === 'singleSwitch' || normalized === 'extendedSwitch') {
    return traversalState !== 'blTbr';
  }
  if (normalized === 'crossoverSwitch') {
    return traversalState === 'blTtr';
  }
  return false;
}

export function isOccupationVisibleForSwitchAlignment(
  pieceType: string,
  occupationState: string,
  alignedState: string | null | undefined,
) {
  const normalized = normalizeSwitchType(pieceType);
  if (normalized === 'singleSwitch') {
    return alignedState === 'blTtr'
      ? occupationState === 't' || occupationState === 'blTtr'
      : occupationState === 'blTbr';
  }
  if (normalized === 'extendedSwitch') {
    return occupationState === (alignedState ?? 'blTbr');
  }
  if (normalized === 'crossoverSwitch') {
    return alignedState === 'blTtr'
      ? occupationState === 'blTtr'
      : occupationState === 't' || occupationState === 'b' || occupationState === 'tlTtrAblTbr';
  }
  return true;
}

function parseSwitchEndpoint(endpointKey: string) {
  const [pieceId, rawSlot] = endpointKey.split(':', 2);
  const slot = rawSlot ?? 'main';
  if (slot !== 'main' && slot !== 'upper' && slot !== 'lower') {
    return null;
  }

  return { pieceId, slot } as const;
}

export function getConnectedSwitchControl(
  layout: StationLayout,
  buttonPieceId: string,
): ConnectedSwitchControl | null {
  const button = layout.pieces[buttonPieceId];
  if (button?.type !== 'switchButton') {
    return null;
  }

  const linkedEndpoint =
    layout.connections[buttonPieceId] ??
    Object.entries(layout.connections).find(([, target]) => target === buttonPieceId)?.[0];
  if (!linkedEndpoint) {
    return null;
  }

  const endpoint = parseSwitchEndpoint(linkedEndpoint);
  const switchPiece = endpoint ? layout.pieces[endpoint.pieceId] : null;
  if (!endpoint || !switchPiece || !isPhysicalSwitchType(switchPiece.type)) {
    return null;
  }

  return {
    buttonPieceId,
    switchPieceId: endpoint.pieceId,
    slot: endpoint.slot,
  };
}

export function getConnectedSwitchControls(
  layout: StationLayout,
  switchPieceId: string,
): ConnectedSwitchControl[] {
  return Object.entries(layout.pieces)
    .filter(([, piece]) => piece.type === 'switchButton')
    .flatMap(([buttonPieceId]) => {
      const control = getConnectedSwitchControl(layout, buttonPieceId);
      return control?.switchPieceId === switchPieceId ? [control] : [];
    });
}

export function getRequiredSwitchMotorPositions(
  pieceType: string,
  traversableState: string,
): SwitchMotorPositions {
  const normalized = normalizeSwitchType(pieceType);

  if (normalized === 'singleSwitch') {
    if (traversableState === 'blTbr') return { main: 'left' };
    if (traversableState === 'blTtr') return { main: 'right' };
    return {};
  }

  if (normalized === 'extendedSwitch') {
    if (traversableState === 'blTbr') return { lower: 'left', upper: 'right' };
    if (traversableState === 'blTtr') return { lower: 'right', upper: 'left' };
    if (traversableState === 'blTmr') return { lower: 'right', upper: 'right' };
    return {};
  }

  if (normalized === 'crossoverSwitch') {
    if (
      traversableState === 't' ||
      traversableState === 'b' ||
      traversableState === 'tlTtrAblTbr'
    ) {
      return { main: 'left' };
    }
    if (traversableState === 'blTtr') return { main: 'right' };
  }

  return {};
}

export function getDefaultSwitchMotorPositions(pieceType: string): SwitchMotorPositions {
  const normalized = normalizeSwitchType(pieceType);
  if (normalized === 'singleSwitch') return { main: 'left' };
  if (normalized === 'extendedSwitch') return { lower: 'left', upper: 'right' };
  if (normalized === 'crossoverSwitch') return { main: 'left' };
  return {};
}

export function getMotorPositionsForTraversableState(
  pieceType: string,
  traversableState: string,
): SwitchMotorPositions {
  const normalized = normalizeSwitchType(pieceType);
  if (normalized === 'crossoverSwitch') {
    if (
      traversableState === 't' ||
      traversableState === 'b' ||
      traversableState === 'tlTtrAblTbr'
    ) {
      return { main: 'left' };
    }
    if (traversableState === 'blTtr') return { main: 'right' };
  }

  return getRequiredSwitchMotorPositions(pieceType, traversableState);
}

export function getTraversableStateForMotorPositions(
  pieceType: string,
  positions: SwitchMotorPositions,
) {
  const normalized = normalizeSwitchType(pieceType);

  if (normalized === 'singleSwitch') {
    return positions.main === 'right' ? 'blTtr' : 'blTbr';
  }

  if (normalized === 'extendedSwitch') {
    const lower = positions.lower ?? 'left';
    const upper = positions.upper ?? 'left';
    if (lower === 'left' && upper === 'left') return null;
    if (lower === 'left') return 'blTbr';
    return upper === 'left' ? 'blTtr' : 'blTmr';
  }

  if (normalized === 'crossoverSwitch') {
    return positions.main === 'right' ? 'blTtr' : 'tlTtrAblTbr';
  }

  return null;
}

function getButtonLockPosition(state: string): SwitchMotorPosition | 'setting' | null {
  if (state === 'leftSet') return 'left';
  if (state === 'rightSet') return 'right';
  if (state === 'leftSetting' || state === 'rightSetting') return 'setting';
  return null;
}

export function isSwitchTraversalAllowedByButtonLocks(
  station: StationDocument,
  switchPieceId: string,
  traversableState: string,
) {
  const piece = station.layout.pieces[switchPieceId];
  if (!piece || !isPhysicalSwitchType(piece.type)) {
    return true;
  }

  const required = getRequiredSwitchMotorPositions(piece.type, traversableState);
  const controls = getConnectedSwitchControls(station.layout, switchPieceId);

  return controls.every((control) => {
    const buttonState = station.layout.pieces[control.buttonPieceId]?.state.groups.switch?.state;
    const lock = getButtonLockPosition(buttonState ?? 'default');
    if (lock === 'setting') {
      return false;
    }

    return lock === null || required[control.slot] === undefined || required[control.slot] === lock;
  });
}
