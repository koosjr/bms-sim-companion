// src/components/PointMappingTab.tsx
import { useState, useMemo } from 'react';
import type {
  AppState, SimDevice, SimPoint,
  ModbusFunctionCode, ModbusDataType, BACnetObjectType, BACnetUnits,
  IOType, DataCategory, TBReportStrategy,
} from '../types';
import { validateDevice, affectedTags, duplicateInstanceKeys, duplicateRegisterKeys, hasCriticalIssues } from '../lib/validation';
import { inferUnits, inferDataCategory, inferReportStrategy } from '../lib/pointDefaults';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
  onNext: () => void;
  onExport?: () => void;
}

const inputCls = "border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const inputStyle = { borderColor: '#D3D1C7' };

const IO_ORDER = ['AI', 'AO', 'DI', 'DO', 'AV', 'BV'];

const IO_COLORS: Record<string, { bg: string; text: string }> = {
  AI: { bg: '#E1F5EE', text: '#085041' },
  AO: { bg: '#FAEEDA', text: '#854F0B' },
  DI: { bg: '#FCEBEB', text: '#A32D2D' },
  DO: { bg: '#2C2C2A', text: '#F1EFE8' },
  AV: { bg: '#E8EFF8', text: '#1a3a6b' },
  BV: { bg: '#F3EBF8', text: '#5a1a7a' },
};

const DEFAULT_FC: Record<string, number> = { AI: 4, AO: 3, DI: 3, DO: 3, AV: 3, BV: 3 };
const DEFAULT_DTYPE: Record<string, ModbusDataType> = {
  AI: '16int', AO: '16int', DI: '16uint', DO: '16uint', AV: '16int', BV: '16uint',
};

const BACNET_UNITS_LIST: { value: BACnetUnits; label: string }[] = [
  { value: 'degreesCelsius',            label: '°C'      },
  { value: 'percent',                   label: '%'       },
  { value: 'kilopascals',               label: 'kPa'     },
  { value: 'pascals',                   label: 'Pa'      },
  { value: 'bars',                      label: 'Bar'     },
  { value: 'poundsForcePerSquareInch',  label: 'psi'     },
  { value: 'volts',                     label: 'V'       },
  { value: 'amperes',                   label: 'A'       },
  { value: 'kilovoltAmperes',           label: 'kVA'     },
  { value: 'kilovoltAmperesReactive',   label: 'kVAr'    },
  { value: 'kilowatts',                 label: 'kW'      },
  { value: 'watts',                     label: 'W'       },
  { value: 'percentOpen',               label: '% Open'  },
  { value: 'percentClose',              label: '% Close' },
  { value: 'kilogramsPerHour',          label: 'kg/h'    },
  { value: 'litersPerHour',             label: 'l/h'     },
  { value: 'litersPerSecond',           label: 'l/s'     },
  { value: 'litersPerMinute',           label: 'l/min'   },
  { value: 'revolutionsPerMinute',      label: 'rpm'     },
  { value: 'partsPerMillion',           label: 'ppm'     },
  { value: 'noUnits',                   label: '—'       },
];

const CATEGORY_LABELS: Record<DataCategory, string> = {
  timeseries:       'TS',
  attribute:        'Attr',
  attribute_update: 'AUpd',
  rpc:              'RPC',
};

const PERIOD_UNIT_MS: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

function msToDisplayPeriod(ms: number): { val: string; unit: string } {
  if (ms >= 86400000 && ms % 86400000 === 0) return { val: String(ms / 86400000), unit: 'd' };
  if (ms >= 3600000  && ms % 3600000  === 0) return { val: String(ms / 3600000),  unit: 'h' };
  if (ms >= 60000    && ms % 60000    === 0) return { val: String(ms / 60000),    unit: 'm' };
  return { val: String(ms / 1000), unit: 's' };
}

function patchPointInDevice(device: SimDevice, pointIdx: number, patch: Partial<SimPoint>): SimDevice {
  return { ...device, points: device.points.map((p, i) => i === pointIdx ? { ...p, ...patch } : p) };
}

export default function PointMappingTab({ state, onUpdate, onNext, onExport }: Props) {
  const [activeDeviceId, setActiveDeviceId] = useState<string>(state.devices[0]?.id ?? '');
  const [fillStart, setFillStart] = useState<Record<string, string>>({});
  const [showAddPoint, setShowAddPoint] = useState(false);
  const [newPoint, setNewPoint] = useState({ tag: '', description: '', io_type: 'AI' as IOType });
  // Local display state for period inputs (tag → { val, unit })
  const [periodInputs, setPeriodInputs] = useState<Record<string, { val: string; unit: string }>>({});

  const { devices } = state;
  const device = devices.find(d => d.id === activeDeviceId) ?? devices[0];

  function patchPoint(pointIdx: number, patch: Partial<SimPoint>) {
    if (!device) return;
    const updated = patchPointInDevice(device, pointIdx, patch);
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  function deletePoint(pointIdx: number) {
    if (!device) return;
    const updated = { ...device, points: device.points.filter((_, i) => i !== pointIdx) };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  function patchAllInGroup(ioType: string, patch: Partial<SimPoint>) {
    if (!device) return;
    const updated = {
      ...device,
      points: device.points.map(p => p.io_type === ioType ? { ...p, ...patch } : p),
    };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  function autoFillRegisters(ioType: string) {
    if (!device) return;
    const start = parseInt(fillStart[ioType] ?? '');
    if (isNaN(start)) return;
    let reg = start;
    const updated = {
      ...device,
      points: device.points.map(p => {
        if (p.io_type !== ioType) return p;
        const r = reg;
        reg += p.data_type?.startsWith('32') ? 2 : 1;
        return { ...p, register: r };
      }),
    };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  function patchDevice(id: string, patch: Partial<SimDevice>) {
    onUpdate({ devices: devices.map(d => d.id === id ? { ...d, ...patch } : d) });
  }

  /** Auto-infer units for all BACnet points — overwrites any point where a keyword match is found */
  function autoInferUnits() {
    if (!device) return;
    const updated = {
      ...device,
      points: device.points.map(p => {
        const inferred = inferUnits(p.tag);
        return inferred ? { ...p, units: inferred } : p;
      }),
    };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  /** Clear all per-point report strategy overrides back to Default (null = connector default) */
  function applyAutoStrategy() {
    if (!device) return;
    const updated = {
      ...device,
      points: device.points.map(p => ({ ...p, report_strategy: null, report_period_ms: undefined })),
    };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
    setPeriodInputs({});
  }

  /** Auto-populate report strategy: sets Change on binary/multistate/keyword points, leaves others as Default */
  function autoInferStrategies() {
    if (!device) return;
    const updated = {
      ...device,
      points: device.points.map(p => {
        const inferred = inferReportStrategy(p.tag, p.object_type, p.io_type);
        return { ...p, report_strategy: inferred === 'ON_VALUE_CHANGE' ? 'ON_VALUE_CHANGE' as const : null };
      }),
    };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  function addPointManually() {
    if (!device || !newPoint.tag.trim()) return;
    const tag = newPoint.tag.trim().toUpperCase();
    const pt: SimPoint = {
      tag,
      description: newPoint.description.trim(),
      io_type: newPoint.io_type,
      function_code: 3, register: 0, data_type: '16uint', scale: 1, object_count: 1,
      object_type: 'analogInput', object_instance: 0,
      units: inferUnits(tag) ?? 'noUnits',
      cov_increment: 1,
      base_value: 0, noise_pct: 0,
      data_category: inferDataCategory(tag),
      report_strategy: null,
    };
    const updated = { ...device, points: [...device.points, pt] };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
    setNewPoint({ tag: '', description: '', io_type: 'AI' });
    setShowAddPoint(false);
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  const validationIssues = useMemo(() => device ? validateDevice(device) : [], [device]);
  const badTags      = useMemo(() => affectedTags(validationIssues), [validationIssues]);
  const badInstances = useMemo(() => duplicateInstanceKeys(validationIssues), [validationIssues]);
  const badRegisters = useMemo(() => duplicateRegisterKeys(validationIssues), [validationIssues]);
  const critical     = useMemo(() => hasCriticalIssues(validationIssues), [validationIssues]);

  if (!device) return (
    <div className="text-sm" style={{ color: '#888780' }}>No devices configured. Go back to Device Setup.</div>
  );

  // Track original index so patchPoint/deletePoint target the exact point even with duplicate tags
  const groups: Record<string, Array<{ point: SimPoint; origIdx: number }>> = {};
  for (const io of IO_ORDER) groups[io] = [];
  for (let i = 0; i < device.points.length; i++) {
    const p = device.points[i];
    const key = p.io_type in groups ? p.io_type : 'AI';
    groups[key].push({ point: p, origIdx: i });
  }

  return (
    <div className="max-w-6xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Point Mapping</h2>
      <p className="text-sm mb-1" style={{ color: '#888780' }}>
        Assign {device.protocol === 'modbus' ? 'Modbus register addresses' : 'BACnet object types and instances'} to each point.
        Set data category (TS/Attr/AUpd/RPC) and report strategy per point.
      </p>

      {device.protocol === 'modbus' && (
        <div className="text-xs mb-4 px-3 py-2 rounded border" style={{ borderColor: '#EF9F27', background: '#FAEEDA', color: '#854F0B' }}>
          <strong>Eliwell / most PLCs:</strong> DI and DO use FC3 (holding register, 16-bit word, value 0 or 1) — <em>not</em> FC1/FC2 coils.
          Use FC1/FC2 only if your controller explicitly uses coil addressing for binary points.
          32-bit values occupy 2 consecutive registers — word order is set per device in Device Setup.
        </div>
      )}

      {/* Device selector */}
      <div className="flex gap-2 flex-wrap mb-5">
        {devices.map(d => (
          <button key={d.id}
            onClick={() => setActiveDeviceId(d.id)}
            className="px-3 py-1.5 rounded text-sm font-medium border transition-colors"
            style={d.id === activeDeviceId
              ? { background: '#2C2C2A', color: '#fff', borderColor: '#2C2C2A' }
              : { borderColor: '#D3D1C7', color: '#2C2C2A' }
            }>
            {d.name}
          </button>
        ))}
      </div>

      {/* Validation banner */}
      {validationIssues.length > 0 && (
        <div className="rounded-lg border p-3 mb-4 text-xs"
          style={{ borderColor: critical ? '#E24B4A' : '#EF9F27', background: critical ? '#FCEBEB' : '#FAEEDA', color: critical ? '#A32D2D' : '#854F0B' }}>
          <div className="font-semibold mb-1">
            {critical ? '⛔ Duplicate issues — simulator will crash on export' : '⚠ Duplicate register addresses detected'}
          </div>
          <ul className="space-y-0.5 list-disc list-inside">
            {validationIssues.map((issue, i) => (
              <li key={i}>
                {issue.type === 'duplicate_tag' && <>Duplicate tag name: <code>{issue.key}</code></>}
                {issue.type === 'duplicate_bacnet_instance' && <>Duplicate BACnet instance <code>{issue.key}</code> — affects: {issue.tags.join(', ')}</>}
                {issue.type === 'duplicate_modbus_register' && <>Duplicate register <code>{issue.key}</code> — affects: {issue.tags.join(', ')}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Device header: address base toggle + BACnet tools */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: '#888780' }}>Address base:</span>
          <div className="flex border rounded overflow-hidden text-xs" style={{ borderColor: '#D3D1C7' }}>
            <button className="px-3 py-1 font-bold"
              style={(device.addressBase ?? 0) === 0
                ? { background: '#1D9E75', color: '#fff' }
                : { background: '#fff', color: '#888780' }}
              onClick={() => patchDevice(device.id, { addressBase: 0 })}>0</button>
            <button className="px-3 py-1 font-bold border-l"
              style={{
                ...((device.addressBase ?? 0) === 1
                  ? { background: '#D4871A', color: '#fff' }
                  : { background: '#fff', color: '#888780' }),
                borderColor: '#D3D1C7',
              }}
              onClick={() => patchDevice(device.id, { addressBase: 1 })}>1</button>
          </div>
          <span className="text-xs" style={{ color: '#888780' }}>
            {(device.addressBase ?? 0) === 0 ? 'exported as-is' : 'exported −1'}
          </span>
        </div>

        {device.protocol === 'bacnet' && (
          <button onClick={autoInferUnits}
            className="text-xs px-3 py-1.5 rounded border font-medium"
            style={{ borderColor: '#1D9E75', color: '#085041', background: '#E1F5EE' }}
            title="Auto-fill units for points with noUnits based on tag name keywords">
            ✦ Auto-units
          </button>
        )}
        <button onClick={autoInferStrategies}
          className="text-xs px-3 py-1.5 rounded border font-medium"
          style={{ borderColor: '#2563EB', color: '#1d4ed8', background: '#EFF6FF' }}
          title="Set report strategy on all points based on object type, IO type and tag keywords">
          ✦ Auto-report
        </button>
        <button onClick={applyAutoStrategy}
          className="text-xs px-3 py-1.5 rounded border font-medium"
          style={{ borderColor: '#D3D1C7', color: '#888780' }}
          title="Clear all report strategy overrides to Default (uses connector-level default)">
          ↺ Reset strategies to Default
        </button>
      </div>

      {/* IO groups */}
      <div className="space-y-6">
        {IO_ORDER.map(ioType => {
          const pts = groups[ioType];
          if (pts.length === 0) return null;
          const col = IO_COLORS[ioType] ?? { bg: '#eee', text: '#333' };

          return (
            <div key={ioType} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#D3D1C7' }}>

              {/* Group header */}
              <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ background: col.bg, borderColor: '#D3D1C7' }}>
                <span className="font-mono font-bold text-sm" style={{ color: col.text }}>{ioType}</span>
                <span className="text-xs" style={{ color: col.text }}>{pts.length} point{pts.length !== 1 ? 's' : ''}</span>

                {device.protocol === 'modbus' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs" style={{ color: col.text }}>Apply to all:</span>
                    <select className={inputCls} style={{ ...inputStyle, width: '65px', fontSize: '11px', padding: '2px 4px' }}
                      defaultValue={DEFAULT_FC[ioType]}
                      onChange={e => patchAllInGroup(ioType, { function_code: Number(e.target.value) as ModbusFunctionCode })}>
                      <option value={1}>FC1</option>
                      <option value={2}>FC2</option>
                      <option value={3}>FC3</option>
                      <option value={4}>FC4</option>
                    </select>
                    <select className={inputCls} style={{ ...inputStyle, width: '90px', fontSize: '11px', padding: '2px 4px' }}
                      defaultValue={DEFAULT_DTYPE[ioType]}
                      onChange={e => patchAllInGroup(ioType, { data_type: e.target.value as ModbusDataType })}>
                      {(['bool','16int','16uint','32float','32int','32uint'] as ModbusDataType[]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-xs ml-2" style={{ color: col.text }}>Start reg:</span>
                    <input type="number" placeholder="e.g. 8001"
                      className={inputCls} style={{ ...inputStyle, width: '90px', fontSize: '11px', padding: '2px 4px' }}
                      value={fillStart[ioType] ?? ''}
                      onChange={e => setFillStart(f => ({ ...f, [ioType]: e.target.value }))} />
                    <button onClick={() => autoFillRegisters(ioType)}
                      className="text-xs px-2 py-1 rounded font-medium"
                      style={{ background: col.text, color: col.bg }}>
                      Fill +1
                    </button>
                  </div>
                )}
              </div>

              {/* Points table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs border-b" style={{ background: '#F5F4EF', borderColor: '#D3D1C7' }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780', minWidth: '220px' }}>Tag / Description</th>
                      {device.protocol === 'modbus' ? (
                        <>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>FC</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Register</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Data Type</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Scale</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Object Type</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Instance</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Unit</th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Multiplier</th>
                        </>
                      )}
                      <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Category</th>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: '#888780' }}>Report</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: '#F1EFE8' }}>
                    {pts.map(({ point, origIdx }) => {
                      const tagDupe = badTags.has(point.tag);
                      const instanceKey = `${point.object_type}:${point.object_instance}`;
                      const instanceDupe = device.protocol === 'bacnet' && badInstances.has(instanceKey);
                      const registerKey = `FC${point.function_code}:${point.register}`;
                      const registerDupe = device.protocol === 'modbus' && badRegisters.has(registerKey);
                      const rowError = tagDupe || instanceDupe;
                      const rowWarn  = !rowError && registerDupe;
                      const cat = point.data_category ?? 'timeseries';
                      const stratIsAuto = !point.report_strategy;
                      const pidKey = String(origIdx); // stable key for periodInputs, unaffected by tag changes

                      return (
                        <tr key={origIdx}
                          style={rowError ? { background: '#FDF0F0' } : rowWarn ? { background: '#FFFBF0' } : undefined}
                          className={rowError || rowWarn ? '' : 'hover:bg-gray-50'}>

                          {/* Tag + Description — always editable */}
                          <td className="px-3 py-2" style={{ minWidth: '220px' }}>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                className="font-mono text-xs font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none w-full"
                                style={{ color: rowError ? '#A32D2D' : '#2C2C2A' }}
                                value={point.tag}
                                onChange={e => patchPoint(origIdx, { tag: e.target.value.toUpperCase() })}
                              />
                              {tagDupe && <span className="text-xs px-1 rounded font-bold flex-shrink-0" style={{ background: '#E24B4A', color: '#fff' }}>DUP TAG</span>}
                            </div>
                            <input
                              type="text"
                              className="text-xs bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 outline-none w-full mt-0.5"
                              style={{ color: '#888780' }}
                              placeholder="description…"
                              value={point.description}
                              onChange={e => patchPoint(origIdx, { description: e.target.value })}
                            />
                          </td>

                          {/* Protocol-specific fields */}
                          {device.protocol === 'modbus' ? (
                            <>
                              <td className="px-3 py-2">
                                <select className={inputCls} style={{ ...inputStyle, width: '70px' }}
                                  value={point.function_code}
                                  onChange={e => patchPoint(origIdx, { function_code: Number(e.target.value) as ModbusFunctionCode })}>
                                  <option value={1}>FC1</option>
                                  <option value={2}>FC2</option>
                                  <option value={3}>FC3</option>
                                  <option value={4}>FC4</option>
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" className={inputCls}
                                  style={{ ...inputStyle, width: '90px', ...(registerDupe ? { borderColor: '#EF9F27', background: '#FFFBF0' } : {}) }}
                                  value={point.register}
                                  onChange={e => patchPoint(origIdx, { register: Number(e.target.value) })} />
                                {registerDupe && <div className="text-xs mt-0.5 font-bold" style={{ color: '#EF9F27' }}>DUP</div>}
                              </td>
                              <td className="px-3 py-2">
                                <select className={inputCls} style={{ ...inputStyle, width: '100px' }}
                                  value={point.data_type}
                                  onChange={e => patchPoint(origIdx, { data_type: e.target.value as ModbusDataType })}>
                                  {(['bool','16int','16uint','32float','32int','32uint'] as ModbusDataType[]).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" step="0.1" className={inputCls} style={{ ...inputStyle, width: '70px' }}
                                  value={point.scale}
                                  onChange={e => patchPoint(origIdx, { scale: Number(e.target.value) })} />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2">
                                <select className={inputCls} style={{ ...inputStyle, width: '140px' }}
                                  value={point.object_type}
                                  onChange={e => {
                                    const newType = e.target.value as BACnetObjectType;
                                    const inferred = inferReportStrategy(point.tag, newType, point.io_type);
                                    patchPoint(origIdx, {
                                      object_type: newType,
                                      report_strategy: inferred === 'ON_VALUE_CHANGE' ? 'ON_VALUE_CHANGE' : null,
                                    });
                                  }}>
                                  {(['analogInput','analogOutput','analogValue','binaryInput','binaryOutput','binaryValue','multiStateValue'] as BACnetObjectType[]).map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" className={inputCls}
                                  style={{ ...inputStyle, width: '80px', ...(instanceDupe ? { borderColor: '#E24B4A', background: '#FFF0F0' } : {}) }}
                                  value={point.object_instance}
                                  onChange={e => patchPoint(origIdx, { object_instance: Number(e.target.value) })} />
                                {instanceDupe && <div className="text-xs mt-0.5 font-bold" style={{ color: '#E24B4A' }}>DUP</div>}
                              </td>
                              <td className="px-3 py-2">
                                <select className={inputCls} style={{ ...inputStyle, width: '100px' }}
                                  value={point.units}
                                  onChange={e => patchPoint(origIdx, { units: e.target.value as BACnetUnits })}>
                                  {BACNET_UNITS_LIST.map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input type="number" step="0.1" className={inputCls}
                                  style={{ ...inputStyle, width: '70px', ...(instanceDupe ? { borderColor: '#E24B4A', background: '#FFF0F0' } : {}) }}
                                  value={point.cov_increment}
                                  onChange={e => patchPoint(origIdx, { cov_increment: Number(e.target.value) })} />
                              </td>
                            </>
                          )}

                          {/* Data Category */}
                          <td className="px-3 py-2">
                            <select className={inputCls}
                              style={{ ...inputStyle, width: '74px', fontSize: '11px', padding: '2px 4px',
                                ...(cat !== 'timeseries' ? { borderColor: '#7C3AED', background: '#F5F0FF', color: '#5b21b6' } : {}) }}
                              value={cat}
                              onChange={e => patchPoint(origIdx, { data_category: e.target.value as DataCategory })}>
                              {(['timeseries','attribute','attribute_update','rpc'] as DataCategory[]).map(c => (
                                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                              ))}
                            </select>
                          </td>

                          {/* Report Strategy */}
                          <td className="px-3 py-2" style={{ minWidth: '190px' }}>
                            <div className="flex items-center gap-1">
                              <select className={inputCls}
                                style={{ ...inputStyle, width: '82px', fontSize: '11px', padding: '2px 4px',
                                  ...(!stratIsAuto ? { borderColor: '#2563EB', background: '#EFF6FF', color: '#1d4ed8' } : {}) }}
                                value={point.report_strategy ?? ''}
                                onChange={e => {
                                  const val = e.target.value as TBReportStrategy | '';
                                  patchPoint(origIdx, { report_strategy: val || null });
                                  if (val === 'ON_REPORT_PERIOD' && !periodInputs[pidKey]) {
                                    setPeriodInputs(prev => ({
                                      ...prev,
                                      [pidKey]: point.report_period_ms
                                        ? msToDisplayPeriod(point.report_period_ms)
                                        : { val: '60', unit: 's' },
                                    }));
                                  }
                                }}>
                                <option value="">Default</option>
                                <option value="ON_REPORT_PERIOD">Period</option>
                                <option value="ON_VALUE_CHANGE">Change</option>
                              </select>
                              {point.report_strategy === 'ON_REPORT_PERIOD' && (() => {
                                const pi = periodInputs[pidKey]
                                  ?? (point.report_period_ms ? msToDisplayPeriod(point.report_period_ms) : { val: '60', unit: 's' });
                                return (
                                  <>
                                    <input type="number" min="1"
                                      className={inputCls}
                                      style={{ ...inputStyle, width: '48px', fontSize: '11px', padding: '2px 4px' }}
                                      value={pi.val}
                                      onChange={e => {
                                        const newVal = e.target.value;
                                        setPeriodInputs(prev => ({ ...prev, [pidKey]: { ...pi, val: newVal } }));
                                        const ms = (parseFloat(newVal) || 0) * PERIOD_UNIT_MS[pi.unit];
                                        if (ms > 0) patchPoint(origIdx, { report_period_ms: ms });
                                      }} />
                                    <select className={inputCls}
                                      style={{ ...inputStyle, width: '46px', fontSize: '11px', padding: '2px 4px' }}
                                      value={pi.unit}
                                      onChange={e => {
                                        const newUnit = e.target.value;
                                        setPeriodInputs(prev => ({ ...prev, [pidKey]: { ...pi, unit: newUnit } }));
                                        const ms = (parseFloat(pi.val) || 0) * PERIOD_UNIT_MS[newUnit];
                                        if (ms > 0) patchPoint(origIdx, { report_period_ms: ms });
                                      }}>
                                      <option>s</option>
                                      <option>m</option>
                                      <option>h</option>
                                      <option>d</option>
                                    </select>
                                  </>
                                );
                              })()}
                            </div>
                          </td>

                          {/* Delete */}
                          <td className="px-2 py-2">
                            <button onClick={() => deletePoint(origIdx)}
                              className="text-xs px-2 py-0.5 rounded border opacity-40 hover:opacity-100 transition-opacity"
                              style={{ borderColor: '#E24B4A', color: '#E24B4A' }}
                              title="Delete point">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add point manually */}
      <div className="mt-6 pt-4 border-t" style={{ borderColor: '#F1EFE8' }}>
        {!showAddPoint ? (
          <button onClick={() => setShowAddPoint(true)}
            className="text-xs px-3 py-1.5 rounded border"
            style={{ borderColor: '#D3D1C7', color: '#aaa' }}>
            + Add point manually
          </button>
        ) : (
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#EF9F27' }}>
            <p className="text-xs mb-3 font-medium" style={{ color: '#854F0B' }}>
              ⚠ Manual points are for third-party device integration only.
              For your own controllers, generate point names in BMSHub and import them.
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#888780' }}>Tag</label>
                <input className={inputCls} style={{ ...inputStyle, width: '140px' }}
                  placeholder="e.g. METER1KWHTOT"
                  value={newPoint.tag}
                  onChange={e => setNewPoint(p => ({ ...p, tag: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#888780' }}>Description</label>
                <input className={inputCls} style={{ ...inputStyle, width: '200px' }}
                  placeholder="Total kWh"
                  value={newPoint.description}
                  onChange={e => setNewPoint(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#888780' }}>I/O Type</label>
                <select className={inputCls} style={{ ...inputStyle, width: '80px' }}
                  value={newPoint.io_type}
                  onChange={e => setNewPoint(p => ({ ...p, io_type: e.target.value as IOType }))}>
                  {(['AI','AO','DI','DO','AV','BV'] as IOType[]).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <button onClick={addPointManually}
                className="px-3 py-1.5 rounded text-sm font-medium text-white"
                style={{ background: '#1D9E75' }}>Add</button>
              <button onClick={() => setShowAddPoint(false)}
                className="px-3 py-1.5 rounded text-sm"
                style={{ background: '#F1EFE8', color: '#888780' }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {onExport && (
          <button onClick={onExport} className="px-5 py-2 rounded text-sm font-medium border"
            style={{ borderColor: '#1D9E75', color: '#1D9E75', background: '#fff' }}
            title="Export current assembly as JSON file">
            ↓ Save Assembly
          </button>
        )}
        <button onClick={onNext} className="px-5 py-2 rounded text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}>
          Next: Simulation Values →
        </button>
      </div>
    </div>
  );
}
