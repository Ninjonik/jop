import { readFile } from 'fs/promises';
import path from 'path';

const BRIDGE_SCRIPTS = [
  {
    name: 'JopBridge',
    className: 'Script',
    fileName: 'Main.server.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: [],
  },
  {
    name: 'Config',
    className: 'ModuleScript',
    fileName: 'Config.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: ['JopBridge'],
  },
  {
    name: 'ApiClient',
    className: 'ModuleScript',
    fileName: 'ApiClient.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: ['JopBridge'],
  },
  {
    name: 'HardwareDriver',
    className: 'ModuleScript',
    fileName: 'HardwareDriver.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: ['JopBridge'],
  },
  {
    name: 'InstanceRegistry',
    className: 'ModuleScript',
    fileName: 'InstanceRegistry.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: ['JopBridge'],
  },
  {
    name: 'SignalController',
    className: 'ModuleScript',
    fileName: 'SignalController.lua',
    directory: 'ServerScriptService/JopBridge',
    parentService: 'ServerScriptService',
    parentPath: ['JopBridge'],
  },
  {
    name: 'JopSignalVisualController',
    className: 'LocalScript',
    fileName: 'JopSignalVisualController.client.lua',
    directory: 'StarterPlayer/StarterPlayerScripts',
    parentService: 'StarterPlayer',
    parentPath: ['StarterPlayerScripts'],
  },
] as const;

export async function getRobloxBridgeScripts() {
  const scripts = await Promise.all(
    BRIDGE_SCRIPTS.map(async (definition) => ({
      name: definition.name,
      className: definition.className,
      fileName: definition.fileName,
      parentService: definition.parentService,
      parentPath: definition.parentPath,
      source: await readFile(
        path.join(process.cwd(), 'roblox', definition.directory, definition.fileName),
        'utf8',
      ),
    })),
  );

  return {
    generatedAt: new Date().toISOString(),
    scripts,
  };
}
