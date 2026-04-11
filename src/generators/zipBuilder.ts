// src/generators/zipBuilder.ts
import JSZip from 'jszip';
import type { AppState } from '../types';
import { generateCompose } from './composeGenerator';
import { generateDeviceConfig } from './configGenerator';
import { generateNetworkSetup } from './networkSetupGenerator';

import modbusDockerfile    from '../../docker/modbus/Dockerfile?raw';
import modbusRequirements  from '../../docker/modbus/requirements.txt?raw';
import modbusSimulator     from '../../docker/modbus/simulator.py?raw';
import bacnetDockerfile    from '../../docker/bacnet/Dockerfile?raw';
import bacnetRequirements  from '../../docker/bacnet/requirements.txt?raw';
import bacnetSimulator     from '../../docker/bacnet/simulator.py?raw';

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

  // Docker build contexts — only include protocols actually used
  const usedProtocols = new Set(devices.map(d => d.protocol));

  if (usedProtocols.has('modbus') || usedProtocols.has('modbus-rtu')) {
    const ctx = zip.folder('modbus')!;
    ctx.file('Dockerfile',       modbusDockerfile);
    ctx.file('requirements.txt', modbusRequirements);
    ctx.file('simulator.py',     modbusSimulator);
  }

  if (usedProtocols.has('bacnet')) {
    const ctx = zip.folder('bacnet')!;
    ctx.file('Dockerfile',       bacnetDockerfile);
    ctx.file('requirements.txt', bacnetRequirements);
    ctx.file('simulator.py',     bacnetSimulator);
  }

  // README
  zip.file('README.txt', [
    `BMS Simulator — ${project_name}`,
    '='.repeat(40),
    '',
    'SETUP (one time per Pi):',
    '  sudo ./setup-network.sh',
    '',
    'START (builds images on first run, then starts containers):',
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
