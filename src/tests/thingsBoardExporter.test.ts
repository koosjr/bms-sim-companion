import { describe, it, expect } from 'vitest';
import { generateThingsBoardJson } from '../generators/thingsBoardExporter';
import type { SimDevice, SimPoint } from '../types';

const MODBUS_POINT: SimPoint = {
  tag: 'AHU1SATMP', description: 'SA Temp', io_type: 'AI',
  function_code: 3, register: 8336, data_type: '16int', scale: 10, object_count: 1,
  object_type: 'analogInput', object_instance: 0, units: 'degreesCelsius', cov_increment: 0.1,
  base_value: 14.0, noise_pct: 2,
};

const MODBUS_DEVICE: SimDevice = {
  id: 'd1', source_id: 's1', name: 'AHU1', profile_name: 'AHU', description: '',
  protocol: 'modbus', ip_address: '192.168.1.101',
  modbus_port: 502, unit_id: 1, byte_order: 'big', word_order: 'big',
  bacnet_port: 47808, device_instance: 1001, device_name: 'AHU1', vendor_id: 999,
  points: [MODBUS_POINT],
};

const BACNET_POINT: SimPoint = { ...MODBUS_POINT, tag: 'CHR1CWTMP', object_instance: 0, object_type: 'analogInput' };
const BACNET_DEVICE: SimDevice = { ...MODBUS_DEVICE, id: 'd2', name: 'CHR1', protocol: 'bacnet', ip_address: '192.168.1.103' };

describe('generateThingsBoardJson', () => {
  it('produces valid JSON', () => {
    const out = generateThingsBoardJson([MODBUS_DEVICE]);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('modbus device has address, functionCode, type fields', () => {
    const config = JSON.parse(generateThingsBoardJson([MODBUS_DEVICE]));
    const device = config.modbus[0];
    expect(device.host).toBe('192.168.1.101');
    expect(device.unitId).toBe(1);
    const point = device.timeseries[0];
    expect(point.tag).toBe('AHU1SATMP');
    expect(point.functionCode).toBe(3);
    expect(point.address).toBe(8336);
    expect(point.type).toBe('16int');
  });

  it('bacnet device has objectType and instance', () => {
    const bacnetDevice: SimDevice = { ...BACNET_DEVICE, points: [BACNET_POINT] };
    const config = JSON.parse(generateThingsBoardJson([bacnetDevice]));
    const device = config.bacnet[0];
    expect(device.host).toBe('192.168.1.103');
    const point = device.timeseries[0];
    expect(point.objectType).toBe('analogInput');
    expect(point.instance).toBe(0);
  });
});
