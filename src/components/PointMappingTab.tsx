// src/components/PointMappingTab.tsx
import { useState } from 'react';
import type { AppState, SimDevice, SimPoint, ModbusFunctionCode, ModbusDataType, BACnetObjectType, BACnetUnits } from '../types';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
  onNext: () => void;
}

const inputCls = "border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";
const inputStyle = { borderColor: '#D3D1C7' };

function patchPointInDevice(device: SimDevice, pointTag: string, patch: Partial<SimPoint>): SimDevice {
  return { ...device, points: device.points.map(p => p.tag === pointTag ? { ...p, ...patch } : p) };
}

const IO_COLORS: Record<string, { bg: string; text: string }> = {
  AI: { bg: '#E1F5EE', text: '#085041' },
  AO: { bg: '#FAEEDA', text: '#854F0B' },
  DI: { bg: '#FCEBEB', text: '#A32D2D' },
  DO: { bg: '#2C2C2A', text: '#F1EFE8' },
};

export default function PointMappingTab({ state, onUpdate, onNext }: Props) {
  const [activeDeviceId, setActiveDeviceId] = useState<string>(state.devices[0]?.id ?? '');
  const { devices } = state;
  const device = devices.find(d => d.id === activeDeviceId) ?? devices[0];

  function patchPoint(tag: string, patch: Partial<SimPoint>) {
    if (!device) return;
    const updated = patchPointInDevice(device, tag, patch);
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  if (!device) return <div className="text-sm" style={{ color: '#888780' }}>No devices configured. Go back to Device Setup.</div>;

  return (
    <div className="max-w-4xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Point Mapping</h2>
      <p className="text-sm mb-4" style={{ color: '#888780' }}>
        Assign {device.protocol === 'modbus' ? 'Modbus register addresses' : 'BACnet object types and instances'} to each point.
      </p>

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

      {/* Points table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs border-b" style={{ background: '#F5F4EF', borderColor: '#D3D1C7' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Tag</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>I/O</th>
              {device.protocol === 'modbus' ? (
                <>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>FC</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Register</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Data Type</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Scale</th>
                </>
              ) : (
                <>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Object Type</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Instance</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Units</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>COV Inc.</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: '#F1EFE8' }}>
            {device.points.map(point => {
              const col = IO_COLORS[point.io_type] ?? { bg: '#eee', text: '#333' };
              return (
                <tr key={point.tag} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs font-bold" style={{ color: '#2C2C2A' }}>{point.tag}</div>
                    <div className="text-xs" style={{ color: '#888780' }}>{point.description}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{ background: col.bg, color: col.text }}>
                      {point.io_type}
                    </span>
                  </td>
                  {device.protocol === 'modbus' ? (
                    <>
                      <td className="px-4 py-2">
                        <select className={inputCls} style={{ ...inputStyle, width: '70px' }}
                          value={point.function_code}
                          onChange={e => patchPoint(point.tag, { function_code: Number(e.target.value) as ModbusFunctionCode })}>
                          <option value={1}>FC1</option>
                          <option value={2}>FC2</option>
                          <option value={3}>FC3</option>
                          <option value={4}>FC4</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" className={inputCls} style={{ ...inputStyle, width: '90px' }}
                          value={point.register}
                          onChange={e => patchPoint(point.tag, { register: Number(e.target.value) })} />
                      </td>
                      <td className="px-4 py-2">
                        <select className={inputCls} style={{ ...inputStyle, width: '100px' }}
                          value={point.data_type}
                          onChange={e => patchPoint(point.tag, { data_type: e.target.value as ModbusDataType })}>
                          {(['bool','16int','16uint','32float','32int','32uint'] as ModbusDataType[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" step="0.1" className={inputCls} style={{ ...inputStyle, width: '70px' }}
                          value={point.scale}
                          onChange={e => patchPoint(point.tag, { scale: Number(e.target.value) })} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2">
                        <select className={inputCls} style={{ ...inputStyle, width: '140px' }}
                          value={point.object_type}
                          onChange={e => patchPoint(point.tag, { object_type: e.target.value as BACnetObjectType })}>
                          {(['analogInput','analogOutput','analogValue','binaryInput','binaryOutput','binaryValue','multiStateValue'] as BACnetObjectType[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" className={inputCls} style={{ ...inputStyle, width: '80px' }}
                          value={point.object_instance}
                          onChange={e => patchPoint(point.tag, { object_instance: Number(e.target.value) })} />
                      </td>
                      <td className="px-4 py-2">
                        <select className={inputCls} style={{ ...inputStyle, width: '140px' }}
                          value={point.units}
                          onChange={e => patchPoint(point.tag, { units: e.target.value as BACnetUnits })}>
                          {(['degreesCelsius','degreesKelvin','pascals','kilopascals','percent','cubicMetersPerHour','litersPerSecond','hertz','revolutionsPerMinute','noUnits'] as BACnetUnits[]).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" step="0.1" className={inputCls} style={{ ...inputStyle, width: '70px' }}
                          value={point.cov_increment}
                          onChange={e => patchPoint(point.tag, { cov_increment: Number(e.target.value) })} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={onNext} className="mt-6 px-5 py-2 rounded text-sm font-medium text-white"
        style={{ background: '#1D9E75' }}>
        Next: Simulation Values →
      </button>
    </div>
  );
}
