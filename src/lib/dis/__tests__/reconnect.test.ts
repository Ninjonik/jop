import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { Socket } from 'socket.io-client';
import { keepSocketConnected, reconnectDelay, voiceReconnectPolicy } from '../../reconnect';

test('retry delays grow to five seconds and never stop', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => reconnectDelay(i)),
    [250, 500, 1000, 2000, 4000, 5000, 5000, 5000],
  );
  assert.equal(voiceReconnectPolicy.nextRetryDelayInMs({ retryCount: 1000 }), 5000);
});

test('rejected handshakes and forced disconnects retry, reset and clean up', (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const browser = new EventTarget();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  context.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const socket = Object.assign(new EventEmitter(), {
    active: false,
    connected: false,
    connect: context.mock.fn(),
  });
  const cleanup = keepSocketConnected(socket as unknown as Socket);
  socket.emit('connect_error');
  context.mock.timers.tick(250);
  assert.equal(socket.connect.mock.callCount(), 1);
  socket.emit('connect_error');
  context.mock.timers.tick(499);
  assert.equal(socket.connect.mock.callCount(), 1);
  context.mock.timers.tick(1);
  assert.equal(socket.connect.mock.callCount(), 2);
  socket.emit('connect');
  socket.emit('disconnect', 'io server disconnect');
  context.mock.timers.tick(250);
  assert.equal(socket.connect.mock.callCount(), 3);
  socket.emit('connect_error');
  cleanup();
  context.mock.timers.tick(5000);
  browser.dispatchEvent(new Event('online'));
  assert.equal(socket.connect.mock.callCount(), 3);
});
