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
    update_interval_seconds: 10,
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
