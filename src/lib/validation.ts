import type { SimDevice } from '../types';

export type IssueType = 'duplicate_tag' | 'duplicate_bacnet_instance' | 'duplicate_modbus_register';

export interface ValidationIssue {
  type: IssueType;
  key: string;    // what's duplicated: tag name, "objectType:instance", or "FC:register"
  tags: string[]; // which point tags are affected
}

export interface DeviceValidation {
  deviceId: string;
  deviceName: string;
  issues: ValidationIssue[];
}

export function validateDevice(device: SimDevice): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── Duplicate tag names (crashes bacpypes3 "already an object with name") ──
  const byTag: Record<string, number> = {};
  for (const p of device.points) {
    byTag[p.tag] = (byTag[p.tag] ?? 0) + 1;
  }
  for (const [tag, count] of Object.entries(byTag)) {
    if (count > 1) {
      issues.push({ type: 'duplicate_tag', key: tag, tags: [tag] });
    }
  }

  // ── BACnet: duplicate (object_type, object_instance) ─────────────────────
  if (device.protocol === 'bacnet') {
    const byInstance: Record<string, string[]> = {};
    for (const p of device.points) {
      const key = `${p.object_type}:${p.object_instance}`;
      byInstance[key] = byInstance[key] ?? [];
      byInstance[key].push(p.tag);
    }
    for (const [key, tags] of Object.entries(byInstance)) {
      if (tags.length > 1) {
        issues.push({ type: 'duplicate_bacnet_instance', key, tags });
      }
    }
  }

  // ── Modbus: duplicate register address (warning only) ────────────────────
  if (device.protocol === 'modbus') {
    const byRegister: Record<string, string[]> = {};
    for (const p of device.points) {
      const key = `FC${p.function_code}:${p.register}`;
      byRegister[key] = byRegister[key] ?? [];
      byRegister[key].push(p.tag);
    }
    for (const [key, tags] of Object.entries(byRegister)) {
      if (tags.length > 1) {
        issues.push({ type: 'duplicate_modbus_register', key, tags });
      }
    }
  }

  return issues;
}

/** Validate all devices and return only those with issues. */
export function validateAllDevices(devices: SimDevice[]): DeviceValidation[] {
  return devices
    .map(d => ({ deviceId: d.id, deviceName: d.name, issues: validateDevice(d) }))
    .filter(r => r.issues.length > 0);
}

/** Returns a flat set of tag names that are involved in any issue for a device. */
export function affectedTags(issues: ValidationIssue[]): Set<string> {
  const s = new Set<string>();
  for (const issue of issues) {
    for (const tag of issue.tags) s.add(tag);
  }
  return s;
}

/** Returns a set of "objectType:instance" keys with duplicates (BACnet). */
export function duplicateInstanceKeys(issues: ValidationIssue[]): Set<string> {
  const s = new Set<string>();
  for (const issue of issues) {
    if (issue.type === 'duplicate_bacnet_instance') s.add(issue.key);
  }
  return s;
}

/** Returns a set of "FC:register" keys with duplicates (Modbus). */
export function duplicateRegisterKeys(issues: ValidationIssue[]): Set<string> {
  const s = new Set<string>();
  for (const issue of issues) {
    if (issue.type === 'duplicate_modbus_register') s.add(issue.key);
  }
  return s;
}

/** True if there are any critical issues (tag or BACnet instance dupes) that will crash the simulator. */
export function hasCriticalIssues(issues: ValidationIssue[]): boolean {
  return issues.some(i => i.type === 'duplicate_tag' || i.type === 'duplicate_bacnet_instance');
}
