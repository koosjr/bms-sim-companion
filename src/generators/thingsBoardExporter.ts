import type { SimDevice } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function resolveAddress(address: number, addressBase: 0 | 1 | undefined): number {
  return addressBase === 1 ? address - 1 : address;
}

// ── Modbus ────────────────────────────────────────────────────────────────────

/**
 * Returns the `slaves` array for a ThingsBoard Modbus TCP connector.
 * Paste into: { "master": { "slaves": <here> }, "name": "…", … }
 */
export function generateTBModbusSlaves(devices: SimDevice[]): string {
  const slaves = devices
    .filter(d => d.protocol === 'modbus')
    .map(d => {
      const base = d.addressBase ?? 0;

      const timeseries = d.points.map(p => ({
        tag:          p.tag,
        type:         p.data_type,
        address:      resolveAddress(p.register, base),
        objectsCount: p.object_count,
        functionCode: p.function_code,
        ...(p.scale !== 1 ? { multiplier: 1 / p.scale } : {}),
      }));

      return {
        host:     d.ip_address,
        port:     d.modbus_port,
        method:   'socket',
        unitId:   d.unit_id,
        deviceName: d.name,
        deviceType: d.description || '',
        timeout:  35,
        byteOrder:  d.byte_order === 'big' ? 'BIG' : 'LITTLE',
        wordOrder:  d.word_order === 'big' ? 'BIG' : 'LITTLE',
        retries:          true,
        retryOnEmpty:     true,
        retryOnInvalid:   true,
        pollPeriod:            5000,
        connectAttemptTimeMs:  5000,
        connectAttemptCount:   5,
        waitAfterFailedAttemptsMs: 300000,
        security: { certfile: '', keyfile: '', password: '', server_hostname: '0.0.0.0' },
        reportStrategy: { type: 'ON_REPORT_PERIOD', reportPeriod: 30000 },
        type: 'tcp',
        attributes:       [],
        timeseries,
        attributeUpdates: [],
        rpc:              [],
      };
    });

  return JSON.stringify(slaves, null, 2);
}

// ── BACnet ────────────────────────────────────────────────────────────────────

/**
 * Returns the `devices` array for a ThingsBoard BACnet/IP connector.
 * Paste into: { "application": { … }, "devices": <here>, "name": "…", … }
 */
export function generateTBBacnetDevices(devices: SimDevice[]): string {
  const tbDevices = devices
    .filter(d => d.protocol === 'bacnet')
    .map(d => {
      const base = d.addressBase ?? 0;

      const timeseries = d.points.map(p => ({
        key:        p.tag,
        objectType: p.object_type,
        objectId:   resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
      }));

      return {
        altResponsesAddresses: [],
        reportStrategy: { type: 'ON_REPORT_PERIOD', reportPeriod: 5000 },
        host: d.ip_address,
        port: d.bacnet_port,
        deviceInfo: {
          deviceNameExpression:          '${objectName}',
          deviceNameExpressionSource:    'expression',
          deviceProfileExpressionSource: 'constant',
          deviceProfileExpression:       d.name,
        },
        pollPeriod:       10000,
        timeseries,
        attributes:       [],
        attributeUpdates: [],
        serverSideRpc:    [],
      };
    });

  return JSON.stringify(tbDevices, null, 2);
}

// ── Legacy (kept for any existing callers) ────────────────────────────────────

/** @deprecated Use generateTBModbusSlaves / generateTBBacnetDevices instead. */
export function generateThingsBoardJson(devices: SimDevice[]): string {
  return JSON.stringify(
    {
      modbus: JSON.parse(generateTBModbusSlaves(devices)),
      bacnet: JSON.parse(generateTBBacnetDevices(devices)),
    },
    null,
    2,
  );
}
