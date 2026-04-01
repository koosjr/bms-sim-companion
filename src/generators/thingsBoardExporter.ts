import type { SimDevice, SimPoint, TBReportStrategy } from '../types';
import { inferReportStrategy } from '../lib/pointDefaults';

// ── helpers ──────────────────────────────────────────────────────────────────

function resolveAddress(address: number, addressBase: 0 | 1 | undefined): number {
  return addressBase === 1 ? address - 1 : address;
}

/** Effective report strategy: explicit override, or auto-inferred from point properties. */
function effectiveStrategy(p: SimPoint): TBReportStrategy {
  if (p.report_strategy) return p.report_strategy;
  return inferReportStrategy(p.tag, p.object_type, p.io_type);
}

function strategyObj(strategy: TBReportStrategy, periodMs: number) {
  return strategy === 'ON_VALUE_CHANGE'
    ? { type: 'ON_VALUE_CHANGE' }
    : { type: 'ON_REPORT_PERIOD', reportPeriod: periodMs };
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
      const defaultPeriodMs = 60000;

      const byCategory = groupByCategory(d.points);

      const timeseries = byCategory.timeseries.map(p => ({
        tag:          p.tag,
        type:         p.data_type,
        address:      resolveAddress(p.register, base),
        objectsCount: p.object_count,
        functionCode: p.function_code,
        ...(p.scale !== 1 ? { multiplier: 1 / p.scale } : {}),
        reportStrategy: strategyObj(effectiveStrategy(p), defaultPeriodMs),
      }));

      const attributes = byCategory.attribute.map(p => ({
        tag:          p.tag,
        type:         p.data_type,
        address:      resolveAddress(p.register, base),
        objectsCount: p.object_count,
        functionCode: p.function_code,
        ...(p.scale !== 1 ? { multiplier: 1 / p.scale } : {}),
      }));

      const attributeUpdates = byCategory.attribute_update.map(p => ({
        tag:          p.tag,
        type:         p.data_type,
        address:      resolveAddress(p.register, base),
        objectsCount: p.object_count,
        functionCode: p.function_code,
        ...(p.scale !== 1 ? { multiplier: 1 / p.scale } : {}),
      }));

      const rpc = byCategory.rpc.map(p => ({
        tag:          p.tag,
        type:         p.data_type,
        address:      resolveAddress(p.register, base),
        objectsCount: p.object_count,
        functionCode: p.function_code,
      }));

      return {
        host:     d.ip_address,
        port:     d.modbus_port,
        method:   'socket',
        unitId:   d.unit_id,
        deviceName: d.name,
        deviceType: d.profile_name || d.name,
        timeout:  35,
        byteOrder:  d.byte_order === 'big' ? 'BIG' : 'LITTLE',
        wordOrder:  d.word_order === 'big' ? 'BIG' : 'LITTLE',
        retries:          true,
        retryOnEmpty:     true,
        retryOnInvalid:   true,
        pollPeriod:            10000,
        connectAttemptTimeMs:  5000,
        connectAttemptCount:   5,
        waitAfterFailedAttemptsMs: 300000,
        security: { certfile: '', keyfile: '', password: '', server_hostname: '0.0.0.0' },
        reportStrategy: strategyObj('ON_REPORT_PERIOD', defaultPeriodMs),
        type: 'tcp',
        attributes,
        timeseries,
        attributeUpdates,
        rpc,
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
      const defaultPeriodMs = 10000;

      const byCategory = groupByCategory(d.points);

      const timeseries = byCategory.timeseries.map(p => ({
        key:        p.tag,
        objectType: p.object_type,
        objectId:   resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
        reportStrategy: strategyObj(effectiveStrategy(p), defaultPeriodMs),
      }));

      const attributes = byCategory.attribute.map(p => ({
        key:        p.tag,
        objectType: p.object_type,
        objectId:   resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
      }));

      const attributeUpdates = byCategory.attribute_update.map(p => ({
        key:        p.tag,
        objectType: p.object_type,
        objectId:   resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
      }));

      const serverSideRpc = byCategory.rpc.map(p => ({
        key:        p.tag,
        objectType: p.object_type,
        objectId:   resolveAddress(p.object_instance, base),
        propertyId: 'presentValue',
      }));

      return {
        altResponsesAddresses: [],
        reportStrategy: strategyObj('ON_REPORT_PERIOD', defaultPeriodMs),
        host: d.ip_address,
        port: d.bacnet_port,
        deviceInfo: {
          deviceNameExpression:          '${objectName}',
          deviceNameExpressionSource:    'expression',
          deviceProfileExpressionSource: 'constant',
          deviceProfileExpression:       d.profile_name || d.name,
        },
        pollPeriod:       20000,
        timeseries,
        attributes,
        attributeUpdates,
        serverSideRpc,
      };
    });

  return JSON.stringify(tbDevices, null, 2);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByCategory(points: SimPoint[]) {
  const result = {
    timeseries:       [] as SimPoint[],
    attribute:        [] as SimPoint[],
    attribute_update: [] as SimPoint[],
    rpc:              [] as SimPoint[],
  };
  for (const p of points) {
    const cat = p.data_category ?? 'timeseries';
    result[cat].push(p);
  }
  return result;
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
