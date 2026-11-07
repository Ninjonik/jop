import { importRobloxPersonnel } from '../src/lib/server/dis/import-personnel';

async function main() {
  const result = await importRobloxPersonnel(
    process.env.ROBLOX_GROUP_ID || '',
    process.argv.includes('--apply'),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.applied) console.log('Preview only. Use --apply to add missing personnel profiles.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
