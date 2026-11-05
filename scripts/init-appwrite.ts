import { initializeDisAppwrite } from '../src/lib/server/dis/schema';

initializeDisAppwrite().catch((error) => {
  console.error('Appwrite DIS setup failed:', error);
  process.exitCode = 1;
});
