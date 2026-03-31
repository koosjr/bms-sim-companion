# Supplier File Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-side wizard that imports a supplier Modbus/BACnet point list (CSV or XLSX) and saves a fully-populated Assembly to the Assembly Library, with all registers, data types, scale factors and units already filled in.

**Architecture:** Three pure-logic library files (columnDetector, supplierImport) plus a wizard UI component wired as a new tab in App.tsx. Address base correction (0 vs 1-based) is stored on DeviceAssembly and SimDevice and applied at export time in the existing generators — the raw imported address is always what the user sees on screen.

**Tech Stack:** React + TypeScript, Vite, Vitest (already installed), SheetJS `xlsx` (new dependency) for in-browser CSV + XLSX parsing.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/columnDetector.ts` | Pure functions: detect protocol, auto-map column names to target fields |
| Create | `src/lib/supplierImport.ts` | Pure functions: parse file, normalise types, build `SimPoint[]` |
| Create | `src/components/SupplierImportTab.tsx` | 3-step wizard UI |
| Create | `src/tests/columnDetector.test.ts` | Unit tests for detector |
| Create | `src/tests/supplierImport.test.ts` | Unit tests for normalisation + builder |
| Modify | `src/types.ts` | Add `addressBase` + `sourceFile` to `DeviceAssembly`; add `addressBase` to `SimDevice` |
| Modify | `src/App.tsx` | Add `'supplier'` tab, wire `SupplierImportTab`, navigate to devices on save |
| Modify | `src/components/PointMappingTab.tsx` | Add per-device `addressBase` toggle |
| Modify | `src/generators/configGenerator.ts` | Apply address base correction at export |
| Modify | `src/generators/thingsBoardExporter.ts` | Apply address base correction at export |

---

## Task 1: Install SheetJS and update types

**Files:**
- Modify: `src/types.ts`
- Run: `npm install`

- [ ] **Step 1: Install SheetJS**

```bash
cd /c/Dev/bms-sim-companion
npm install xlsx
```

Expected output: `added 1 package` (or similar), no errors.

- [ ] **Step 2: Update `DeviceAssembly` and `SimDevice` in types.ts**

Open `src/types.ts`. Replace the `DeviceAssembly` interface:

```typescript
export interface DeviceAssembly {
  id: string;
  name: string;
  description: string;
  protocol: Protocol;
  savedAt: string;
  points: SimPoint[];
  addressBase?: 0 | 1;   // 0 = stored as-is (default), 1 = subtract 1 at export
  sourceFile?: string;   // original filename for traceability
}
```

Add `addressBase` to `SimDevice` (after `word_order`):

```typescript
export interface SimDevice {
  id: string;
  source_id: string;
  name: string;
  description: string;
  protocol: Protocol;
  ip_address: string;
  modbus_port: number;
  unit_id: number;
  byte_order: ByteOrder;
  word_order: ByteOrder;
  addressBase?: 0 | 1;   // ADD THIS LINE
  bacnet_port: number;
  device_instance: number;
  device_name: string;
  vendor_id: number;
  points: SimPoint[];
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /c/Dev/bms-sim-companion
npm run build 2>&1 | head -20
```

Expected: build succeeds (zero type errors). The new optional fields are backward-compatible.

- [ ] **Step 4: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/types.ts package.json package-lock.json
git commit -m "feat: add xlsx dep + addressBase/sourceFile fields to types"
```

---

## Task 2: columnDetector.ts — protocol and column auto-detection

**Files:**
- Create: `src/lib/columnDetector.ts`
- Create: `src/tests/columnDetector.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/tests/columnDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectProtocol, detectColumnMapping } from '../lib/columnDetector';

describe('detectProtocol', () => {
  it('detects modbus when a column contains "register"', () => {
    expect(detectProtocol(['Name', 'Register_Number_1based', 'Data_Type'])).toBe('modbus');
  });
  it('detects modbus from "function_code" column', () => {
    expect(detectProtocol(['Name', 'Function_Code', 'Address_0based'])).toBe('modbus');
  });
  it('detects bacnet when a column contains "object"', () => {
    expect(detectProtocol(['#', 'Object_Type', 'Instance', 'Description'])).toBe('bacnet');
  });
  it('detects bacnet from "instance" column', () => {
    expect(detectProtocol(['Name', 'Instance', 'Range / Units'])).toBe('bacnet');
  });
  it('returns unknown when ambiguous', () => {
    expect(detectProtocol(['Name', 'Value', 'Units'])).toBe('unknown');
  });
  it('is case-insensitive', () => {
    expect(detectProtocol(['REGISTER', 'NAME', 'TYPE'])).toBe('modbus');
  });
});

describe('detectColumnMapping', () => {
  it('maps Name column to pointName', () => {
    const result = detectColumnMapping(['Name', 'Register', 'Data_Type'], 'modbus');
    expect(result.pointName).toBe('Name');
  });
  it('maps Address_0based to address', () => {
    const result = detectColumnMapping(['Address_0based', 'Name', 'Units'], 'modbus');
    expect(result.address).toBe('Address_0based');
  });
  it('maps Register_Number_1based to address (register matches)', () => {
    const result = detectColumnMapping(['Register_Number_1based', 'Name'], 'modbus');
    expect(result.address).toBe('Register_Number_1based');
  });
  it('maps Scale_Factor to scaleFactor', () => {
    const result = detectColumnMapping(['Name', 'Register', 'Scale_Factor'], 'modbus');
    expect(result.scaleFactor).toBe('Scale_Factor');
  });
  it('does not map objectType in modbus mode', () => {
    const result = detectColumnMapping(['Object_Type', 'Instance', 'Name'], 'modbus');
    expect(result.objectType).toBeUndefined();
  });
  it('does not map dataType in bacnet mode', () => {
    const result = detectColumnMapping(['Data_Type', 'Instance', 'Name'], 'bacnet');
    expect(result.dataType).toBeUndefined();
  });
  it('maps Object_Type to objectType in bacnet mode', () => {
    const result = detectColumnMapping(['Object_Type', 'Instance', 'Name'], 'bacnet');
    expect(result.objectType).toBe('Object_Type');
  });
  it('maps Instance to address in bacnet mode', () => {
    const result = detectColumnMapping(['Object_Type', 'Instance', 'Name'], 'bacnet');
    expect(result.address).toBe('Instance');
  });
  it('picks best match when multiple columns match same field', () => {
    // "address" is a closer match than "Register_Number_1based" for address field
    const result = detectColumnMapping(['Register_Number_1based', 'Address_0based', 'Name'], 'modbus');
    // Both match — the one with lower index wins (first match)
    expect(['Register_Number_1based', 'Address_0based']).toContain(result.address);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run src/tests/columnDetector.test.ts 2>&1 | tail -10
```

Expected: all tests fail with "Cannot find module '../lib/columnDetector'".

- [ ] **Step 3: Create `src/lib/columnDetector.ts`**

```typescript
// src/lib/columnDetector.ts

export type DetectedProtocol = 'modbus' | 'bacnet' | 'unknown';

export type TargetField =
  | 'pointName' | 'address' | 'functionCode' | 'dataType'
  | 'scaleFactor' | 'units' | 'objectType' | 'access';

// Patterns that indicate each protocol (checked against column names, case-insensitive)
const MODBUS_HINTS = ['register', 'function_code', 'function code', 'modbus', 'fc'];
const BACNET_HINTS = ['object', 'instance', 'bacnet'];

// Field patterns: [targetField, patterns[], modbusOnly?, bacnetOnly?]
type FieldRule = [TargetField, string[], boolean, boolean];
const FIELD_RULES: FieldRule[] = [
  ['pointName',    ['name', 'description', 'object name', 'parameter_name', 'parameter'], false, false],
  ['address',      ['register', 'address', 'instance', 'object_id', 'offset', 'addr'],    false, false],
  ['functionCode', ['fc', 'function_code', 'function code'],                               true,  false],
  ['dataType',     ['data_type', 'data type', 'format'],                                   true,  false],
  ['scaleFactor',  ['scale', 'scale_factor', 'multiplier', 'factor'],                      false, false],
  ['units',        ['units', 'unit', 'eng_range'],                                         false, false],
  ['objectType',   ['object_type', 'object type', 'type'],                                 false, true ],
  ['access',       ['access', 'r/w', 'rw', 'read_write'],                                  false, false],
];

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

export function detectProtocol(columns: string[]): DetectedProtocol {
  const lower = columns.map(normalise);
  const hasModbus = lower.some(col => MODBUS_HINTS.some(h => col.includes(h)));
  const hasBACnet = lower.some(col => BACNET_HINTS.some(h => col.includes(h)));
  if (hasModbus && !hasBACnet) return 'modbus';
  if (hasBACnet && !hasModbus) return 'bacnet';
  return 'unknown';
}

export function detectColumnMapping(
  columns: string[],
  protocol: 'modbus' | 'bacnet',
): Partial<Record<TargetField, string>> {
  const result: Partial<Record<TargetField, string>> = {};

  for (const [field, patterns, modbusOnly, bacnetOnly] of FIELD_RULES) {
    if (modbusOnly && protocol !== 'modbus') continue;
    if (bacnetOnly && protocol !== 'bacnet') continue;

    for (const col of columns) {
      const lower = normalise(col);
      if (patterns.some(p => lower.includes(p))) {
        if (!result[field]) result[field] = col; // first match wins
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run src/tests/columnDetector.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/lib/columnDetector.ts src/tests/columnDetector.test.ts
git commit -m "feat: column detector — protocol and field auto-detection"
```

---

## Task 3: supplierImport.ts — normalisation functions and builder

**Files:**
- Create: `src/lib/supplierImport.ts`
- Create: `src/tests/supplierImport.test.ts`

- [ ] **Step 1: Write failing tests for normalisation functions**

Create `src/tests/supplierImport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  normaliseDataType,
  normaliseObjectType,
  parseAddress,
  isLowWordRow,
  normaliseFunctionCode,
  ioTypeFromModbus,
  ioTypeFromBACnet,
  normaliseUnits,
  sanitizeTag,
} from '../lib/supplierImport';

describe('normaliseDataType', () => {
  it('maps Float32 → 32float, objectCount 2', () => {
    expect(normaliseDataType('Float32')).toEqual({ dataType: '32float', objectCount: 2 });
  });
  it('maps FLOAT → 32float', () => {
    expect(normaliseDataType('FLOAT')).toEqual({ dataType: '32float', objectCount: 2 });
  });
  it('maps UInt16 → 16uint, objectCount 1', () => {
    expect(normaliseDataType('UInt16')).toEqual({ dataType: '16uint', objectCount: 1 });
  });
  it('maps INT16 → 16int, objectCount 1', () => {
    expect(normaliseDataType('INT16')).toEqual({ dataType: '16int', objectCount: 1 });
  });
  it('maps UINT32 → 32uint, objectCount 2', () => {
    expect(normaliseDataType('UINT32')).toEqual({ dataType: '32uint', objectCount: 2 });
  });
  it('maps INT32 → 32int, objectCount 2', () => {
    expect(normaliseDataType('INT32')).toEqual({ dataType: '32int', objectCount: 2 });
  });
  it('strips _HI suffix before lookup', () => {
    expect(normaliseDataType('UINT32_HI')).toEqual({ dataType: '32uint', objectCount: 2 });
  });
  it('strips _HIGH suffix before lookup', () => {
    expect(normaliseDataType('INT32_HIGH')).toEqual({ dataType: '32int', objectCount: 2 });
  });
  it('maps BOOL → bool, objectCount 1', () => {
    expect(normaliseDataType('BOOL')).toEqual({ dataType: 'bool', objectCount: 1 });
  });
  it('maps Bit → bool', () => {
    expect(normaliseDataType('Bit')).toEqual({ dataType: 'bool', objectCount: 1 });
  });
  it('falls back to 16uint for unknown types', () => {
    expect(normaliseDataType('MYSTERY')).toEqual({ dataType: '16uint', objectCount: 1 });
  });
});

describe('isLowWordRow', () => {
  it('returns true for _LW suffix', () => expect(isLowWordRow('UINT32_LW')).toBe(true));
  it('returns true for _LOW suffix', () => expect(isLowWordRow('INT32_LOW')).toBe(true));
  it('returns true for _LO suffix', () => expect(isLowWordRow('INT32_LO')).toBe(true));
  it('returns false for _HI', () => expect(isLowWordRow('UINT32_HI')).toBe(false));
  it('returns false for plain UINT32', () => expect(isLowWordRow('UINT32')).toBe(false));
  it('is case-insensitive', () => expect(isLowWordRow('uint32_lw')).toBe(true));
});

describe('parseAddress', () => {
  it('parses plain integer string', () => expect(parseAddress('42')).toBe(42));
  it('parses numeric value', () => expect(parseAddress(42)).toBe(42));
  it('extracts first address from slash notation 1032/33', () => expect(parseAddress('1032/33')).toBe(1032));
  it('extracts first address from range notation 1032-1033', () => expect(parseAddress('1032-1033')).toBe(1032));
  it('returns null for null input', () => expect(parseAddress(null)).toBeNull());
  it('returns null for undefined input', () => expect(parseAddress(undefined)).toBeNull());
  it('returns null for empty string', () => expect(parseAddress('')).toBeNull());
  it('returns null for non-numeric string', () => expect(parseAddress('N/A')).toBeNull());
});

describe('normaliseFunctionCode', () => {
  it('parses numeric 4', () => expect(normaliseFunctionCode(4)).toBe(4));
  it('parses string "4"', () => expect(normaliseFunctionCode('4')).toBe(4));
  it('parses "FC4" string', () => expect(normaliseFunctionCode('FC4')).toBe(4));
  it('parses "Input" as FC4', () => expect(normaliseFunctionCode('Input')).toBe(4));
  it('parses "Holding" as FC3', () => expect(normaliseFunctionCode('Holding')).toBe(3));
  it('defaults to 3 for unknown', () => expect(normaliseFunctionCode('blah')).toBe(3));
  it('defaults to 3 for null', () => expect(normaliseFunctionCode(null)).toBe(3));
});

describe('normaliseObjectType', () => {
  it('maps AI → analogInput', () => expect(normaliseObjectType('AI')).toBe('analogInput'));
  it('maps AO → analogOutput', () => expect(normaliseObjectType('AO')).toBe('analogOutput'));
  it('maps AV → analogValue', () => expect(normaliseObjectType('AV')).toBe('analogValue'));
  it('maps BI → binaryInput', () => expect(normaliseObjectType('BI')).toBe('binaryInput'));
  it('maps BO → binaryOutput', () => expect(normaliseObjectType('BO')).toBe('binaryOutput'));
  it('maps BV → binaryValue', () => expect(normaliseObjectType('BV')).toBe('binaryValue'));
  it('maps MV → multiStateValue', () => expect(normaliseObjectType('MV')).toBe('multiStateValue'));
  it('maps MSV → multiStateValue', () => expect(normaliseObjectType('MSV')).toBe('multiStateValue'));
  it('maps MI → multiStateValue', () => expect(normaliseObjectType('MI')).toBe('multiStateValue'));
  it('returns null for DEV', () => expect(normaliseObjectType('DEV')).toBeNull());
  it('returns null for unknown', () => expect(normaliseObjectType('XYZ')).toBeNull());
  it('is case-insensitive', () => expect(normaliseObjectType('ai')).toBe('analogInput'));
});

describe('normaliseUnits', () => {
  it('maps °C → degreesCelsius', () => expect(normaliseUnits('°C')).toBe('degreesCelsius'));
  it('maps % → percent', () => expect(normaliseUnits('%')).toBe('percent'));
  it('maps kPa → kilopascals', () => expect(normaliseUnits('kPa')).toBe('kilopascals'));
  it('maps Pa → pascals', () => expect(normaliseUnits('Pa')).toBe('pascals'));
  it('maps Hz → hertz', () => expect(normaliseUnits('Hz')).toBe('hertz'));
  it('maps RPM → revolutionsPerMinute', () => expect(normaliseUnits('RPM')).toBe('revolutionsPerMinute'));
  it('maps m3/h → cubicMetersPerHour', () => expect(normaliseUnits('m3/h')).toBe('cubicMetersPerHour'));
  it('maps L/s → litersPerSecond', () => expect(normaliseUnits('L/s')).toBe('litersPerSecond'));
  it('maps K → degreesKelvin', () => expect(normaliseUnits('K')).toBe('degreesKelvin'));
  it('maps unknown to noUnits', () => expect(normaliseUnits('bar')).toBe('noUnits'));
  it('maps empty string to noUnits', () => expect(normaliseUnits('')).toBe('noUnits'));
});

describe('ioTypeFromModbus', () => {
  it('bool → DI', () => expect(ioTypeFromModbus('bool')).toBe('DI'));
  it('16int → AI', () => expect(ioTypeFromModbus('16int')).toBe('AI'));
  it('16uint → AI', () => expect(ioTypeFromModbus('16uint')).toBe('AI'));
  it('32float → AI', () => expect(ioTypeFromModbus('32float')).toBe('AI'));
  it('32int → AI', () => expect(ioTypeFromModbus('32int')).toBe('AI'));
  it('32uint → AI', () => expect(ioTypeFromModbus('32uint')).toBe('AI'));
});

describe('ioTypeFromBACnet', () => {
  it('analogInput → AI', () => expect(ioTypeFromBACnet('analogInput')).toBe('AI'));
  it('analogOutput → AO', () => expect(ioTypeFromBACnet('analogOutput')).toBe('AO'));
  it('analogValue → AI', () => expect(ioTypeFromBACnet('analogValue')).toBe('AI'));
  it('binaryInput → DI', () => expect(ioTypeFromBACnet('binaryInput')).toBe('DI'));
  it('binaryOutput → DO', () => expect(ioTypeFromBACnet('binaryOutput')).toBe('DO'));
  it('binaryValue → DI', () => expect(ioTypeFromBACnet('binaryValue')).toBe('DI'));
  it('multiStateValue → AI', () => expect(ioTypeFromBACnet('multiStateValue')).toBe('AI'));
});

describe('sanitizeTag', () => {
  it('uppercases and replaces spaces with underscores', () => {
    expect(sanitizeTag('supply air temp')).toBe('SUPPLY_AIR_TEMP');
  });
  it('strips leading/trailing underscores', () => {
    expect(sanitizeTag(' Fan Speed ')).toBe('FAN_SPEED');
  });
  it('collapses multiple underscores', () => {
    expect(sanitizeTag('A  B')).toBe('A_B');
  });
  it('returns POINT for empty string', () => {
    expect(sanitizeTag('')).toBe('POINT');
  });
  it('truncates to 40 characters', () => {
    expect(sanitizeTag('A'.repeat(50))).toHaveLength(40);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run src/tests/supplierImport.test.ts 2>&1 | tail -5
```

Expected: all fail with "Cannot find module '../lib/supplierImport'".

- [ ] **Step 3: Create `src/lib/supplierImport.ts` with all normalisation functions**

```typescript
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
  skippedCount: number;       // rows skipped (low-word rows, DEV objects)
  invalidIndices: number[];   // 0-based row indices missing name or address
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
  [['°c', 'degc', 'celsius'],                             'degreesCelsius'],
  [['°f', 'degf', 'fahrenheit'],                          'degreesCelsius'], // convert label only
  [['k', 'kelvin'],                                        'degreesKelvin'],
  [['kpa', 'kilopascal'],                                  'kilopascals'],
  [['pa', 'pascal'],                                       'pascals'],
  [['%', 'percent', 'pct'],                               'percent'],
  [['m3/h', 'm³/h', 'cubicmetersperhour', 'm3h'],         'cubicMetersPerHour'],
  [['l/s', 'ls', 'litrespersecond', 'literssecond'],      'litersPerSecond'],
  [['hz', 'hertz'],                                        'hertz'],
  [['rpm', 'revolutionsperm', 'rev/min'],                  'revolutionsPerMinute'],
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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Skip low-word rows (Modbus 32-bit pair convention 1)
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
    if (isInvalid) invalidIndices.push(i);

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
        // BACnet defaults (unused for Modbus device but SimPoint is protocol-agnostic)
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
        scale: 1,
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
  }

  return { points, skippedCount, invalidIndices };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run src/tests/supplierImport.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/lib/supplierImport.ts src/tests/supplierImport.test.ts
git commit -m "feat: supplier import normalisation + SimPoint builder"
```

---

## Task 4: supplierImport.ts — file parsing (SheetJS)

**Files:**
- Modify: `src/lib/supplierImport.ts` (add `parseFile` function)

- [ ] **Step 1: Add `ParsedFile` type and `parseFile` to supplierImport.ts**

Append to the bottom of `src/lib/supplierImport.ts`:

```typescript
// ── File parsing (SheetJS) ────────────────────────────────────────────────────

export interface ParsedFile {
  sheetNames: string[];
  activeSheet: string;
  rows: RawRow[];
  columns: string[];
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
  // header: 1 → first row as array (used for column list)
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(worksheet, {
    defval: null,
    raw: false,   // keep values as strings so we preserve "1032/33" notation
  });

  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  return { sheetNames, activeSheet, rows: rawRows, columns };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /c/Dev/bms-sim-companion
npm run build 2>&1 | grep -E 'error|warning' | head -10
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/lib/supplierImport.ts
git commit -m "feat: supplier import file parsing via SheetJS"
```

---

## Task 5: SupplierImportTab — Step 1, Upload & Detect

**Files:**
- Create: `src/components/SupplierImportTab.tsx`

- [ ] **Step 1: Create the component with Step 1 only (upload + detect)**

Create `src/components/SupplierImportTab.tsx`:

```typescript
// src/components/SupplierImportTab.tsx
import { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Protocol } from '../types';
import type { RawRow, ColumnMapping, ParsedFile, ImportResult } from '../lib/supplierImport';
import { parseFile, buildSimPoints } from '../lib/supplierImport';
import { detectProtocol, detectColumnMapping } from '../lib/columnDetector';
import type { TargetField } from '../lib/columnDetector';
import { addAssembly, loadAssemblies } from '../storage';
import type { DeviceAssembly } from '../types';

interface Props {
  onSaved: () => void;  // called after assembly saved — App navigates to devices tab
}

type WizardStep = 1 | 2 | 3;

interface WizardState {
  step: WizardStep;
  fileName: string;
  parsedFile: ParsedFile | null;
  protocol: Protocol;
  columnMapping: Partial<ColumnMapping>;
  assemblyName: string;
  addressBase: 0 | 1;
  importResult: ImportResult | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  fileName: '',
  parsedFile: null,
  protocol: 'modbus',
  columnMapping: {},
  assemblyName: '',
  addressBase: 0,
  importResult: null,
  loading: false,
  error: null,
};

const inputCls = 'border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400';
const inputStyle = { borderColor: '#D3D1C7' };

// ── Step 1: Upload & Detect ───────────────────────────────────────────────────

function Step1Upload({
  wizard, setWizard,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(csv|xlsx)$/i)) {
      setWizard(w => ({ ...w, error: 'Only .csv and .xlsx files are supported.' }));
      return;
    }
    setWizard(w => ({ ...w, loading: true, error: null }));
    try {
      const parsed = await parseFile(file);
      const detectedRaw = detectProtocol(parsed.columns);
      const protocol: Protocol = detectedRaw === 'unknown' ? 'modbus' : detectedRaw;
      const colMapping = detectColumnMapping(parsed.columns, protocol);
      setWizard(w => ({
        ...w,
        loading: false,
        fileName: file.name,
        parsedFile: parsed,
        protocol,
        columnMapping: colMapping as Partial<ColumnMapping>,
        assemblyName: file.name.replace(/\.(csv|xlsx)$/i, ''),
        step: 2,
      }));
    } catch (e) {
      setWizard(w => ({ ...w, loading: false, error: `Failed to parse file: ${String(e)}` }));
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Import Supplier File</h2>
      <p className="text-sm mb-6" style={{ color: '#888780' }}>
        Import a Modbus or BACnet point list from a supplier CSV or Excel file.
        Creates a reusable Assembly in your library.
      </p>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragOver ? '#1D9E75' : '#D3D1C7',
          background: dragOver ? '#E1F5EE' : '#fff',
        }}
      >
        <div className="text-3xl mb-3">📂</div>
        <p className="font-medium text-sm" style={{ color: '#2C2C2A' }}>
          {wizard.loading ? 'Parsing file…' : 'Drop a file here, or click to browse'}
        </p>
        <p className="text-xs mt-1" style={{ color: '#888780' }}>
          Supported: .csv, .xlsx (including multi-sheet workbooks)
        </p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onInputChange} />
      </div>

      {wizard.error && (
        <p className="mt-3 text-sm" style={{ color: '#E24B4A' }}>{wizard.error}</p>
      )}
    </div>
  );
}

// ── Placeholder for Steps 2 + 3 (added in later tasks) ───────────────────────

function Step2MapColumns(_props: { wizard: WizardState; setWizard: React.Dispatch<React.SetStateAction<WizardState>> }) {
  return <div className="p-8 text-center text-sm" style={{ color: '#888780' }}>Step 2 coming in next task…</div>;
}

function Step3Preview(_props: { wizard: WizardState; setWizard: React.Dispatch<React.SetStateAction<WizardState>>; onSaved: () => void }) {
  return <div className="p-8 text-center text-sm" style={{ color: '#888780' }}>Step 3 coming in next task…</div>;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SupplierImportTab({ onSaved }: Props) {
  const [wizard, setWizard] = useState<WizardState>(INITIAL_STATE);

  const stepLabels = ['Upload & Detect', 'Map Columns', 'Preview & Save'];

  return (
    <div className="max-w-4xl">
      {/* Progress indicator */}
      <div className="flex items-center gap-3 mb-8">
        {stepLabels.map((label, i) => {
          const n = (i + 1) as WizardStep;
          const active = wizard.step === n;
          const done = wizard.step > n;
          return (
            <div key={n} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: done ? '#1D9E75' : active ? '#085041' : '#D3D1C7',
                  color: done || active ? '#fff' : '#888780',
                }}>
                {done ? '✓' : n}
              </div>
              <span className="text-sm" style={{ color: active ? '#2C2C2A' : '#888780', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
              {i < 2 && <span style={{ color: '#D3D1C7' }}>—</span>}
            </div>
          );
        })}
      </div>

      {wizard.step === 1 && <Step1Upload wizard={wizard} setWizard={setWizard} />}
      {wizard.step === 2 && <Step2MapColumns wizard={wizard} setWizard={setWizard} />}
      {wizard.step === 3 && <Step3Preview wizard={wizard} setWizard={setWizard} onSaved={onSaved} />}
    </div>
  );
}
```

- [ ] **Step 2: Wire tab into App.tsx temporarily to verify it renders**

In `src/App.tsx`, add `'supplier'` to the Tab type and register it:

```typescript
// Change this line:
type Tab = 'import' | 'devices' | 'points' | 'values' | 'generate';
// To:
type Tab = 'import' | 'devices' | 'points' | 'values' | 'generate' | 'supplier';
```

Add to the TABS array (before `import`):
```typescript
{ id: 'supplier', label: '⊕ Supplier Import' },
```

Add the import at the top:
```typescript
import SupplierImportTab from './components/SupplierImportTab';
```

Add to the content area (before the existing conditionals):
```typescript
{activeTab === 'supplier' && <SupplierImportTab onSaved={() => setActiveTab('devices')} />}
```

- [ ] **Step 3: Run dev server and verify the tab renders**

```bash
cd /c/Dev/bms-sim-companion
npm run dev
```

Open browser → click "⊕ Supplier Import" tab → see drop zone. No console errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/components/SupplierImportTab.tsx src/App.tsx
git commit -m "feat: SupplierImportTab Step 1 - upload and file detection"
```

---

## Task 6: SupplierImportTab — Step 2, Map Columns

**Files:**
- Modify: `src/components/SupplierImportTab.tsx`

- [ ] **Step 1: Replace the `Step2MapColumns` placeholder with the full implementation**

Replace the `Step2MapColumns` function in `src/components/SupplierImportTab.tsx`:

```typescript
const TARGET_FIELDS_MODBUS: { field: keyof ColumnMapping; label: string; required: boolean }[] = [
  { field: 'pointName',    label: 'Point Name',    required: true },
  { field: 'address',      label: 'Register',      required: true },
  { field: 'functionCode', label: 'Function Code', required: false },
  { field: 'dataType',     label: 'Data Type',     required: false },
  { field: 'scaleFactor',  label: 'Scale Factor',  required: false },
  { field: 'units',        label: 'Units',         required: false },
  { field: 'access',       label: 'R/W Access',    required: false },
];

const TARGET_FIELDS_BACNET: { field: keyof ColumnMapping; label: string; required: boolean }[] = [
  { field: 'pointName',   label: 'Point Name',   required: true },
  { field: 'address',     label: 'Instance',     required: true },
  { field: 'objectType',  label: 'Object Type',  required: false },
  { field: 'scaleFactor', label: 'Scale Factor', required: false },
  { field: 'units',       label: 'Units',        required: false },
  { field: 'access',      label: 'R/W Access',   required: false },
];

function Step2MapColumns({
  wizard, setWizard,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const parsed = wizard.parsedFile!;
  const targetFields = wizard.protocol === 'modbus' ? TARGET_FIELDS_MODBUS : TARGET_FIELDS_BACNET;

  function assignColumn(field: keyof ColumnMapping, col: string | null) {
    setWizard(w => ({
      ...w,
      columnMapping: col
        ? { ...w.columnMapping, [field]: col }
        : Object.fromEntries(Object.entries(w.columnMapping).filter(([k]) => k !== field)),
    }));
  }

  function canProceed() {
    return !!(wizard.columnMapping.pointName && wizard.columnMapping.address && wizard.assemblyName.trim());
  }

  function goToPreview() {
    setWizard(w => ({ ...w, step: 3, importResult: null }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#2C2C2A' }}>Map Columns</h2>
          <p className="text-sm mt-0.5" style={{ color: '#888780' }}>
            {parsed.rows.length} rows · {parsed.columns.length} columns · {parsed.fileName ?? wizard.fileName}
          </p>
        </div>
        {/* Protocol toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: '#888780' }}>Protocol:</span>
          <div className="flex border rounded overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
            {(['modbus', 'bacnet'] as Protocol[]).map(p => (
              <button key={p}
                className="px-3 py-1 text-xs font-mono font-bold uppercase"
                style={wizard.protocol === p
                  ? { background: '#1D9E75', color: '#fff' }
                  : { background: '#fff', color: '#888780' }}
                onClick={() => {
                  const newMapping = detectColumnMapping(parsed.columns, p) as Partial<ColumnMapping>;
                  setWizard(w => ({ ...w, protocol: p, columnMapping: newMapping }));
                }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sheet selector for multi-sheet XLSX */}
      {parsed.sheetNames.length > 1 && (
        <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: '#D3D1C7', background: '#F9F8F4' }}>
          <span className="text-xs font-medium mr-2" style={{ color: '#888780' }}>Sheet:</span>
          <div className="inline-flex gap-1 flex-wrap">
            {parsed.sheetNames.map(name => (
              <button key={name}
                className="text-xs px-2 py-1 rounded border"
                style={parsed.activeSheet === name
                  ? { borderColor: '#1D9E75', background: '#E1F5EE', color: '#085041' }
                  : { borderColor: '#D3D1C7', color: '#888780', background: '#fff' }}
                onClick={async () => {
                  // Re-parse same file with different sheet — fileName stored in wizard
                  // Note: we need the original file reference; store it on first parse
                  const reparsed = await parseFile(wizard.parsedFile!._file as File, name);
                  const colMapping = detectColumnMapping(reparsed.columns, wizard.protocol) as Partial<ColumnMapping>;
                  setWizard(w => ({ ...w, parsedFile: reparsed, columnMapping: colMapping }));
                }}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mapping table */}
      <div className="bg-white rounded-xl border mb-4" style={{ borderColor: '#D3D1C7' }}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid #F1EFE8' }}>
              <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: '#888780', width: 160 }}>Field</th>
              <th className="text-left px-4 py-2 text-xs font-semibold" style={{ color: '#888780' }}>Source column (click to select)</th>
            </tr>
          </thead>
          <tbody>
            {targetFields.map(({ field, label, required }) => (
              <tr key={field} style={{ borderBottom: '1px solid #F1EFE8' }}>
                <td className="px-4 py-2 font-medium text-sm" style={{ color: '#2C2C2A' }}>
                  {label} {required && <span style={{ color: '#E24B4A' }}>*</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.columns.map(col => {
                      const isSelected = wizard.columnMapping[field] === col;
                      return (
                        <button key={col}
                          onClick={() => assignColumn(field, isSelected ? null : col)}
                          className="text-xs px-2 py-1 rounded border font-mono"
                          style={isSelected
                            ? { borderColor: '#1D9E75', background: '#E1F5EE', color: '#085041', fontWeight: 700 }
                            : { borderColor: '#D3D1C7', color: '#888780', background: '#fff' }}>
                          {isSelected ? `${col} ✓` : col}
                        </button>
                      );
                    })}
                    {!required && (
                      <button
                        onClick={() => assignColumn(field, null)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: '#D3D1C7', color: '#aaa', fontStyle: 'italic' }}>
                        skip
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assembly name + navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium" style={{ color: '#2C2C2A' }}>Assembly name:</label>
          <input
            className={inputCls}
            style={{ ...inputStyle, width: 240 }}
            value={wizard.assemblyName}
            onChange={e => setWizard(w => ({ ...w, assemblyName: e.target.value }))}
            placeholder="e.g. Condair DL Humidifier"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setWizard(w => ({ ...w, step: 1 }))}
            className="px-4 py-2 text-sm rounded border" style={{ borderColor: '#D3D1C7', color: '#888780' }}>
            ← Back
          </button>
          <button onClick={goToPreview} disabled={!canProceed()}
            className="px-5 py-2 text-sm font-medium rounded text-white"
            style={{ background: canProceed() ? '#1D9E75' : '#aaa', cursor: canProceed() ? 'pointer' : 'not-allowed' }}>
            Preview {parsed.rows.length} points →
          </button>
        </div>
      </div>
    </div>
  );
}
```

Also update `ParsedFile` in `supplierImport.ts` — we need to store the original `File` reference for sheet switching. Add `_file?: File` to the interface and store it in `parseFile`:

In `src/lib/supplierImport.ts`, update the `ParsedFile` interface:
```typescript
export interface ParsedFile {
  sheetNames: string[];
  activeSheet: string;
  rows: RawRow[];
  columns: string[];
  _file?: File;  // stored for sheet re-parsing
}
```

And update `parseFile` to store it:
```typescript
export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  // ... existing code ...
  return { sheetNames, activeSheet, rows: rawRows, columns, _file: file };
}
```

- [ ] **Step 2: Verify dev server — step 2 appears after file drop**

```bash
npm run dev
```

Drop a CSV file → Step 2 should show column pills. Modbus/BACnet toggle should swap the field list.

- [ ] **Step 3: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/components/SupplierImportTab.tsx src/lib/supplierImport.ts
git commit -m "feat: SupplierImportTab Step 2 - column mapping UI"
```

---

## Task 7: SupplierImportTab — Step 3, Preview & Save

**Files:**
- Modify: `src/components/SupplierImportTab.tsx`

- [ ] **Step 1: Replace `Step3Preview` placeholder with full implementation**

Replace the `Step3Preview` function in `src/components/SupplierImportTab.tsx`:

```typescript
function Step3Preview({
  wizard, setWizard, onSaved,
}: {
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
  onSaved: () => void;
}) {
  // Build result on first render of step 3
  const result = (() => {
    if (wizard.importResult) return wizard.importResult;
    const r = buildSimPoints(
      wizard.parsedFile!.rows,
      wizard.columnMapping as ColumnMapping,
      wizard.protocol,
    );
    // Store result so we don't rebuild on re-render
    setWizard(w => ({ ...w, importResult: r }));
    return r;
  })();

  function saveAssembly() {
    const assembly: DeviceAssembly = {
      id: uuidv4(),
      name: wizard.assemblyName.trim() || 'Imported Assembly',
      description: '',
      protocol: wizard.protocol,
      savedAt: new Date().toISOString(),
      points: result.points,
      addressBase: wizard.addressBase,
      sourceFile: wizard.fileName,
    };
    addAssembly(assembly);
    setWizard({ ...INITIAL_STATE });  // reset wizard for next import
    onSaved();
  }

  const visiblePoints = result.points.slice(0, 50); // show first 50 in preview

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#2C2C2A' }}>Preview & Save</h2>
          <p className="text-sm mt-0.5" style={{ color: '#888780' }}>
            {result.points.length} points imported
            {result.skippedCount > 0 && ` · ${result.skippedCount} rows skipped`}
            {result.invalidIndices.length > 0 && (
              <span style={{ color: '#E24B4A' }}> · {result.invalidIndices.length} invalid</span>
            )}
          </p>
        </div>

        {/* Address base toggle */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs font-semibold block" style={{ color: '#2C2C2A' }}>Address base</span>
            <span className="text-xs" style={{ color: '#888780' }}>
              {wizard.addressBase === 0 ? 'exported as-is' : 'exported − 1'}
            </span>
          </div>
          <div className="flex border rounded overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
            <button
              className="px-4 py-1.5 text-sm font-bold"
              style={wizard.addressBase === 0
                ? { background: '#1D9E75', color: '#fff' }
                : { background: '#fff', color: '#888780' }}
              onClick={() => setWizard(w => ({ ...w, addressBase: 0 }))}>
              0
            </button>
            <button
              className="px-4 py-1.5 text-sm font-bold border-l"
              style={{
                ...(wizard.addressBase === 1
                  ? { background: '#D4871A', color: '#fff' }
                  : { background: '#fff', color: '#888780' }),
                borderColor: '#D3D1C7',
              }}
              onClick={() => setWizard(w => ({ ...w, addressBase: 1 }))}>
              1
            </button>
          </div>
        </div>
      </div>

      {/* Points preview table */}
      <div className="bg-white rounded-xl border mb-4 overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: '#F9F8F4', borderBottom: '1px solid #E8E6DE' }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Tag</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Description</th>
                {wizard.protocol === 'modbus' ? (
                  <>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Register</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>FC</th>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Type</th>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Scale</th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Object Type</th>
                    <th className="text-right px-3 py-2 font-semibold" style={{ color: '#888780' }}>Instance</th>
                  </>
                )}
                <th className="text-left px-3 py-2 font-semibold" style={{ color: '#888780' }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((p, i) => {
                const isInvalid = result.invalidIndices.includes(i);
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid #F1EFE8',
                    background: isInvalid ? '#FEF2F2' : undefined,
                  }}>
                    <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: '#2C2C2A' }}>{p.tag}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate" style={{ color: '#555' }}
                      title={p.description}>{p.description}</td>
                    {wizard.protocol === 'modbus' ? (
                      <>
                        <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: '#1D9E75' }}>
                          {p.register}
                        </td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>FC{p.function_code}</td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>{p.data_type}</td>
                        <td className="px-3 py-1.5 text-right font-mono" style={{ color: '#555' }}>{p.scale}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 font-mono" style={{ color: '#555' }}>{p.object_type}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: '#1D9E75' }}>
                          {p.object_instance}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-1.5" style={{ color: '#555' }}>{p.units}</td>
                  </tr>
                );
              })}
              {result.points.length > 50 && (
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-center text-xs" style={{ color: '#aaa' }}>
                    … {result.points.length - 50} more points (all will be saved)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWizard(w => ({ ...w, step: 2, importResult: null }))}
          className="px-4 py-2 text-sm rounded border" style={{ borderColor: '#D3D1C7', color: '#888780' }}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: '#888780' }}>
            Saving as: <strong style={{ color: '#2C2C2A' }}>{wizard.assemblyName}</strong>
          </span>
          <button onClick={saveAssembly}
            className="px-6 py-2 text-sm font-semibold rounded text-white"
            style={{ background: '#1D9E75' }}>
            Save Assembly →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify full wizard flow in dev server**

```bash
npm run dev
```

Walk through the full flow:
1. Drop a CSV file → Step 1 parses and advances
2. Map columns → Step 2 shows pills, check protocol toggle
3. Click "Preview" → Step 3 shows points table with address base toggle
4. Toggle 0↔1 → label changes between "exported as-is" and "exported − 1"
5. Click "Save Assembly" → wizard resets, app navigates to Device Setup tab
6. In Device Setup → Assembly Library should show the new assembly

- [ ] **Step 3: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/components/SupplierImportTab.tsx
git commit -m "feat: SupplierImportTab Step 3 - preview table + address base toggle + save"
```

---

## Task 8: addressBase toggle in PointMappingTab

**Files:**
- Modify: `src/components/PointMappingTab.tsx`

- [ ] **Step 1: Read PointMappingTab.tsx to find the device header area**

Read `src/components/PointMappingTab.tsx` and locate the per-device header section (where the device name and protocol badge are shown above the points table).

- [ ] **Step 2: Add addressBase toggle to the device header in PointMappingTab**

In the device selector / header area of `PointMappingTab.tsx`, add the toggle after the device name. Find the section where `device` is the selected device and add:

```typescript
{/* Address base toggle — shown when device has imported points */}
<div className="flex items-center gap-2 ml-auto">
  <span className="text-xs font-medium" style={{ color: '#888780' }}>Address base:</span>
  <div className="flex border rounded overflow-hidden text-xs" style={{ borderColor: '#D3D1C7' }}>
    <button
      className="px-3 py-1 font-bold"
      style={(device.addressBase ?? 0) === 0
        ? { background: '#1D9E75', color: '#fff' }
        : { background: '#fff', color: '#888780' }}
      onClick={() => patchDevice(device.id, { addressBase: 0 })}>
      0
    </button>
    <button
      className="px-3 py-1 font-bold border-l"
      style={{
        ...((device.addressBase ?? 0) === 1
          ? { background: '#D4871A', color: '#fff' }
          : { background: '#fff', color: '#888780' }),
        borderColor: '#D3D1C7',
      }}
      onClick={() => patchDevice(device.id, { addressBase: 1 })}>
      1
    </button>
  </div>
  <span className="text-xs" style={{ color: '#888780' }}>
    {(device.addressBase ?? 0) === 0 ? 'exported as-is' : 'exported −1'}
  </span>
</div>
```

Note: `patchDevice` is already defined in `PointMappingTab.tsx` and calls `onUpdate`. The `addressBase` field now exists on `SimDevice` from Task 1.

Also update `DeviceSetupTab.tsx` — when loading an assembly into a device (`loadFromAssembly`), transfer the `addressBase`:

In `src/components/DeviceSetupTab.tsx`, update `loadFromAssembly`:
```typescript
function loadFromAssembly(device: SimDevice, assembly: DeviceAssembly) {
  if (!window.confirm(`Load "${assembly.name}" into "${device.name}"? This replaces all current points.`)) return;
  patchDevice(device.id, {
    points: assembly.points.map(p => ({ ...p })),
    addressBase: assembly.addressBase ?? 0,   // ADD THIS LINE
  });
  setShowLibrary(false);
}
```

- [ ] **Step 3: Verify toggle appears in PointMappingTab**

```bash
npm run dev
```

1. Import a supplier file (Task 7) and save assembly
2. Go to Device Setup → load assembly into a device
3. Go to Map Points → verify address base toggle is visible in device header
4. Toggle 0↔1 → label changes

- [ ] **Step 4: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/components/PointMappingTab.tsx src/components/DeviceSetupTab.tsx
git commit -m "feat: addressBase toggle in PointMappingTab, transfer from assembly on load"
```

---

## Task 9: Apply addressBase correction in generators

**Files:**
- Modify: `src/generators/configGenerator.ts`
- Modify: `src/generators/thingsBoardExporter.ts`

- [ ] **Step 1: Add helper and update configGenerator.ts**

Replace the entire content of `src/generators/configGenerator.ts`:

```typescript
import type { SimDevice } from '../types';

/** Apply address base correction: if device is 1-based, subtract 1 at export */
function resolveAddress(address: number, addressBase: 0 | 1 | undefined): number {
  return addressBase === 1 ? address - 1 : address;
}

export function generateDeviceConfig(device: SimDevice): string {
  const base = device.addressBase ?? 0;

  const points = device.points.map(p => {
    const pointBase: Record<string, unknown> = {
      tag: p.tag,
      description: p.description,
      io_type: p.io_type,
      base_value_raw: Math.round(p.base_value * p.scale),
      noise_pct: p.noise_pct,
    };

    if (device.protocol === 'modbus') {
      Object.assign(pointBase, {
        function_code: p.function_code,
        register: resolveAddress(p.register, base),
        data_type: p.data_type,
        scale: p.scale,
        object_count: p.object_count,
      });
    } else {
      Object.assign(pointBase, {
        object_type: p.object_type,
        object_instance: resolveAddress(p.object_instance, base),
        units: p.units,
        cov_increment: p.cov_increment,
      });
    }

    return pointBase;
  });

  const config: Record<string, unknown> = {
    device_name: device.name,
    protocol: device.protocol,
    update_interval_seconds: 5,
    points,
  };

  if (device.protocol === 'modbus') {
    Object.assign(config, {
      unit_id: device.unit_id,
      byte_order: device.byte_order,
      word_order: device.word_order,
    });
  } else {
    Object.assign(config, {
      device_instance: device.device_instance,
      device_name_bacnet: device.device_name,
      vendor_id: device.vendor_id,
    });
  }

  return JSON.stringify(config, null, 2);
}
```

- [ ] **Step 2: Update thingsBoardExporter.ts**

Replace the entire content of `src/generators/thingsBoardExporter.ts`:

```typescript
import type { SimDevice } from '../types';

interface TBModbusPoint {
  tag: string;
  functionCode: number;
  address: number;
  objectsCount: number;
  type: string;
  multiplier?: number;
  pointType: 'timeseries' | 'attributes';
}

interface TBBACnetPoint {
  tag: string;
  objectType: string;
  instance: number;
  propertyId: string;
  type: string;
  pointType: 'timeseries' | 'attributes';
}

function resolveAddress(address: number, addressBase: 0 | 1 | undefined): number {
  return addressBase === 1 ? address - 1 : address;
}

export function generateThingsBoardJson(devices: SimDevice[]): string {
  const modbus: unknown[] = [];
  const bacnet: unknown[] = [];

  for (const device of devices) {
    const base = device.addressBase ?? 0;

    if (device.protocol === 'modbus') {
      const timeseries: TBModbusPoint[] = device.points.map(p => ({
        tag: p.tag,
        functionCode: p.function_code,
        address: resolveAddress(p.register, base),
        objectsCount: p.object_count,
        type: p.data_type,
        ...(p.scale !== 1 ? { multiplier: 1 / p.scale } : {}),
        pointType: 'timeseries' as const,
      }));
      modbus.push({
        deviceName: device.name,
        host: device.ip_address,
        port: device.modbus_port,
        unitId: device.unit_id,
        byteOrder: device.byte_order === 'big' ? 'BIG' : 'LITTLE',
        wordOrder: device.word_order === 'big' ? 'BIG' : 'LITTLE',
        timeseries,
      });
    } else {
      const timeseries: TBBACnetPoint[] = device.points.map(p => ({
        tag: p.tag,
        objectType: p.object_type,
        instance: resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
        type: p.object_type.startsWith('binary') ? 'boolean' : 'float',
        pointType: 'timeseries' as const,
      }));
      bacnet.push({
        deviceName: device.name,
        host: device.ip_address,
        port: device.bacnet_port,
        deviceInstance: device.device_instance,
        timeseries,
      });
    }
  }

  return JSON.stringify({ modbus, bacnet }, null, 2);
}
```

- [ ] **Step 3: Run full build to verify no type errors**

```bash
cd /c/Dev/bms-sim-companion
npm run build 2>&1 | tail -5
```

Expected: build succeeds, zero errors.

- [ ] **Step 4: Run all tests**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Dev/bms-sim-companion
git add src/generators/configGenerator.ts src/generators/thingsBoardExporter.ts
git commit -m "feat: apply addressBase correction in configGenerator + thingsBoardExporter"
```

---

## Task 10: End-to-end smoke test + push

**Files:** none (verification only)

- [ ] **Step 1: Run dev server and walk through full end-to-end flow**

```bash
cd /c/Dev/bms-sim-companion
npm run dev
```

Test with `Condair_Modbus_Points.csv`:
1. Click "⊕ Supplier Import"
2. Drop CSV file → Step 2 opens, protocol = modbus auto-detected
3. Confirm `Name` → pointName, `Address_0based` → Register, `Function_Code` → FC, `Data_Type` → Data Type, `Units` → Units
4. Assembly name: "Condair DL Humidifier"
5. Click Preview → Step 3 shows 203 points
6. Toggle base 0↔1 → label changes
7. Save → navigates to Device Setup
8. Device Setup → Assembly Library shows "Condair DL Humidifier (203 pts)"
9. Add a device → Load assembly → points populated
10. Go to Map Points → address base toggle visible
11. Go to Generate → download ZIP
12. Verify `config.json` inside ZIP has `register: 0` (not 1) when base=0

Test with `Condair_BACnet_Points.xlsx`:
1. Drop XLSX → sheet selector appears (4 sheets: Condair DL, Condair ME, etc.)
2. Select "Condair DL" → columns detected
3. Map Object Type, Instance, Name, Units columns
4. Protocol = bacnet auto-detected
5. Preview → points show object_type + object_instance

- [ ] **Step 2: Run final test suite**

```bash
cd /c/Dev/bms-sim-companion
npx vitest run
```

Expected: all tests pass (columnDetector + supplierImport).

- [ ] **Step 3: Final commit and push**

```bash
cd /c/Dev/bms-sim-companion
git add -A
git push origin master
```

---

## Self-Review Checklist

| Spec requirement | Task |
|---|---|
| CSV and XLSX import | Task 4 (parseFile with SheetJS) |
| Multi-sheet XLSX sheet selector | Task 6 (Step2MapColumns sheet buttons) |
| Modbus and BACnet protocols | Tasks 3, 6, 7 |
| Auto column detection with manual override | Task 2 (columnDetector), Task 6 (pills) |
| Address base 0/1 toggle — export correction only | Task 7 (Step3), Task 9 (generators) |
| Data type normalisation (all 5 supplier formats) | Task 3 (normaliseDataType) |
| 32-bit register pair merging (_HI/_LW) | Task 3 (isLowWordRow + buildSimPoints) |
| Combined address notation (1032/33) | Task 3 (parseAddress) |
| DEV and unsupported object type skipping | Task 3 (buildSimPoints BACnet branch) |
| Invalid row flagging | Task 3 (invalidIndices), Task 7 (red highlight) |
| Save to Assembly Library with sourceFile + addressBase | Task 7 (saveAssembly) |
| Navigate to Device Setup after save | Task 5 (onSaved prop), App.tsx wiring |
| addressBase transfers when loading assembly into device | Task 8 (loadFromAssembly) |
| addressBase toggle in Map Points tab | Task 8 |
| addressBase correction in configGenerator | Task 9 |
| addressBase correction in thingsBoardExporter | Task 9 |
