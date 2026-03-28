import type { NetworkConfig } from '../types';

export function generateNetworkSetup(network: NetworkConfig): string {
  const prefix = network.subnet.split('/')[1];
  return [
    '#!/bin/bash',
    '# Run once on the Raspberry Pi before docker-compose up.',
    '# Creates a host-side macvlan interface so the Pi itself can',
    '# communicate with the simulator containers on the same subnet.',
    '',
    `PARENT="${network.parent_interface}"`,
    `PI_IP="${network.pi_ip}/${prefix}"`,
    '',
    '# Create macvlan interface for host traffic',
    'ip link add bms_macvlan link "$PARENT" type macvlan mode bridge',
    'ip addr add "$PI_IP" dev bms_macvlan',
    'ip link set bms_macvlan up',
    '',
    'echo "macvlan interface created. Pi can now reach simulator containers."',
  ].join('\n');
}
