// src/defaults.ts
import { v4 as uuidv4 } from 'uuid';
import type {
  ImportedPoint, ImportedDevice, SimPoint, SimDevice,
  Protocol, ModbusFunctionCode, ModbusDataType, BACnetObjectType, BACnetUnits, IOType,
} from './types';
import { inferDataCategory } from './lib/pointDefaults';

// ── QTY-based sim value defaults ─────────────────────────────────────────────

interface SimDefaults { base: number; noise: number; }

const QTY_DEFAULTS: Record<string, SimDefaults> = {
  TMP: { base: 14.0, noise: 2 },
  PRS: { base: 250.0, noise: 1 },
  DPR: { base: 250.0, noise: 1 },
  RUN: { base: 1, noise: 0 },
  SS:  { base: 1, noise: 0 },
  VLV: { base: 75, noise: 5 },
  DMP: { base: 75, noise: 5 },
  HUM: { base: 55.0, noise: 3 },
  FLW: { base: 100.0, noise: 2 },
};

function simDefaults(tag: string): SimDefaults {
  // Tag format: EQUIP + NUM + [MED] + QTY + [MOD]
  // QTY is always present; we match known QTY codes within the tag
  for (const [code, vals] of Object.entries(QTY_DEFAULTS)) {
    if (tag.includes(code)) return vals;
  }
  return { base: 0, noise: 1 };
}

// ── IO type → Modbus defaults ─────────────────────────────────────────────────

function modbusDefaults(io: IOType): { fc: ModbusFunctionCode; dt: ModbusDataType; scale: number } {
  if (io === 'DI') return { fc: 1, dt: 'bool', scale: 1 };
  if (io === 'DO') return { fc: 1, dt: 'bool', scale: 1 };
  return { fc: 3, dt: '16int', scale: 10 }; // AI / AO
}

// ── IO type → BACnet defaults ─────────────────────────────────────────────────

function bacnetObjectType(io: IOType): BACnetObjectType {
  switch (io) {
    case 'AI': return 'analogInput';
    case 'AO': return 'analogOutput';
    case 'DI': return 'binaryInput';
    case 'DO': return 'binaryOutput';
  }
}

function bacnetUnits(tag: string): BACnetUnits {
  if (tag.includes('TMP'))                          return 'degreesCelsius';
  if (tag.includes('PRS'))                          return 'kilopascals';
  if (tag.includes('DPR'))                          return 'pascals';
  if (tag.includes('HUM'))                          return 'percent';
  if (tag.includes('VLV') || tag.includes('DMP'))   return 'percentOpen';
  return 'noUnits';
}

// ── Public API ────────────────────────────────────────────────────────────────

export function defaultSimPoint(
  imported: ImportedPoint,
  instanceIndex: number,
  _protocol: Protocol,
): SimPoint {
  const { fc, dt, scale } = modbusDefaults(imported.io_type);
  const sim = simDefaults(imported.tag);

  return {
    tag: imported.tag,
    description: imported.description,
    io_type: imported.io_type,
    // Modbus
    function_code: fc,
    register: 0,
    data_type: dt,
    scale,
    object_count: 1,
    // BACnet
    object_type: bacnetObjectType(imported.io_type),
    object_instance: instanceIndex,
    units: bacnetUnits(imported.tag),
    cov_increment: imported.io_type === 'AI' || imported.io_type === 'AO' ? 0.1 : 0,
    // Sim values
    base_value: sim.base,
    noise_pct: sim.noise,
    // ThingsBoard metadata
    data_category: inferDataCategory(imported.tag),
    report_strategy: null, // null = auto-infer at export time
  };
}

export function defaultDeviceFromImport(imported: ImportedDevice, index: number): SimDevice {
  return {
    id: uuidv4(),
    source_id: imported.id,
    name: imported.name,
    profile_name: imported.profile_name || imported.name,
    description: imported.description,
    protocol: 'modbus',
    ip_address: `192.168.1.${101 + index}`,
    modbus_port: 502,
    unit_id: 1,
    byte_order: 'big',
    word_order: 'big',
    bacnet_port: 47808,
    device_instance: 1000 + index,
    device_name: imported.name,
    vendor_id: 999,
    points: imported.points.map((p, i) => defaultSimPoint(p, i, 'modbus')),
  };
}
