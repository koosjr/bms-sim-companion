// src/types.ts

// ── Imported from BMSHub ─────────────────────────────────────────────────────

export type IOType = 'AI' | 'AO' | 'DI' | 'DO';

export interface ImportedPoint {
  tag: string;
  description: string;
  io_type: IOType;
}

export interface ImportedDevice {
  id: string;
  name: string;
  profile_name?: string;   // TB device profile — same for all devices of same type
  description: string;
  points: ImportedPoint[];
}

export interface SimulatorExport {
  version: string;
  project: string;
  exported_at: string;
  devices: ImportedDevice[];
}

// ── Protocol types ───────────────────────────────────────────────────────────

export type Protocol = 'modbus' | 'bacnet';
export type ByteOrder = 'big' | 'little';
export type ModbusDataType = 'bool' | '16int' | '16uint' | '32float' | '32int' | '32uint';
export type ModbusFunctionCode = 1 | 2 | 3 | 4;
export type BACnetObjectType =
  | 'analogInput' | 'analogOutput' | 'analogValue'
  | 'binaryInput' | 'binaryOutput' | 'binaryValue'
  | 'multiStateValue';
export type BACnetUnits =
  | 'degreesCelsius'
  | 'percent' | 'percentOpen' | 'percentClose'
  | 'kilopascals' | 'pascals' | 'bars' | 'poundsForcePerSquareInch'
  | 'volts' | 'amperes'
  | 'kilovoltAmperes' | 'kilovoltAmperesReactive'
  | 'kilowatts' | 'watts'
  | 'partsPerMillion'
  | 'noUnits';

// ── ThingsBoard metadata ──────────────────────────────────────────────────────

/** Where the point is sent in the ThingsBoard connector */
export type DataCategory = 'timeseries' | 'attribute' | 'attribute_update' | 'rpc';

/** Per-point reporting strategy override (null = auto-infer from point type/name) */
export type TBReportStrategy = 'ON_REPORT_PERIOD' | 'ON_VALUE_CHANGE';

// ── Configured point (protocol addressing + sim values) ──────────────────────

export interface SimPoint {
  tag: string;
  description: string;
  io_type: IOType;
  // Modbus
  function_code: ModbusFunctionCode;
  register: number;
  data_type: ModbusDataType;
  scale: number;
  object_count: number;
  // BACnet
  object_type: BACnetObjectType;
  object_instance: number;
  units: BACnetUnits;
  cov_increment: number;
  // Sim values (engineering units)
  base_value: number;
  noise_pct: number;
  // ThingsBoard metadata
  data_category?: DataCategory;          // timeseries (default) | attribute | attribute_update | rpc
  report_strategy?: TBReportStrategy | null; // null = auto-infer from point type/name
}

// ── Configured device ────────────────────────────────────────────────────────

export interface SimDevice {
  id: string;
  source_id: string;       // ImportedDevice.id this was derived from
  name: string;
  profile_name: string;    // TB device profile — same for all devices of same type
  description: string;
  protocol: Protocol;
  ip_address: string;
  // Modbus
  modbus_port: number;
  unit_id: number;
  byte_order: ByteOrder;
  word_order: ByteOrder;
  addressBase?: 0 | 1;   // 0 = stored as-is (default), 1 = subtract 1 at export
  // BACnet
  bacnet_port: number;
  device_instance: number;
  device_name: string;
  vendor_id: number;
  points: SimPoint[];
}

// ── Project-level network config ─────────────────────────────────────────────

export interface NetworkConfig {
  ip_prefix: string;        // first 3 octets, e.g. "192.168.1"
  subnet: string;           // derived, e.g. "192.168.1.0/24"
  gateway: string;          // e.g. "192.168.1.1"
  pi_ip: string;            // Pi's own macvlan IP, e.g. "192.168.1.200"
  parent_interface: string; // e.g. "eth0"
}

// ── Device Assembly (saved device template) ──────────────────────────────────

export interface DeviceAssembly {
  id: string;
  name: string;          // user-given assembly name e.g. "ABB PM5 Power Meter"
  description: string;
  protocol: Protocol;
  savedAt: string;
  points: SimPoint[];    // full point config including addresses
  addressBase?: 0 | 1;   // 0 = stored as-is (default), 1 = subtract 1 at export
  sourceFile?: string;   // original filename for traceability
}

// ── App state ─────────────────────────────────────────────────────────────────

export interface AppState {
  project_name: string;
  imported: SimulatorExport | null;
  devices: SimDevice[];
  network: NetworkConfig;
}
