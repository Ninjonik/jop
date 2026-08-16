import { randomUUID } from 'crypto';

import { createInitialStationLayout, placePieceAt } from '@/lib/station/layout';
import type {
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
      return existing;
    }

    const station = createStationDocument(sessionId, stationId, layoutOverride);
    await stationRepository.create(station);
    publishStationSnapshot(station);
    return station;
  },

  async getStation(sessionId: string, stationId: string) {
    return stationRepository.findBySessionAndStationId(sessionId, stationId);
  },

  async listStations(sessionId: string) {
    return stationRepository.listBySessionId(sessionId);
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
