import { readFile } from 'fs/promises';
import path from 'path';

const BRIDGE_SCRIPTS = [
  { name: 'JopBridge', className: 'Script', fileName: 'Main.server.lua' },
  { name: 'Config', className: 'ModuleScript', fileName: 'Config.lua' },
  { name: 'ApiClient', className: 'ModuleScript', fileName: 'ApiClient.lua' },
  { name: 'HardwareDriver', className: 'ModuleScript', fileName: 'HardwareDriver.lua' },
  { name: 'InstanceRegistry', className: 'ModuleScript', fileName: 'InstanceRegistry.lua' },
  { name: 'SignalController', className: 'ModuleScript', fileName: 'SignalController.lua' },
] as const;

function getBridgeScriptsDirectory() {
  return path.join(process.cwd(), 'roblox', 'ServerScriptService', 'JopBridge');
}

export async function getRobloxBridgeScripts() {
  const scripts = await Promise.all(
    BRIDGE_SCRIPTS.map(async (definition) => ({
      name: definition.name,
      className: definition.className,
      fileName: definition.fileName,
      source: await readFile(
        path.join(getBridgeScriptsDirectory(), definition.fileName),
        'utf8',
      ),
    })),
  );

  return {
    generatedAt: new Date().toISOString(),
    scripts,
  };
}
