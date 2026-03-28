import type { SimDevice } from '../types';

export function generateDeviceConfig(device: SimDevice): string {
  const points = device.points.map(p => {
    const base: Record<string, unknown> = {
      tag: p.tag,
      description: p.description,
      io_type: p.io_type,
      base_value_raw: Math.round(p.base_value * p.scale),
      noise_pct: p.noise_pct,
    };

    if (device.protocol === 'modbus') {
      Object.assign(base, {
        function_code: p.function_code,
        register: p.register,
        data_type: p.data_type,
        scale: p.scale,
        object_count: p.object_count,
      });
    } else {
      Object.assign(base, {
        object_type: p.object_type,
        object_instance: p.object_instance,
        units: p.units,
        cov_increment: p.cov_increment,
      });
    }

    return base;
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
