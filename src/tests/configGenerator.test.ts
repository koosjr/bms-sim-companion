import { describe, it, expect } from 'vitest';
import { generateDeviceConfig } from '../generators/configGenerator';
import type { SimDevice, SimPoint } from '../types';

const POINT: SimPoint = {
  tag: 'AHU1SATMP', description: 'SA Temp', io_type: 'AI',
  function_code: 3, register: 8336, data_type: '16int', scale: 10, object_count: 1,
  object_type: 'analogInput', object_instance: 0, units: 'degreesCelsius', cov_increment: 0.1,
  base_value: 14.0, noise_pct: 2,
};

const DEVICE: SimDevice = {
  id: 'd1', source_id: 's1', name: 'AHU1', profile_name: 'AHU', description: '',
  protocol: 'modbus', ip_address: '192.168.1.101',
  modbus_port: 502, unit_id: 1, byte_order: 'big', word_order: 'big',
  bacnet_port: 47808, device_instance: 1001, device_name: 'AHU1', vendor_id: 999,
  points: [POINT],
};

describe('generateDeviceConfig', () => {
  it('produces valid JSON', () => {
    const out = generateDeviceConfig(DEVICE);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('includes device metadata', () => {
    const cfg = JSON.parse(generateDeviceConfig(DEVICE));
    expect(cfg.device_name).toBe('AHU1');
    expect(cfg.protocol).toBe('modbus');
    expect(cfg.unit_id).toBe(1);
    expect(cfg.update_interval_seconds).toBe(5);
  });

  it('converts base_value to raw register value (base * scale)', () => {
    const cfg = JSON.parse(generateDeviceConfig(DEVICE));
    const point = cfg.points[0];
    expect(point.base_value_raw).toBe(14.0 * 10); // 140
    expect(point.noise_pct).toBe(2);
  });

  it('includes register address and function code', () => {
    const cfg = JSON.parse(generateDeviceConfig(DEVICE));
    expect(cfg.points[0].register).toBe(8336);
    expect(cfg.points[0].function_code).toBe(3);
  });
});
