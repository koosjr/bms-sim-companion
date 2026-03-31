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
