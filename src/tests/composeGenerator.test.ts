import { describe, it, expect } from 'vitest';
import { generateCompose } from '../generators/composeGenerator';
import type { SimDevice, NetworkConfig } from '../types';

const NET: NetworkConfig = {
  ip_prefix: '192.168.1',
  subnet: '192.168.1.0/24', gateway: '192.168.1.1',
  pi_ip: '192.168.1.200', parent_interface: 'eth0',
};

const MODBUS_DEVICE: SimDevice = {
  id: 'd1', source_id: 's1', name: 'AHU1', description: '',
  protocol: 'modbus', ip_address: '192.168.1.101',
  modbus_port: 502, unit_id: 1, byte_order: 'big', word_order: 'big',
  bacnet_port: 47808, device_instance: 1001, device_name: 'AHU1', vendor_id: 999,
  points: [],
};

const BACNET_DEVICE: SimDevice = {
  ...MODBUS_DEVICE, id: 'd2', name: 'CHR1', protocol: 'bacnet', ip_address: '192.168.1.103',
};

describe('generateCompose', () => {
  it('includes macvlan network with correct subnet', () => {
    const out = generateCompose([MODBUS_DEVICE], NET);
    expect(out).toContain('driver: macvlan');
    expect(out).toContain('192.168.1.0/24');
    expect(out).toContain('eth0');
  });

  it('modbus device uses bms-modbus-sim image', () => {
    const out = generateCompose([MODBUS_DEVICE], NET);
    expect(out).toContain('bms-modbus-sim:latest');
    expect(out).toContain('192.168.1.101');
  });

  it('bacnet device uses bms-bacnet-sim image', () => {
    const out = generateCompose([BACNET_DEVICE], NET);
    expect(out).toContain('bms-bacnet-sim:latest');
    expect(out).toContain('192.168.1.103');
  });

  it('each device mounts its own config.json', () => {
    const out = generateCompose([MODBUS_DEVICE, BACNET_DEVICE], NET);
    expect(out).toContain('./ahu1/config.json:/app/config.json:ro');
    expect(out).toContain('./chr1/config.json:/app/config.json:ro');
  });
});
