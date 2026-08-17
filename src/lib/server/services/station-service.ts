import { randomUUID } from 'crypto';

import {
  createInitialStationLayout,
  getLineblockPremainLinksFromLayout,
  isLineblockPieceType,
  placePieceAt,
} from '@/lib/station/layout';
import type {
  LineblockActionCommand,
  LineblockActionType,
  PendingAction,
  SessionDocument,
  SessionLineblockLink,
  StationActionLogDocument,
  StationDocument,
  SwitchSetPositionCommand,
} from '@/lib/station/domain';
import { deserializeStationLayout, serializeStationLayout } from '@/lib/station/domain';
import { stateGroups, tiles } from '@/app/data/tiles';

import { publishStationSnapshot } from '../station-events';
import { stationActionLogRepository } from '../repositories/station-action-log-repository';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { mockRobloxControlPort } from '../roblox/mock-roblox-port';

function nowIso() {
  return new Date().toISOString();
}

function createStationDocument(
  sessionId: string,
  stationId: string,
  layoutOverride?: StationDocument['layout']
): StationDocument {
  const createdAt = nowIso();
  const layout = layoutOverride ?? serializeStationLayout(createDemoStationLayout());

  return {
    _id: randomUUID(),
    sessionId,
    stationId,
    revision: 0,
    layout,
    runtime: {
      pendingActions: {},
      lineblockPremainLinks: {},
      premainSignalStates: {},
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function createDemoStationLayout() {
  const layout = createInitialStationLayout(8, 5, tiles, stateGroups);

  placePieceAt(layout, 'track', 0, 2, tiles, stateGroups);
  placePieceAt(layout, 'track', 1, 2, tiles, stateGroups);
  placePieceAt(layout, 'switchButton', 2, 1, tiles, stateGroups);
  const switchId = placePieceAt(layout, 'singleSwitch', 4, 1, tiles, stateGroups);
  placePieceAt(layout, 'track', 6, 2, tiles, stateGroups);
  placePieceAt(layout, 'entrySignal', 7, 2, tiles, stateGroups);

  const switchButtonId = Object.entries(layout.pieces).find(
    ([, piece]) => piece.type === 'switchButton'
  )?.[0];

  if (switchButtonId) {
    layout.connections[switchButtonId] = `${switchId}:main`;
    layout.connections[`${switchId}:main`] = switchButtonId;
  }

  return layout;
}

function bumpRevision(station: StationDocument) {
  station.revision += 1;
  station.updatedAt = nowIso();
}

async function saveAndPublish(station: StationDocument) {
  await stationRepository.save(station);
  publishStationSnapshot(station);
}

function ensureStationRuntimeState(station: StationDocument) {
  const existingRuntime = station.runtime ?? {
    pendingActions: {},
    lineblockPremainLinks: {},
    premainSignalStates: {},
  };

  station.runtime = {
    pendingActions: existingRuntime.pendingActions ?? {},
    lineblockPremainLinks: getLineblockPremainLinksFromLayout(station.layout),
    premainSignalStates: existingRuntime.premainSignalStates ?? {},
  };

  syncPremainAvailability(station);

  return station;
}

function getLineblockVisualState(station: StationDocument, pieceId: string) {
  return station.layout.pieces[pieceId]?.state.groups.lineblock?.state ?? 'default';
}

function setLineblockVisualState(station: StationDocument, pieceId: string, state: string) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    throw new Error(`Lineblock piece "${pieceId}" was not found.`);
  }

  piece.state.groups.lineblock = {
    state,
    variant: 'normal',
  };
}

function syncPremainAvailability(station: StationDocument) {
  if (!station.runtime) {
    station.runtime = {
      pendingActions: {},
      lineblockPremainLinks: getLineblockPremainLinksFromLayout(station.layout),
      premainSignalStates: {},
    };
  }

  const nextStates: StationDocument['runtime']['premainSignalStates'] = {};

  Object.values(station.runtime.lineblockPremainLinks).forEach((link) => {
    nextStates[link.premainSignalPieceId] = {
      linkedLineblockPieceId: link.lineblockPieceId,
      canBuildPath: getLineblockVisualState(station, link.lineblockPieceId) === 'sendingFree',
    };
  });

  station.runtime.premainSignalStates = nextStates;
}

function getLinkedLineblock(station: StationDocument, session: SessionDocument, pieceId: string) {
  const link = Object.values(session.topology.lineblockLinks).find(
    (entry) =>
      (entry.a.stationId === station.stationId && entry.a.pieceId === pieceId) ||
      (entry.b.stationId === station.stationId && entry.b.pieceId === pieceId)
  );

  if (!link) {
    return null;
  }

  const remote =
    link.a.stationId === station.stationId && link.a.pieceId === pieceId ? link.b : link.a;

  return {
    link,
    remote,
  };
}

function validateLineblockActionStates(
  actionType: LineblockActionType,
  localState: string,
  remoteState: string
) {
  if (actionType === 'lineblock:grant-consent') {
    if (localState !== 'default' || remoteState !== 'default') {
      throw new Error('Lineblock consent can only be granted from default/default.');
    }

    return;
  }

  if (actionType === 'lineblock:revoke-consent') {
    if (localState !== 'receivingFree' || remoteState !== 'sendingFree') {
      throw new Error('Lineblock consent can only be revoked from receivingFree/sendingFree.');
    }

    return;
  }

  if (actionType === 'lineblock:mark-departed') {
    if (localState !== 'sendingFree' || remoteState !== 'receivingFree') {
      throw new Error('A departure can only be marked from sendingFree/receivingFree.');
    }

    return;
  }

  if (actionType === 'lineblock:mark-arrived') {
    if (localState !== 'receiving' || remoteState !== 'sending') {
      throw new Error('Arrival acknowledgement can only be marked from receiving/sending.');
    }
  }
}

function applyLineblockActionStates(
  actionType: LineblockActionType,
  localStation: StationDocument,
  localPieceId: string,
  remoteStation: StationDocument,
  remotePieceId: string
) {
  if (actionType === 'lineblock:grant-consent') {
    setLineblockVisualState(localStation, localPieceId, 'receivingFree');
    setLineblockVisualState(remoteStation, remotePieceId, 'sendingFree');
    return;
  }

  if (actionType === 'lineblock:revoke-consent') {
    setLineblockVisualState(localStation, localPieceId, 'default');
    setLineblockVisualState(remoteStation, remotePieceId, 'default');
    return;
  }

  if (actionType === 'lineblock:mark-departed') {
    setLineblockVisualState(localStation, localPieceId, 'sending');
    setLineblockVisualState(remoteStation, remotePieceId, 'receiving');
    return;
  }

  setLineblockVisualState(localStation, localPieceId, 'receivingFree');
  setLineblockVisualState(remoteStation, remotePieceId, 'sendingFree');
}

function createPendingAction(command: SwitchSetPositionCommand): PendingAction {
  return {
    id: command.commandId,
    type: command.type,
    status: 'queued',
    sessionId: command.sessionId,
    stationId: command.stationId,
    issuedAt: command.issuedAt,
    startedAt: null,
    dueAt: new Date(Date.now() + 1200).toISOString(),
    finishedAt: null,
    payload: command.payload,
  };
}

function toActionLog(station: StationDocument, action: PendingAction): StationActionLogDocument {
  return {
    _id: randomUUID(),
    sessionId: station.sessionId,
    stationId: station.stationId,
    actionId: action.id,
    type: action.type,
    status: action.status === 'queued' || action.status === 'running' ? 'cancelled' : action.status,
    issuedAt: action.issuedAt,
    startedAt: action.startedAt,
    finishedAt: action.finishedAt,
    payload: action.payload,
    result: action.result,
    error: action.error,
  };
}

async function completeSwitchAction(command: SwitchSetPositionCommand) {
  const station = await stationRepository.findBySessionAndStationId(command.sessionId, command.stationId);
  if (!station) {
    return;
  }

  const action = station.runtime.pendingActions[command.commandId];
  if (!action) {
    return;
  }

  action.status = 'running';
  action.startedAt = nowIso();
  bumpRevision(station);
  await saveAndPublish(station);

  const layout = deserializeStationLayout(station.layout);
  const piece = layout.pieces[command.payload.pieceId];

  if (!piece || piece.type !== 'switchButton') {
    action.status = 'failed';
    action.finishedAt = nowIso();
    action.error = {
      code: 'SWITCH_NOT_FOUND',
      message: `Switch button piece "${command.payload.pieceId}" was not found.`,
    };
  } else {
    await mockRobloxControlPort.setSwitchPosition({
      sessionId: command.sessionId,
      stationId: command.stationId,
      pieceId: command.payload.pieceId,
      position: command.payload.position,
    });

    piece.state.groups.switch = {
      state: command.payload.position,
      variant: 'normal',
    };

    action.status = 'completed';
    action.finishedAt = nowIso();
    action.result = {
      pieceId: command.payload.pieceId,
      position: command.payload.position,
    };
    station.layout = serializeStationLayout(layout);
  }

  const finalAction = { ...action };
  delete station.runtime.pendingActions[command.commandId];
  bumpRevision(station);
  await stationActionLogRepository.create(toActionLog(station, finalAction));
  await saveAndPublish(station);
}

export const stationService = {
  async createMockSession() {
    const createdAt = nowIso();
    const session: SessionDocument = {
      _id: `mock-${randomUUID().slice(0, 8)}`,
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      mockMode: true,
      topology: {
        lineblockLinks: {},
      },
    };

    await sessionRepository.create(session);
    return session;
  },

  async ensureStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout']
  ) {
    const existing = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (existing) {
      return ensureStationRuntimeState(existing);
    }

    const station = createStationDocument(sessionId, stationId, layoutOverride);
    await stationRepository.create(station);
    publishStationSnapshot(station);
    return station;
  },

  async getStation(sessionId: string, stationId: string) {
    const station = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    return station ? ensureStationRuntimeState(station) : null;
  },

  async listStations(sessionId: string) {
    const stations = await stationRepository.listBySessionId(sessionId);
    return stations.map((station) => ensureStationRuntimeState(station));
  },

  async getSession(sessionId: string) {
    return sessionRepository.findById(sessionId);
  },

  async createStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout']
  ) {
    return this.ensureStation(sessionId, stationId, layoutOverride);
  },

  async createLineblockLink(
    sessionId: string,
    endpoints: Pick<SessionLineblockLink, 'a' | 'b'>
  ) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }

    if (
      endpoints.a.stationId === endpoints.b.stationId &&
      endpoints.a.pieceId === endpoints.b.pieceId
    ) {
      throw new Error('Lineblock link endpoints must be different.');
    }

    const stations = await stationRepository.listBySessionId(sessionId);
    const stationsById = new Map(stations.map((station) => [station.stationId, station]));
    const stationA = stationsById.get(endpoints.a.stationId);
    const stationB = stationsById.get(endpoints.b.stationId);

    if (!stationA || !stationB) {
      throw new Error('Both stations must exist in the session.');
    }

    const pieceA = stationA.layout.pieces[endpoints.a.pieceId];
    const pieceB = stationB.layout.pieces[endpoints.b.pieceId];

    if (!pieceA || pieceA.type !== 'lineblock') {
      throw new Error(`Station ${endpoints.a.stationId} does not contain lineblock ${endpoints.a.pieceId}.`);
    }

    if (!pieceB || pieceB.type !== 'lineblock') {
      throw new Error(`Station ${endpoints.b.stationId} does not contain lineblock ${endpoints.b.pieceId}.`);
    }

    const linkAlreadyExists = Object.values(session.topology.lineblockLinks).some(
      (existingLink) =>
        [existingLink.a, existingLink.b].some(
          (endpoint) =>
            (endpoint.stationId === endpoints.a.stationId && endpoint.pieceId === endpoints.a.pieceId) ||
            (endpoint.stationId === endpoints.b.stationId && endpoint.pieceId === endpoints.b.pieceId)
        )
    );

    if (linkAlreadyExists) {
      throw new Error('Each lineblock can only be linked to one other station lineblock.');
    }

    const linkId = randomUUID();
    const createdAt = nowIso();
    session.topology.lineblockLinks[linkId] = {
      id: linkId,
      sessionId,
      a: endpoints.a,
      b: endpoints.b,
      createdAt,
    };
    session.updatedAt = createdAt;

    await sessionRepository.save(session);
    return session.topology.lineblockLinks[linkId];
  },

  async submitLineblockAction(command: LineblockActionCommand) {
    const localStation = await stationRepository.findBySessionAndStationId(
      command.sessionId,
      command.stationId
    );
    if (!localStation) {
      throw new Error('Station not found.');
    }

    ensureStationRuntimeState(localStation);

    const localPiece = localStation.layout.pieces[command.payload.pieceId];
    if (!localPiece || !isLineblockPieceType(localPiece.type)) {
      throw new Error(`Lineblock piece "${command.payload.pieceId}" was not found.`);
    }

    const session = await sessionRepository.findById(command.sessionId);
    if (!session) {
      throw new Error('Session not found.');
    }

    const linked = getLinkedLineblock(localStation, session, command.payload.pieceId);
    if (!linked) {
      throw new Error('This lineblock is not linked to another station lineblock.');
    }

    const remoteStation = await stationRepository.findBySessionAndStationId(
      command.sessionId,
      linked.remote.stationId
    );
    if (!remoteStation) {
      throw new Error('Linked remote station was not found.');
    }

    ensureStationRuntimeState(remoteStation);

    const remotePiece = remoteStation.layout.pieces[linked.remote.pieceId];
    if (!remotePiece || !isLineblockPieceType(remotePiece.type)) {
      throw new Error('Linked remote lineblock was not found.');
    }

    const localState = getLineblockVisualState(localStation, command.payload.pieceId);
    const remoteState = getLineblockVisualState(remoteStation, linked.remote.pieceId);
    validateLineblockActionStates(command.type, localState, remoteState);

    applyLineblockActionStates(
      command.type,
      localStation,
      command.payload.pieceId,
      remoteStation,
      linked.remote.pieceId
    );

    syncPremainAvailability(localStation);
    syncPremainAvailability(remoteStation);
    bumpRevision(localStation);
    bumpRevision(remoteStation);
    await saveAndPublish(localStation);
    await saveAndPublish(remoteStation);

    return {
      localStation,
      remoteStation,
    };
  },

  async submitSwitchSetPosition(command: SwitchSetPositionCommand) {
    const station = await stationRepository.findBySessionAndStationId(command.sessionId, command.stationId);
    if (!station) {
      throw new Error('Station not found.');
    }

    const action = createPendingAction(command);
    station.runtime.pendingActions[action.id] = action;
    bumpRevision(station);
    await saveAndPublish(station);

    setTimeout(() => {
      void completeSwitchAction(command);
    }, 800);

    return action;
  },

  async applyMockInboundSwitchPosition(command: SwitchSetPositionCommand) {
    const station = await stationRepository.findBySessionAndStationId(command.sessionId, command.stationId);
    if (!station) {
      throw new Error('Station not found.');
    }

    const layout = deserializeStationLayout(station.layout);
    const piece = layout.pieces[command.payload.pieceId];

    if (!piece || piece.type !== 'switchButton') {
      throw new Error('Switch button piece not found.');
    }

    piece.state.groups.switch = {
      state: command.payload.position,
      variant: 'normal',
    };

    station.layout = serializeStationLayout(layout);
    bumpRevision(station);
    await saveAndPublish(station);
    return station;
  },
};
