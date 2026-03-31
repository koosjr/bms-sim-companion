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
    const result = detectColumnMapping(['Register_Number_1based', 'Address_0based', 'Name'], 'modbus');
    expect(['Register_Number_1based', 'Address_0based']).toContain(result.address);
  });
});
