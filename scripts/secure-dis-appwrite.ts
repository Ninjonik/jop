import { secureDisAppwrite } from '../src/lib/server/dis/access-policy';

secureDisAppwrite(process.argv.includes('--apply')).catch((error) => {
  console.error('Appwrite access policy setup failed:', error);
  process.exitCode = 1;
});
