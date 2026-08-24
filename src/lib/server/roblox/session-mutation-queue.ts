const sessionMutationQueues = new Map<string, Promise<unknown>>();

export function queueRobloxSessionMutation<T>(sessionId: string, operation: () => Promise<T>) {
  const previous = sessionMutationQueues.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  sessionMutationQueues.set(sessionId, next);

  const cleanup = () => {
    if (sessionMutationQueues.get(sessionId) === next) {
      sessionMutationQueues.delete(sessionId);
    }
  };
  void next.then(cleanup, cleanup);

  return next;
}
