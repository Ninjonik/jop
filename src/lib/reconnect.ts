import type { Socket } from 'socket.io-client';

/** Retry after 250 ms, 500 ms, 1 s, 2 s, 4 s, then every 5 s. */
export function reconnectDelay(attempt: number) {
  return Math.min(250 * 2 ** Math.min(attempt, 5), 5000);
}

export const socketReconnectOptions = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 250,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0,
  timeout: 5000,
};

/** Socket.IO does not retry middleware rejections or server-forced disconnects. */
export function keepSocketConnected(socket: Socket, beforeRetry?: () => void) {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    attempt = 0;
    clearTimeout(timer);
    timer = undefined;
  };
  const retry = () => {
    if (socket.active || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      beforeRetry?.();
      socket.connect();
    }, reconnectDelay(attempt++));
  };
  socket.on('connect', reset);
  socket.on('connect_error', retry);
  socket.on('disconnect', retry);
  const online = () => {
    if (socket.connected) return;
    clearTimeout(timer);
    timer = undefined;
    beforeRetry?.();
    socket.connect();
  };
  window.addEventListener('online', online);
  return () => {
    reset();
    socket.off('connect', reset);
    socket.off('connect_error', retry);
    socket.off('disconnect', retry);
    window.removeEventListener('online', online);
  };
}

export const voiceReconnectPolicy = {
  nextRetryDelayInMs: ({ retryCount }: { retryCount: number }) => reconnectDelay(retryCount),
};
