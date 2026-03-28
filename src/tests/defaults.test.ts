// src/tests/defaults.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSimPoint, defaultDeviceFromImport } from '../defaults';
import type { ImportedPoint, ImportedDevice } from '../types';

const AI_TEMP: ImportedPoint = { tag: 'AHU1SATMP', description: 'SA Temp', io_type: 'AI' };
const DI_RUN: ImportedPoint  = { tag: 'AHU1RUNSS', description: 'Running', io_type: 'DI' };
const AO_VLV: ImportedPoint  = { tag: 'AHU1VLVCW', description: 'CW Valve', io_type: 'AO' };
const DO_DMP: ImportedPoint  = { tag: 'AHU1DMPSA', description: 'SA Damper', io_type: 'DO' };

describe('defaultSimPoint — Modbus protocol defaults', () => {
  it('AI → FC3, 16int, scale 10', () => {
    const p = defaultSimPoint(AI_TEMP, 0, 'modbus');
    expect(p.function_code).toBe(3);
    expect(p.data_type).toBe('16int');
    expect(p.scale).toBe(10);
    expect(p.register).toBe(0);
  });

  it('DI → FC1, bool, scale 1', () => {
    const p = defaultSimPoint(DI_RUN, 0, 'modbus');
    expect(p.function_code).toBe(1);
    expect(p.data_type).toBe('bool');
    expect(p.scale).toBe(1);
  });

  it('AO → FC3, 16int, scale 10', () => {
    const p = defaultSimPoint(AO_VLV, 0, 'modbus');
    expect(p.function_code).toBe(3);
    expect(p.data_type).toBe('16int');
  });

  it('DO → FC1, bool', () => {
    const p = defaultSimPoint(DO_DMP, 0, 'modbus');
    expect(p.function_code).toBe(1);
    expect(p.data_type).toBe('bool');
  });
});

describe('defaultSimPoint — BACnet protocol defaults', () => {
  it('AI → analogInput', () => {
    const p = defaultSimPoint(AI_TEMP, 5, 'bacnet');
    expect(p.object_type).toBe('analogInput');
    expect(p.object_instance).toBe(5);
  });

  it('DI → binaryInput', () => {
    const p = defaultSimPoint(DI_RUN, 0, 'bacnet');
    expect(p.object_type).toBe('binaryInput');
  });

  it('AO → analogOutput', () => {
    const p = defaultSimPoint(AO_VLV, 0, 'bacnet');
    expect(p.object_type).toBe('analogOutput');
  });

  it('DO → binaryOutput', () => {
    const p = defaultSimPoint(DO_DMP, 0, 'bacnet');
    expect(p.object_type).toBe('binaryOutput');
  });
});

describe('defaultSimPoint — sim values by QTY code', () => {
  it('TMP tag → base 14.0, noise 2', () => {
    const p = defaultSimPoint(AI_TEMP, 0, 'modbus');
    expect(p.base_value).toBe(14.0);
    expect(p.noise_pct).toBe(2);
  });

  it('RUN/SS tag → base 1, noise 0', () => {
    const p = defaultSimPoint(DI_RUN, 0, 'modbus');
    expect(p.base_value).toBe(1);
    expect(p.noise_pct).toBe(0);
  });

  it('VLV tag → base 75, noise 5', () => {
    const p = defaultSimPoint(AO_VLV, 0, 'modbus');
    expect(p.base_value).toBe(75);
    expect(p.noise_pct).toBe(5);
  });
});

describe('defaultDeviceFromImport', () => {
  const device: ImportedDevice = {
    id: 'ctrl-001', name: 'AHU1', description: 'Air Handler 1',
    points: [AI_TEMP, DI_RUN],
  };

  it('creates a SimDevice with Modbus defaults', () => {
    const d = defaultDeviceFromImport(device, 0);
    expect(d.name).toBe('AHU1');
    expect(d.protocol).toBe('modbus');
    expect(d.modbus_port).toBe(502);
    expect(d.unit_id).toBe(1);
    expect(d.points).toHaveLength(2);
  });

  it('assigns IP based on index', () => {
    const d0 = defaultDeviceFromImport(device, 0);
    const d1 = defaultDeviceFromImport(device, 1);
    expect(d0.ip_address).toBe('192.168.1.101');
    expect(d1.ip_address).toBe('192.168.1.102');
  });

  it('auto-increments BACnet object instances per point', () => {
    const bacnetDevice: ImportedDevice = {
      id: 'ctrl-002', name: 'CHR1', description: 'Chiller 1',
      points: [AI_TEMP, AO_VLV],
    };
    const d = defaultDeviceFromImport(bacnetDevice, 0);
    const bacnetPoints = d.points;
    expect(bacnetPoints[0].object_instance).toBe(0);
    expect(bacnetPoints[1].object_instance).toBe(1);
  });
});
