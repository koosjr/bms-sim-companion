import type { SimDevice, NetworkConfig } from '../types';

function serviceName(device: SimDevice): string {
  return device.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function configDir(device: SimDevice): string {
  return device.name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function generateCompose(devices: SimDevice[], network: NetworkConfig): string {
  const lines: string[] = [
    'version: "3.8"',
    '',
    'networks:',
    '  bms_net:',
    '    driver: macvlan',
    '    driver_opts:',
    `      parent: ${network.parent_interface}`,
    '    ipam:',
    '      config:',
    `        - subnet: ${network.subnet}`,
    `          gateway: ${network.gateway}`,
    '',
    'services:',
  ];

  for (const device of devices) {
    const svc = serviceName(device);
    const dir = configDir(device);
    const buildCtx = device.protocol !== 'bacnet' ? './modbus' : './bacnet';
    lines.push(
      `  ${svc}:`,
      `    build: ${buildCtx}`,
      `    container_name: sim_${svc}`,
      '    volumes:',
      `      - ./${dir}/config.json:/app/config.json:ro`,
      '    networks:',
      '      bms_net:',
      `        ipv4_address: ${device.ip_address}`,
      '    restart: unless-stopped',
      '',
    );
  }

  return lines.join('\n');
}
