type SessionAccount = {
  get(): Promise<{ $id: string }>;
  createSession(userId: string, secret: string): Promise<unknown>;
  deleteSession(sessionId: string): Promise<unknown>;
};

async function currentUser(account: SessionAccount) {
  try {
    return await account.get();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 401)
      return null;
    throw error;
  }
}

/** Reuse the intended identity; replace only this browser's session when switching accounts. */
export async function completeRobloxLogin(account: SessionAccount, userId: string, secret: string) {
  const existing = await currentUser(account);
  if (existing?.$id === userId) return;
  if (existing) await account.deleteSession('current');
  try {
    await account.createSession(userId, secret);
  } catch (error) {
    // Another tab may have completed login, or the create response may have been lost.
    const current = await currentUser(account).catch(() => null);
    if (current?.$id !== userId) throw error;
  }
}
