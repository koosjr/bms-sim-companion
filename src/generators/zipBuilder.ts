// src/generators/zipBuilder.ts
import JSZip from 'jszip';
import type { AppState } from '../types';
import { generateCompose } from './composeGenerator';
import { generateDeviceConfig } from './configGenerator';
import { generateNetworkSetup } from './networkSetupGenerator';

function dirName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function buildProjectZip(state: AppState): Promise<Blob> {
  const zip = new JSZip();
  const { devices, network, project_name } = state;

  // docker-compose.yml
  zip.file('docker-compose.yml', generateCompose(devices, network));

  // setup-network.sh
  zip.file('setup-network.sh', generateNetworkSetup(network));

  // per-device config.json
  for (const device of devices) {
    const dir = dirName(device.name);
    zip.folder(dir)!.file('config.json', generateDeviceConfig(device));
  }

  // README
  zip.file('README.txt', [
    `BMS Simulator — ${project_name}`,
    '='.repeat(40),
    '',
    'SETUP (one time per Pi):',
    '  sudo ./setup-network.sh',
    '',
    'START:',
    '  docker-compose up -d',
    '',
    'STOP:',
    '  docker-compose down',
    '',
    'LOGS:',
    '  docker-compose logs -f <device-name>',
    '',
    `Devices: ${devices.map(d => `${d.name} (${d.ip_address})`).join(', ')}`,
  ].join('\n'));

  return zip.generateAsync({ type: 'blob' });
}
