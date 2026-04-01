// src/lib/pointDefaults.ts
// Auto-inference helpers for ThingsBoard metadata on SimPoints.

import type { BACnetObjectType, BACnetUnits, DataCategory, IOType, TBReportStrategy } from '../types';

// ── Report strategy inference ─────────────────────────────────────────────────

const CHANGE_KEYWORDS = ['setpoint', 'proportional', 'integral', 'band', 'time', 'hours'];

/**
 * Infer the ThingsBoard report strategy for a point.
 *
 * Rules (first match wins):
 *  1. BACnet binary/multi-state object types  → ON_VALUE_CHANGE
 *  2. IO types DI, DO, BV                     → ON_VALUE_CHANGE
 *  3. Tag contains any change keyword         → ON_VALUE_CHANGE
 *  4. Everything else                         → ON_REPORT_PERIOD
 */
export function inferReportStrategy(
  tag: string,
  objectType?: BACnetObjectType,
  ioType?: IOType,
): TBReportStrategy {
  // BACnet binary / multi-state
  if (
    objectType &&
    ['binaryInput', 'binaryOutput', 'binaryValue', 'multiStateValue'].includes(objectType)
  ) {
    return 'ON_VALUE_CHANGE';
  }
  // IO type
  if (ioType && ['DI', 'DO', 'BV'].includes(ioType)) {
    return 'ON_VALUE_CHANGE';
  }
  // Tag name keywords
  const lower = tag.toLowerCase();
  if (CHANGE_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'ON_VALUE_CHANGE';
  }
  return 'ON_REPORT_PERIOD';
}

// ── Units inference ───────────────────────────────────────────────────────────

/**
 * Suggest a BACnet engineering unit based on keywords in the tag name.
 * Returns null if no match — leave the existing unit unchanged.
 */
export function inferUnits(tag: string): BACnetUnits | null {
  const t = tag.toLowerCase();
  if (t.includes('tmp') || t.includes('temp'))        return 'degreesCelsius';
  if (t.includes('hum'))                              return 'percent';
  if (t.includes('vlv') || t.includes('dmp'))         return 'percentOpen';
  if (t.includes('dpr'))                              return 'pascals';
  if (t.includes('prs'))                              return 'kilopascals';
  if (t.includes('co2'))                              return 'partsPerMillion';
  return null;
}

// ── Data category default ─────────────────────────────────────────────────────

/**
 * Default data category for a new point — always timeseries.
 * Users change it to attribute/rpc/etc. manually via the UI.
 */
export function inferDataCategory(_tag: string): DataCategory {
  return 'timeseries';
}
