// src/lib/supplierImport.ts
import type {
  SimPoint, ModbusDataType, ModbusFunctionCode,
  BACnetObjectType, BACnetUnits, IOType, Protocol,
} from '../types';

// ── Public types ─────────────────────────────────────────────────────────────

export type RawRow = Record<string, string | number | null | undefined>;

export interface ColumnMapping {
  pointName: string;
  address: string;
  functionCode?: string;
  dataType?: string;
  scaleFactor?: string;
  units?: string;
  objectType?: string;
  access?: string;
}

export interface ImportResult {
  points: SimPoint[];
  /** Rows skipped entirely (low-word pair rows, blank rows, DEV/unrecognised BACnet objects) */
  skippedCount: number;
  /** 0-based row indices that are missing a name or address. These rows ARE included in `points`
   *  but carry placeholder values: register/object_instance = 0, tag = "POINT_<index>". */
  invalidIndices: number[];
}

// ── Normalisation: data types ─────────────────────────────────────────────────

const DATA_TYPE_MAP: Record<string, { dataType: ModbusDataType; objectCount: number }> = {
  float32: { dataType: '32float', objectCount: 2 },
  float:   { dataType: '32float', objectCount: 2 },
  uint16:  { dataType: '16uint', objectCount: 1 },
  int16:   { dataType: '16int',  objectCount: 1 },
  uint32:  { dataType: '32uint', objectCount: 2 },
  int32:   { dataType: '32int',  objectCount: 2 },
  bool:    { dataType: 'bool',   objectCount: 1 },
  bit:     { dataType: 'bool',   objectCount: 1 },
};

/** Strip _HI/_HIGH pair marker suffix, then look up data type */
export function normaliseDataType(raw: string): { dataType: ModbusDataType; objectCount: number } {
  const stripped = raw.replace(/_HI(GH)?$/i, '').replace(/_LW$/i, '').replace(/_LOW$/i, '').replace(/_LO$/i, '');
  const key = stripped.toLowerCase();
  return DATA_TYPE_MAP[key] ?? { dataType: '16uint', objectCount: 1 };
}

/** Returns true if this row is the low-word of a 32-bit pair and should be skipped */
export function isLowWordRow(dataTypeRaw: string): boolean {
  return /_(LW|LOW|LO)$/i.test(dataTypeRaw.trim());
}

// ── Normalisation: address ────────────────────────────────────────────────────

/**
 * Parse an address cell value.
 * Handles: plain integer, "1032/33" (slash notation), "1032-1033" (range notation).
 * Returns null if unparseable.
 */
export function parseAddress(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
  const str = String(raw).trim();
  // Slash notation: "1032/33"
  const slash = str.match(/^(\d+)\s*\/\s*\d+$/);
  if (slash) return parseInt(slash[1], 10);
  // Range notation: "1032-1033"
  const range = str.match(/^(\d+)\s*-\s*\d+$/);
  if (range) return parseInt(range[1], 10);
  // Plain integer
  const plain = parseInt(str, 10);
  return Number.isFinite(plain) && String(plain) === str ? plain : null;
}

// ── Normalisation: function code ──────────────────────────────────────────────

export function normaliseFunctionCode(raw: string | number | null | undefined): ModbusFunctionCode {
  if (raw === null || raw === undefined) return 3;
  const s = String(raw).trim().toLowerCase();
  if (s === 'input' || s === 'input register') return 4;
  if (s === 'holding' || s === 'holding register') return 3;
  if (s === 'coil') return 1;
  if (s === 'discrete' || s === 'discrete input') return 2;
  const n = parseInt(s.replace(/^fc/i, ''), 10);
  if (n >= 1 && n <= 4) return n as ModbusFunctionCode;
  return 3;
}

// ── Normalisation: BACnet object types ───────────────────────────────────────

const OBJECT_TYPE_MAP: Record<string, BACnetObjectType | null> = {
  ai: 'analogInput', analoginput: 'analogInput',
  ao: 'analogOutput', analogoutput: 'analogOutput',
  av: 'analogValue', analogvalue: 'analogValue',
  bi: 'binaryInput', binaryinput: 'binaryInput',
  bo: 'binaryOutput', binaryoutput: 'binaryOutput',
  bv: 'binaryValue', binaryvalue: 'binaryValue',
  mv: 'multiStateValue', msv: 'multiStateValue', mi: 'multiStateValue',
  multistate: 'multiStateValue', multistatevalue: 'multiStateValue',
  dev: null,  // device object — skip row
};

export function normaliseObjectType(raw: string): BACnetObjectType | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  return key in OBJECT_TYPE_MAP ? OBJECT_TYPE_MAP[key] : null;
}

// ── Normalisation: units ──────────────────────────────────────────────────────

const UNITS_MAP: [string[], BACnetUnits][] = [
  [['°c', 'degc', 'celsius'],                              'degreesCelsius'],
  [['kpa', 'kilopascal'],                                  'kilopascals'],
  [['pa', 'pascal'],                                       'pascals'],
  [['bar', 'bars'],                                        'bars'],
  [['psi'],                                                'poundsForcePerSquareInch'],
  [['%', 'percent', 'pct'],                                'percent'],
  [['% open', '%open'],                                    'percentOpen'],
  [['% close', '%close'],                                  'percentClose'],
  [['v', 'volt', 'volts'],                                 'volts'],
  [['a', 'amp', 'amps', 'ampere', 'amperes'],              'amperes'],
  [['kva', 'kilovoltampere'],                              'kilovoltAmperes'],
  [['kvar', 'kilovoltamperereactive'],                     'kilovoltAmperesReactive'],
  [['kw', 'kilowatt'],                                     'kilowatts'],
  [['w', 'watt'],                                          'watts'],
  [['kg/h', 'kgh', 'kilogramsperhour'],                   'kilogramsPerHour'],
  [['l/h', 'lh', 'litresperhour', 'litershour'],          'litersPerHour'],
  [['l/s', 'ls', 'litrespersecond', 'literssecond'],      'litersPerSecond'],
  [['l/min', 'lmin', 'litresperminute', 'litersminute'],  'litersPerMinute'],
  [['rpm', 'rev/min', 'revolutionsperminute'],             'revolutionsPerMinute'],
  [['ppm'],                                                'partsPerMillion'],
];

export function normaliseUnits(raw: string): BACnetUnits {
  const key = raw.trim().toLowerCase();
  if (!key) return 'noUnits';
  for (const [patterns, unit] of UNITS_MAP) {
    if (patterns.includes(key)) return unit;
  }
  return 'noUnits';
}

// ── IO type inference ─────────────────────────────────────────────────────────

export function ioTypeFromModbus(dataType: ModbusDataType): IOType {
  return dataType === 'bool' ? 'DI' : 'AI';
}

export function ioTypeFromBACnet(objectType: BACnetObjectType): IOType {
  switch (objectType) {
    case 'analogOutput': return 'AO';
    case 'binaryOutput': return 'DO';
    case 'binaryInput':
    case 'binaryValue':  return 'DI';
    default:             return 'AI';
  }
}

// ── Tag sanitisation ──────────────────────────────────────────────────────────

export function sanitizeTag(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'POINT';
}

// ── Main SimPoint builder ─────────────────────────────────────────────────────

function getCellString(row: RawRow, col: string | undefined): string {
  if (!col) return '';
  const v = row[col];
  return v === null || v === undefined ? '' : String(v).trim();
}

function getCellNumber(row: RawRow, col: string | undefined, fallback: number): number {
  if (!col) return fallback;
  const v = row[col];
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

export function buildSimPoints(
  rows: RawRow[],
  mapping: ColumnMapping,
  protocol: Protocol,
): ImportResult {
  const points: SimPoint[] = [];
  let skippedCount = 0;
  const invalidIndices: number[] = [];
  let pointIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip low-word rows (Modbus 32-bit pair convention)
    if (protocol === 'modbus' && mapping.dataType) {
      const rawDt = getCellString(row, mapping.dataType);
      if (rawDt && isLowWordRow(rawDt)) { skippedCount++; continue; }
    }

    // Resolve name and address
    const rawName = getCellString(row, mapping.pointName);
    const rawAddr = row[mapping.address];
    const addr = parseAddress(rawAddr);

    // Skip rows with no name and no address (blank rows)
    if (!rawName && addr === null) { skippedCount++; continue; }

    // Flag rows with missing required fields
    const isInvalid = !rawName || addr === null;
    if (isInvalid) invalidIndices.push(pointIndex);

    const tag = sanitizeTag(rawName || `POINT_${i}`);
    const description = rawName;
    const scaleRaw = getCellNumber(row, mapping.scaleFactor, 1);
    const scale = scaleRaw !== 0 ? scaleRaw : 1;
    const unitsRaw = getCellString(row, mapping.units);
    const units = normaliseUnits(unitsRaw);

    let point: SimPoint;

    if (protocol === 'modbus') {
      const rawDt = getCellString(row, mapping.dataType);
      const { dataType, objectCount } = rawDt ? normaliseDataType(rawDt) : { dataType: '16uint' as ModbusDataType, objectCount: 1 };
      const rawFc = mapping.functionCode ? row[mapping.functionCode] : undefined;
      const functionCode = normaliseFunctionCode(rawFc as string | number | null);
      const ioType = ioTypeFromModbus(dataType);

      point = {
        tag,
        description,
        io_type: ioType,
        function_code: functionCode,
        register: addr ?? 0,
        data_type: dataType,
        scale,
        object_count: objectCount,
        object_type: 'analogInput',
        object_instance: 0,
        units,
        cov_increment: 0.1,
        base_value: 0,
        noise_pct: 1,
      };
    } else {
      // BACnet
      const rawOt = getCellString(row, mapping.objectType);
      const objectType = rawOt ? normaliseObjectType(rawOt) : null;

      // Skip DEV objects and unrecognised types
      if (rawOt && objectType === null) { skippedCount++; continue; }

      const resolvedObjectType = objectType ?? 'analogValue';
      const ioType = ioTypeFromBACnet(resolvedObjectType);

      point = {
        tag,
        description,
        io_type: ioType,
        function_code: 3,
        register: 0,
        data_type: '16uint',
        scale,
        object_count: 1,
        object_type: resolvedObjectType,
        object_instance: addr ?? 0,
        units,
        cov_increment: resolvedObjectType.startsWith('binary') ? 0 : 0.1,
        base_value: 0,
        noise_pct: 1,
      };
    }

    points.push(point);
    pointIndex++;
  }

  return { points, skippedCount, invalidIndices };
}

// ── File parsing (SheetJS) ────────────────────────────────────────────────────

export interface ParsedFile {
  sheetNames: string[];
  activeSheet: string;
  rows: RawRow[];
  columns: string[];
  _file?: File;  // stored for sheet re-parsing
}

/**
 * Parse a CSV or XLSX File object.
 * If sheetName is provided, use that sheet; otherwise use the first sheet.
 * Returns structured rows with column headers as keys.
 */
export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheetNames = workbook.SheetNames;
  const activeSheet = sheetName && sheetNames.includes(sheetName)
    ? sheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[activeSheet];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(worksheet, {
    defval: null,
    raw: false,   // keep values as strings so we preserve "1032/33" notation
  });

  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  return { sheetNames, activeSheet, rows: rawRows, columns, _file: file };
}
