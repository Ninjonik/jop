import type { RuntimeInterpreterPort, RuntimeInvalidation } from './runtime-interpreter';

export type OutboundRobloxCall = RuntimeInvalidation;

const outboundCalls: OutboundRobloxCall[] = [];

export const mockRuntimeInterpreter: RuntimeInterpreterPort = {
  async sessionChanged(event) {
    outboundCalls.unshift(event);

    if (outboundCalls.length > 100) {
      outboundCalls.length = 100;
    }
  },
};

export function getOutboundRobloxCalls(sessionId?: string) {
  return sessionId ? outboundCalls.filter((call) => call.sessionId === sessionId) : outboundCalls;
}
