import type { SwitchPosition } from '@/lib/station/domain';
import type { SwitchControlSlot } from '@/lib/station/switches';

export type OutboundRobloxCall = {
  type: 'switch:set-position';
  sessionId: string;
  stationId: string;
  pieceId: string;
  controlSlot: SwitchControlSlot;
  position: SwitchPosition;
  issuedAt: string;
};

const outboundCalls: OutboundRobloxCall[] = [];

export interface RobloxControlPort {
  setSwitchPosition(input: {
    sessionId: string;
    stationId: string;
    pieceId: string;
    controlSlot: SwitchControlSlot;
    position: SwitchPosition;
  }): Promise<{
    ok: true;
    acknowledgedAt: string;
  }>;
}

export const mockRobloxControlPort: RobloxControlPort = {
  async setSwitchPosition(input) {
    const acknowledgedAt = new Date().toISOString();

    outboundCalls.unshift({
      type: 'switch:set-position',
      sessionId: input.sessionId,
      stationId: input.stationId,
      pieceId: input.pieceId,
      controlSlot: input.controlSlot,
      position: input.position,
      issuedAt: acknowledgedAt,
    });

    if (outboundCalls.length > 100) {
      outboundCalls.length = 100;
    }

    return {
      ok: true,
      acknowledgedAt,
    };
  },
};

export function getOutboundRobloxCalls(sessionId?: string) {
  return sessionId ? outboundCalls.filter((call) => call.sessionId === sessionId) : outboundCalls;
}
