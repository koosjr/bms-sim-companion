// src/components/SimValuesTab.tsx
import { useState } from 'react';
import type { AppState, SimPoint } from '../types';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
  onNext: () => void;
}

const inputCls = "border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";
const inputStyle = { borderColor: '#D3D1C7' };

export default function SimValuesTab({ state, onUpdate, onNext }: Props) {
  const [activeDeviceId, setActiveDeviceId] = useState<string>(state.devices[0]?.id ?? '');
  const { devices } = state;
  const device = devices.find(d => d.id === activeDeviceId) ?? devices[0];

  function patchPoint(tag: string, patch: Partial<SimPoint>) {
    if (!device) return;
    const updated = { ...device, points: device.points.map(p => p.tag === tag ? { ...p, ...patch } : p) };
    onUpdate({ devices: devices.map(d => d.id === device.id ? updated : d) });
  }

  if (!device) return <div className="text-sm" style={{ color: '#888780' }}>No devices. Go back to Device Setup.</div>;

  function isBinary(p: SimPoint): boolean {
    return p.data_type === 'bool'
      || p.object_type === 'binaryInput'
      || p.object_type === 'binaryOutput'
      || p.object_type === 'binaryValue';
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Simulation Values</h2>
      <p className="text-sm mb-4" style={{ color: '#888780' }}>
        Set base value (engineering units) and noise % for each point. Values update every 5 seconds.
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

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#D3D1C7' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs border-b" style={{ background: '#F5F4EF', borderColor: '#D3D1C7' }}>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Tag</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Base Value</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Noise %</th>
              <th className="text-left px-4 py-2 font-medium" style={{ color: '#888780' }}>Preview range</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: '#F1EFE8' }}>
            {device.points.map(point => {
              const binary = isBinary(point);
              const min = point.base_value * (1 - point.noise_pct / 100);
              const max = point.base_value * (1 + point.noise_pct / 100);
              return (
                <tr key={point.tag} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs font-bold" style={{ color: '#2C2C2A' }}>{point.tag}</div>
                    <div className="text-xs" style={{ color: '#888780' }}>{point.description}</div>
                  </td>
                  <td className="px-4 py-2">
                    {binary ? (
                      <select className={inputCls} style={{ ...inputStyle, width: '80px' }}
                        value={point.base_value}
                        onChange={e => patchPoint(point.tag, { base_value: Number(e.target.value) })}>
                        <option value={1}>1 (ON)</option>
                        <option value={0}>0 (OFF)</option>
                      </select>
                    ) : (
                      <input type="number" step="0.1" className={inputCls} style={{ ...inputStyle, width: '100px' }}
                        value={point.base_value}
                        onChange={e => patchPoint(point.tag, { base_value: Number(e.target.value) })} />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" min="0" max="50" className={inputCls}
                      style={{ ...inputStyle, width: '70px' }}
                      disabled={binary}
                      value={point.noise_pct}
                      onChange={e => patchPoint(point.tag, { noise_pct: Number(e.target.value) })} />
                  </td>
                  <td className="px-4 py-2 text-xs font-mono" style={{ color: '#888780' }}>
                    {binary ? '0 / 1' : `${min.toFixed(2)} – ${max.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button onClick={onNext} className="mt-6 px-5 py-2 rounded text-sm font-medium text-white"
        style={{ background: '#1D9E75' }}>
        Next: Generate →
      </button>
    </div>
  );
}
