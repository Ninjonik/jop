import {
  chatEndpointKey,
  type ChatContact,
  type ChatEndpoint,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import {
  emptyRadioTerminal,
  RADIO_HEARTBEAT_MS,
  RADIO_LEASE_MS,
  type RadioEmergency,
  type RadioTerminalState,
} from '@/lib/dis/radio';
import { randomUUID } from 'node:crypto';
import type { radioTerminalRepository } from '../repositories/radio-terminal-repository';

type Scope = { sessionId: string; endpoint: ChatEndpoint & { name: string } };
type Terminal = {
  userId: string;
  socketId: string;
  scope: Scope;
  expiresAt: number;
  challengedAt: number;
  notice: string;
};
type NormalCall = {
  id: string;
  sessionId: string;
  caller: string;
  recipients: string[];
  accepted: string | null;
  callerContact: ChatContact;
  recipientContact: ChatContact;
  startedAt: number;
};
type Emergency = {
  id: string;
  sessionId: string;
  originUserId: string;
  origin: ChatContact;
  scope: 'session' | 'station';
  stationId: string | null;
  recipients: string[];
};
export type RadioEmit = <K extends keyof ChatServerEvents>(
  socketId: string,
  event: K,
  ...args: Parameters<ChatServerEvents[K]>
) => void;
export type RadioMedia = {
  credentials(
    id: string,
    socketId: string,
    publish: boolean,
  ): Promise<{ id: string; url: string; token: string }>;
  close(id: string): Promise<void>;
  remove(id: string, socketId: string): Promise<void>;
};
type Dependencies = {
  store: Pick<typeof radioTerminalRepository, 'claim' | 'save' | 'find'>;
  emit: RadioEmit;
  media: RadioMedia;
  resolveContact(sessionId: string, endpoint: ChatEndpoint): Promise<ChatContact>;
  currentStation(sessionId: string, userId: string): Promise<string | null>;
  now?: () => number;
};

/** One owner per person; normal calls and fixed-audience emergency broadcasts share it. */
export class RadioCalls {
  private terminals = new Map<string, Terminal>();
  private observers = new Map<string, Set<string>>();
  private calls = new Map<string, NormalCall>();
  private emergencies = new Map<string, Emergency>();
  private pendingRoomClosures = new Set<string>();
  private closingRooms = new Set<string>();
  private removingParticipants = new Set<string>();
  private pendingRemovals = new Map<string, { id: string; socketId: string }>();
  private now: () => number;
  constructor(private dependencies: Dependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async observe(userId: string, socketId: string) {
    const observers = this.observers.get(userId) ?? new Set<string>();
    observers.add(socketId);
    this.observers.set(userId, observers);
    const persisted = await this.dependencies.store.find(userId);
    this.dependencies.emit(
      socketId,
      'radio:terminal',
      persisted && persisted.expiresAt! > this.now() ? persisted : emptyRadioTerminal,
    );
  }
  private terminal(userId: string, socketId?: string) {
    const terminal = this.terminals.get(userId);
    if (
      !terminal ||
      terminal.expiresAt <= this.now() ||
      (socketId && terminal.socketId !== socketId)
    )
      throw new Error('Najprv aktivujte tento prehliadač ako hlasový terminál.');
    return terminal;
  }
  private normalFor(userId: string) {
    return [...this.calls.values()].find(
      (call) =>
        call.caller === userId ||
        call.accepted === userId ||
        (!call.accepted && call.recipients.includes(userId)),
    );
  }
  private originating(userId: string) {
    return [...this.emergencies.values()].find((call) => call.originUserId === userId);
  }
  private emergencySummary(call: Emergency, userId: string): RadioEmergency {
    return {
      id: call.id,
      origin: call.origin,
      scope: call.scope,
      stationId: call.stationId,
      outgoing: call.originUserId === userId,
    };
  }
  private state(terminal: Terminal): RadioTerminalState {
    const call = this.normalFor(terminal.userId);
    return {
      ownerSocketId: terminal.socketId,
      sessionId: terminal.scope.sessionId,
      endpoint: terminal.scope.endpoint,
      expiresAt: terminal.expiresAt,
      notice: terminal.notice,
      call: call
        ? {
            id: call.id,
            phase: call.accepted ? 'connected' : 'ringing',
            incoming: call.caller !== terminal.userId,
            contact: call.caller === terminal.userId ? call.recipientContact : call.callerContact,
          }
        : null,
      emergencies: [...this.emergencies.values()]
        .filter(
          (emergency) =>
            emergency.sessionId === terminal.scope.sessionId &&
            (emergency.originUserId === terminal.userId ||
              emergency.recipients.includes(terminal.userId)),
        )
        .map((emergency) => this.emergencySummary(emergency, terminal.userId)),
    };
  }
  private async publish(userId: string) {
    const terminal = this.terminals.get(userId);
    if (!terminal) return;
    const state = this.state(terminal);
    await this.dependencies.store.save(userId, terminal.socketId, state);
    for (const socket of this.observers.get(userId) ?? [])
      this.dependencies.emit(socket, 'radio:terminal', state);
  }
  async claim(userId: string, socketId: string, scope: Scope) {
    let previous = this.terminals.get(userId);
    if (previous && previous.expiresAt <= this.now()) {
      await this.release(userId, previous.socketId);
      previous = undefined;
    }
    if (
      previous &&
      previous.socketId === socketId &&
      previous.scope.sessionId === scope.sessionId &&
      chatEndpointKey(previous.scope.endpoint) === chatEndpointKey(scope.endpoint)
    ) {
      await this.heartbeat(userId, socketId);
      return;
    }
    if (previous && previous.socketId === socketId) await this.release(userId, socketId);
    const terminal: Terminal = {
      userId,
      socketId,
      scope,
      expiresAt: this.now() + RADIO_LEASE_MS,
      challengedAt: this.now(),
      notice: '',
    };
    if (!(await this.dependencies.store.claim(userId, this.state(terminal), this.now())))
      throw new Error(
        'Hlasový terminál už používa iná karta. Počkajte na uvoľnenie alebo vypršanie spojenia.',
      );
    this.terminals.set(userId, terminal);
    await this.publish(userId);
    // A recipient remains in its captured audience even after changing browser tabs.
    for (const call of this.emergencies.values()) {
      if (call.sessionId === scope.sessionId && call.recipients.includes(userId))
        await this.connectEmergency(call, terminal, false);
    }
  }
  async heartbeat(userId: string, socketId: string) {
    const terminal = this.terminal(userId, socketId);
    terminal.expiresAt = this.now() + RADIO_LEASE_MS;
    await this.publish(userId);
  }
  async notice(userId: string, message: string) {
    const terminal = this.terminals.get(userId);
    if (!terminal) return;
    terminal.notice = message;
    await this.publish(userId);
  }
  private closeRoom(id: string) {
    this.pendingRoomClosures.add(id);
    if (this.closingRooms.has(id)) return;
    this.closingRooms.add(id);
    // A media outage must not block the signalling queue and expire healthy leases.
    void this.dependencies.media
      .close(id)
      .then(() => {
        this.pendingRoomClosures.delete(id);
      })
      .catch(() => undefined)
      .finally(() => {
        this.closingRooms.delete(id);
      });
  }
  private removeParticipant(id: string, socketId: string) {
    const key = JSON.stringify([id, socketId]);
    this.pendingRemovals.set(key, { id, socketId });
    if (this.removingParticipants.has(key)) return;
    this.removingParticipants.add(key);
    void this.dependencies.media
      .remove(id, socketId)
      .then(() => {
        this.pendingRemovals.delete(key);
      })
      .catch(() => undefined)
      .finally(() => {
        this.removingParticipants.delete(key);
      });
  }
  async release(userId: string, socketId: string) {
    const terminal = this.terminals.get(userId);
    if (!terminal || terminal.socketId !== socketId) return;
    const normal = this.normalFor(userId);
    if (normal) {
      if (!normal.accepted && normal.caller !== userId && normal.recipients.length > 1) {
        normal.recipients = normal.recipients.filter((recipient) => recipient !== userId);
        this.dependencies.emit(socketId, 'call:ended', {
          id: normal.id,
          reason: 'Hlasový terminál bol odpojený.',
        });
      } else await this.endCall(normal, 'Hlasový terminál bol odpojený.');
    }
    const outgoing = this.originating(userId);
    if (outgoing) await this.endEmergency(outgoing, 'Vysielajúci terminál bol odpojený.');
    for (const call of this.emergencies.values()) {
      if (!call.recipients.includes(userId)) continue;
      this.dependencies.emit(socketId, 'radio:emergency-ended', {
        id: call.id,
        reason: 'Hlasový terminál bol odpojený.',
      });
      this.removeParticipant(call.id, socketId);
    }
    this.terminals.delete(userId);
    await this.dependencies.store.save(userId, socketId, emptyRadioTerminal);
    for (const socket of this.observers.get(userId) ?? [])
      this.dependencies.emit(socket, 'radio:terminal', emptyRadioTerminal);
  }
  async disconnect(userId: string, socketId: string) {
    await this.release(userId, socketId);
    this.observers.get(userId)?.delete(socketId);
    if (!this.observers.get(userId)?.size) this.observers.delete(userId);
  }
  async changeScope(userId: string, socketId: string) {
    await this.release(userId, socketId);
  }

  async start(userId: string, socketId: string, recipient: ChatEndpoint) {
    const caller = this.terminal(userId, socketId);
    if (this.normalFor(userId) || this.originating(userId))
      throw new Error('Najprv ukončite prebiehajúci hovor alebo vysielanie.');
    if (
      chatEndpointKey(recipient) === chatEndpointKey(caller.scope.endpoint) ||
      (caller.scope.endpoint.kind === 'driver' && recipient.kind === 'driver')
    )
      throw new Error('Vyberte inú stanicu alebo rušňovodiča.');
    const contact = await this.dependencies.resolveContact(caller.scope.sessionId, recipient);
    const recipients = [...this.terminals.values()].filter(
      (terminal) =>
        terminal.userId !== userId &&
        terminal.expiresAt > this.now() &&
        terminal.scope.sessionId === caller.scope.sessionId &&
        chatEndpointKey(terminal.scope.endpoint) === chatEndpointKey(recipient) &&
        !this.normalFor(terminal.userId) &&
        !this.originating(terminal.userId),
    );
    if (!recipients.length)
      throw new Error('Účastník nemá aktívny hlasový terminál alebo má obsadené.');
    const call: NormalCall = {
      id: randomUUID(),
      sessionId: caller.scope.sessionId,
      caller: userId,
      recipients: recipients.map((terminal) => terminal.userId),
      accepted: null,
      callerContact: await this.dependencies.resolveContact(
        caller.scope.sessionId,
        caller.scope.endpoint,
      ),
      recipientContact: contact,
      startedAt: this.now(),
    };
    this.calls.set(call.id, call);
    caller.notice = '';
    this.dependencies.emit(socketId, 'call:ringing', { id: call.id, contact, incoming: false });
    for (const target of recipients) {
      target.notice = '';
      this.dependencies.emit(target.socketId, 'call:ringing', {
        id: call.id,
        contact: call.callerContact,
        incoming: true,
      });
    }
    await Promise.all([userId, ...call.recipients].map((user) => this.publish(user)));
  }
  async callDispatcher(userId: string, socketId: string) {
    const terminal = this.terminal(userId, socketId);
    if (terminal.scope.endpoint.kind !== 'driver')
      throw new Error('Táto voľba je určená rušňovodičovi.');
    const stationId = await this.dependencies.currentStation(terminal.scope.sessionId, userId);
    if (!stationId)
      throw new Error('Poloha nie je známa alebo vlak nie je v stanici. Výpravca nie je dostupný.');
    await this.start(userId, socketId, { kind: 'station', id: stationId });
  }
  async accept(userId: string, socketId: string, id?: string) {
    this.terminal(userId, socketId);
    const call = id ? this.calls.get(id) : this.normalFor(userId);
    if (!call || call.accepted || !call.recipients.includes(userId) || this.originating(userId))
      throw new Error('Prichádzajúci hovor už nie je dostupný.');
    const caller = this.terminal(call.caller);
    try {
      const [callerCredentials, receiverCredentials] = await Promise.all([
        this.dependencies.media.credentials(call.id, caller.socketId, true),
        this.dependencies.media.credentials(call.id, socketId, true),
      ]);
      call.accepted = userId;
      for (const target of call.recipients.filter((target) => target !== userId)) {
        const terminal = this.terminals.get(target);
        if (terminal)
          this.dependencies.emit(terminal.socketId, 'call:ended', {
            id: call.id,
            reason: 'Hovor prijal iný výpravca.',
          });
      }
      this.dependencies.emit(caller.socketId, 'call:connected', callerCredentials);
      this.dependencies.emit(socketId, 'call:connected', receiverCredentials);
      await Promise.all([call.caller, ...call.recipients].map((user) => this.publish(user)));
    } catch (error) {
      await this.endCall(call, 'Spojenie sa nepodarilo vytvoriť.');
      throw error;
    }
  }
  private async endCall(call: NormalCall, reason: string) {
    this.calls.delete(call.id);
    const participants = [call.caller, ...(call.accepted ? [call.accepted] : call.recipients)];
    for (const userId of participants) {
      const terminal = this.terminals.get(userId);
      if (!terminal) continue;
      terminal.notice = reason;
      this.dependencies.emit(terminal.socketId, 'call:ended', { id: call.id, reason });
    }
    this.closeRoom(call.id);
    await Promise.all(participants.map((user) => this.publish(user)));
  }
  async hangup(userId: string, socketId: string, id?: string) {
    this.terminal(userId, socketId);
    const call = id ? this.calls.get(id) : this.normalFor(userId);
    if (
      !call ||
      (call.caller !== userId &&
        call.accepted !== userId &&
        (call.accepted || !call.recipients.includes(userId)))
    )
      return;
    if (!call.accepted && call.caller !== userId && call.recipients.length > 1) {
      call.recipients = call.recipients.filter((recipient) => recipient !== userId);
      this.dependencies.emit(socketId, 'call:ended', {
        id: call.id,
        reason: 'Hovor bol odmietnutý.',
      });
      await this.publish(userId);
      return;
    }
    await this.endCall(call, 'Hovor bol ukončený.');
  }

  private async connectEmergency(call: Emergency, terminal: Terminal, outgoing: boolean) {
    const credentials = await this.dependencies.media.credentials(
      call.id,
      terminal.socketId,
      outgoing,
    );
    this.dependencies.emit(terminal.socketId, 'radio:emergency-connected', {
      ...this.emergencySummary(call, terminal.userId),
      ...credentials,
    });
  }
  async startEmergency(userId: string, socketId: string, scope: 'session' | 'station') {
    const origin = this.terminal(userId, socketId);
    if (this.originating(userId)) throw new Error('Najprv ukončite vlastné tiesňové vysielanie.');
    const stationId =
      scope === 'station'
        ? origin.scope.endpoint.kind === 'station'
          ? origin.scope.endpoint.id
          : await this.dependencies.currentStation(origin.scope.sessionId, userId)
        : null;
    if (scope === 'station' && !stationId)
      throw new Error('Staničné tiesňové vysielanie vyžaduje známu polohu v stanici.');
    const candidates = [...this.terminals.values()].filter(
      (terminal) =>
        terminal.userId !== userId &&
        terminal.expiresAt > this.now() &&
        terminal.scope.sessionId === origin.scope.sessionId,
    );
    const recipients: Terminal[] = [];
    for (const candidate of candidates) {
      if (
        scope === 'session' ||
        (candidate.scope.endpoint.kind === 'station'
          ? candidate.scope.endpoint.id
          : await this.dependencies.currentStation(candidate.scope.sessionId, candidate.userId)) ===
          stationId
      )
        recipients.push(candidate);
    }
    const normal = this.normalFor(userId);
    if (normal) await this.endCall(normal, 'Hovor bol ukončený kvôli tiesňovému vysielaniu.');
    const call: Emergency = {
      id: randomUUID(),
      sessionId: origin.scope.sessionId,
      originUserId: userId,
      origin: await this.dependencies.resolveContact(origin.scope.sessionId, origin.scope.endpoint),
      scope,
      stationId,
      recipients: recipients.map((terminal) => terminal.userId),
    };
    this.emergencies.set(call.id, call);
    origin.notice = '';
    try {
      await this.connectEmergency(call, origin, true);
      for (const recipient of recipients) {
        try {
          await this.connectEmergency(call, recipient, false);
        } catch {
          recipient.notice = 'Tiesňové vysielanie sa nepodarilo pripojiť.';
        }
      }
      await Promise.all([userId, ...call.recipients].map((user) => this.publish(user)));
    } catch (error) {
      await this.endEmergency(call, 'Tiesňové vysielanie zlyhalo.');
      throw error;
    }
  }
  private async endEmergency(call: Emergency, reason: string) {
    this.emergencies.delete(call.id);
    for (const userId of [call.originUserId, ...call.recipients]) {
      const terminal = this.terminals.get(userId);
      if (terminal)
        this.dependencies.emit(terminal.socketId, 'radio:emergency-ended', { id: call.id, reason });
    }
    this.closeRoom(call.id);
    await Promise.all([call.originUserId, ...call.recipients].map((user) => this.publish(user)));
  }
  async stopEmergency(userId: string, socketId: string) {
    this.terminal(userId, socketId);
    const call = this.originating(userId);
    if (call) await this.endEmergency(call, 'Tiesňové vysielanie bolo ukončené.');
  }
  async emergencyFailed(userId: string, socketId: string, id: string) {
    this.terminal(userId, socketId);
    const call = this.emergencies.get(id);
    if (call?.originUserId === userId)
      await this.endEmergency(call, 'Mikrofón alebo hlasové spojenie vysielajúceho zlyhalo.');
    else
      await this.notice(
        userId,
        'Tiesňové vysielanie sa nepodarilo prehrať. Povoľte zvuk v prehliadači.',
      );
  }
  async robloxAction(
    userId: string,
    sessionId: string,
    action: import('@/lib/dis/radio').RadioAction,
  ) {
    const terminal = this.terminal(userId);
    if (terminal.scope.sessionId !== sessionId || terminal.scope.endpoint.kind !== 'driver')
      throw new Error('Aktivujte terminál rušňovodiča v rovnakej relácii.');
    switch (action) {
      case 'call-dispatcher':
        return this.callDispatcher(userId, terminal.socketId);
      case 'answer':
        return this.accept(userId, terminal.socketId);
      case 'hangup':
        return this.hangup(userId, terminal.socketId);
      case 'emergency-session':
        return this.startEmergency(userId, terminal.socketId, 'session');
      case 'emergency-station':
        return this.startEmergency(userId, terminal.socketId, 'station');
      case 'emergency-stop':
        return this.stopEmergency(userId, terminal.socketId);
    }
  }
  async tick(challenge = true) {
    const now = this.now();
    for (const terminal of [...this.terminals.values()]) {
      if (terminal.expiresAt <= now) await this.release(terminal.userId, terminal.socketId);
      else if (challenge && now - terminal.challengedAt >= RADIO_HEARTBEAT_MS) {
        terminal.challengedAt = now;
        this.dependencies.emit(terminal.socketId, 'radio:heartbeat-request');
      }
    }
    for (const call of [...this.calls.values()])
      if (!call.accepted && now - call.startedAt >= 45000)
        await this.endCall(call, 'Účastník neodpovedá.');
    for (const id of this.pendingRoomClosures) this.closeRoom(id);
    for (const removal of this.pendingRemovals.values())
      this.removeParticipant(removal.id, removal.socketId);
  }
  async stop() {
    for (const terminal of [...this.terminals.values()])
      await this.release(terminal.userId, terminal.socketId);
  }
}
