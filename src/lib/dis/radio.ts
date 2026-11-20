import type { ChatContact, ChatEndpoint } from './chat';

export const RADIO_LEASE_MS = 20_000;
export const RADIO_HEARTBEAT_MS = 5_000;
export const radioActions = [
  'call-dispatcher',
  'answer',
  'hangup',
  'emergency-session',
  'emergency-station',
  'emergency-stop',
] as const;
export type RadioAction = (typeof radioActions)[number];
export type RadioNormalCall = {
  id: string;
  contact: ChatContact;
  incoming: boolean;
  phase: 'ringing' | 'connected';
};
export type RadioEmergency = {
  id: string;
  origin: ChatContact;
  scope: 'session' | 'station';
  stationId: string | null;
  outgoing: boolean;
};
export type RadioTerminalState = {
  ownerSocketId: string | null;
  sessionId: string | null;
  endpoint: ChatEndpoint | null;
  expiresAt: number | null;
  call: RadioNormalCall | null;
  emergencies: RadioEmergency[];
  notice: string;
};
export const emptyRadioTerminal: RadioTerminalState = {
  ownerSocketId: null,
  sessionId: null,
  endpoint: null,
  expiresAt: null,
  call: null,
  emergencies: [],
  notice: '',
};
export type RadioCredentials = { id: string; url: string; token: string };
export type GsmRCommunication = {
  zone: string;
  browserConnected: boolean;
  call: RadioNormalCall | null;
  outgoingEmergency: RadioEmergency | null;
  incomingEmergencies: number;
  notice: string;
};
