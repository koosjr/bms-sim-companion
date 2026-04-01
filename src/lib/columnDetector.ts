// src/lib/columnDetector.ts

export type DetectedProtocol = 'modbus' | 'bacnet' | 'unknown';

export type TargetField =
  | 'pointName' | 'address' | 'functionCode' | 'dataType'
  | 'scaleFactor' | 'multiplier' | 'units' | 'objectType' | 'access';

// Patterns that indicate each protocol (checked against column names, case-insensitive)
const MODBUS_HINTS = ['register', 'function_code', 'function code', 'modbus'];
const BACNET_HINTS = ['object', 'instance', 'bacnet'];

// Field patterns: [targetField, patterns[], modbusOnly?, bacnetOnly?]
type FieldRule = [TargetField, string[], boolean, boolean];
const FIELD_RULES: FieldRule[] = [
  ['pointName',    ['name', 'description', 'object name', 'parameter_name', 'parameter'], false, false],
  ['address',      ['register', 'address', 'instance', 'object_id', 'offset', 'addr'],    false, false],
  ['functionCode', ['fc', 'function_code', 'function code'],                               true,  false],
  ['dataType',     ['data_type', 'data type', 'format'],                                   true,  false],
  ['scaleFactor',  ['scale', 'scale_factor', 'factor'],                                     false, false],
  ['multiplier',   ['multiplier', 'cov', 'cov_inc', 'cov_increment', 'cov increment'],      false, false],
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

/**
 * Map column names to target fields for the given protocol.
 * Precondition: protocol must be 'modbus' or 'bacnet' (not 'unknown').
 * Callers should narrow the result of detectProtocol() before passing it here:
 *   const proto = detectProtocol(cols);
 *   if (proto === 'unknown') { request user input }
 *   else { detectColumnMapping(cols, proto); }
 */
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
