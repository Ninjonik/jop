/** Idempotent Appwrite CORS registration for the Windows Tauri WebView. */
import { loadEnvConfig } from '@next/env';
import { Client, Project } from 'node-appwrite';
loadEnvConfig(process.cwd());
const project = new Project(
  new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis')
    .setKey(process.env.APPWRITE_API_KEY || ''),
);
async function main() {
  const platforms = await project.listPlatforms();
  if (
    !platforms.platforms.some(
      (platform) => 'hostname' in platform && platform.hostname === 'tauri.localhost',
    )
  ) {
    await project.createWebPlatform({
      platformId: 'dis-desktop-webview',
      name: 'DIS desktop WebView',
      hostname: 'tauri.localhost',
    });
    console.log('Registered the DIS desktop WebView hostname.');
  } else console.log('DIS desktop WebView hostname is already registered.');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Desktop platform configuration failed.');
  process.exitCode = 1;
});
