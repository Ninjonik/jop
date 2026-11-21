import { account } from './appwrite-client';

/** Only an explicit session rejection after retry means that login is required. */
export async function restoreDisSession() {
  try {
    return await account.get();
  } catch {
    // A tab can open while the browser resumes its connection or finishes login
    // in another tab. Retry once before deciding that its session is unavailable.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  try {
    return await account.get();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 401)
      return null;
    throw error;
  }
}
