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
