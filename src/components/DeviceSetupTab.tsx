// src/components/DeviceSetupTab.tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, SimDevice, Protocol, ByteOrder, DeviceAssembly } from '../types';
import { loadAssemblies, addAssembly, deleteAssembly, saveAssemblies } from '../storage';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
  onNext: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: '#888780' }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";
const inputStyle = { borderColor: '#D3D1C7' };

export default function DeviceSetupTab({ state, onUpdate, onNext }: Props) {
  const [openId, setOpenId] = useState<string | null>(state.devices[0]?.id ?? null);
  const [assemblies, setAssemblies] = useState<DeviceAssembly[]>(() => loadAssemblies());
  const [showLibrary, setShowLibrary] = useState(false);
  const { devices } = state;

  function patchDevice(id: string, patch: Partial<SimDevice>) {
    onUpdate({ devices: devices.map(d => d.id === id ? { ...d, ...patch } : d) });
  }

  function duplicateDevice(device: SimDevice) {
    const lastOctet = parseInt(device.ip_address.split('.').pop() ?? '101', 10);
    const newDevice: SimDevice = {
      ...device,
      id: uuidv4(),
      name: `${device.name} (copy)`,
      ip_address: `${state.network.ip_prefix}.${lastOctet + 1}`,
      device_instance: device.device_instance + 1,
      points: device.points.map(p => ({ ...p })),
    };
    onUpdate({ devices: [...devices, newDevice] });
    setOpenId(newDevice.id);
  }

  function removeDevice(id: string) {
    onUpdate({ devices: devices.filter(d => d.id !== id) });
  }

  // Save a device's full point map as a reusable assembly
  function saveAsAssembly(device: SimDevice) {
    const name = window.prompt('Assembly name (e.g. "ABB PM5 Power Meter"):', device.name);
    if (!name?.trim()) return;
    const assembly: DeviceAssembly = {
      id: uuidv4(),
      name: name.trim(),
      description: device.description,
      protocol: device.protocol,
      savedAt: new Date().toISOString(),
      points: device.points.map(p => ({ ...p })),
      addressBase: device.addressBase,
    };
    addAssembly(assembly);
    setAssemblies(loadAssemblies());
    alert(`Assembly "${assembly.name}" saved — ${assembly.points.length} points.`);
  }

  // Load an assembly's points into an existing device
  function loadFromAssembly(device: SimDevice, assembly: DeviceAssembly) {
    if (!window.confirm(`Load "${assembly.name}" into "${device.name}"? This replaces all current points.`)) return;
    patchDevice(device.id, {
      points: assembly.points.map(p => ({ ...p })),
      addressBase: assembly.addressBase ?? 0,
    });
    setShowLibrary(false);
  }

  function addBlankDevice() {
    const lastOctet = devices.length > 0
      ? (parseInt(devices[devices.length - 1].ip_address.split('.').pop() ?? '100', 10) + 1)
      : 101;
    const newDevice: SimDevice = {
      id: uuidv4(),
      source_id: '',
      name: `Device ${devices.length + 1}`,
      profile_name: '',
      description: '',
      protocol: 'modbus',
      ip_address: `${state.network.ip_prefix}.${lastOctet}`,
      modbus_port: 502,
      unit_id: 1,
      byte_order: 'big',
      word_order: 'big',
      bacnet_port: 47808,
      device_instance: devices.length + 1,
      device_name: `Device ${devices.length + 1}`,
      vendor_id: 0,
      points: [],
    };
    onUpdate({ devices: [...devices, newDevice] });
    setOpenId(newDevice.id);
  }

  function addDeviceFromAssembly(assembly: DeviceAssembly) {
    const lastOctet = devices.length > 0
      ? (parseInt(devices[devices.length - 1].ip_address.split('.').pop() ?? '100', 10) + 1)
      : 101;
    const newDevice: SimDevice = {
      id: uuidv4(),
      source_id: '',
      name: assembly.name,
      profile_name: assembly.name,
      description: assembly.description ?? '',
      protocol: assembly.protocol,
      ip_address: `${state.network.ip_prefix}.${lastOctet}`,
      modbus_port: 502,
      unit_id: 1,
      byte_order: 'big',
      word_order: 'big',
      bacnet_port: 47808,
      device_instance: devices.length + 1,
      device_name: assembly.name,
      vendor_id: 0,
      points: assembly.points.map(p => ({ ...p })),
      addressBase: assembly.addressBase ?? 0,
    };
    onUpdate({ devices: [...devices, newDevice] });
    setOpenId(newDevice.id);
    setShowLibrary(false);
  }

  function renameAssembly(assembly: DeviceAssembly) {
    const newName = window.prompt('Rename assembly:', assembly.name);
    if (!newName?.trim() || newName.trim() === assembly.name) return;
    const updated = assemblies.map(a =>
      a.id === assembly.id ? { ...a, name: newName.trim() } : a
    );
    saveAssemblies(updated);
    setAssemblies(updated);
  }

  function removeAssembly(id: string) {
    if (!window.confirm('Delete this assembly?')) return;
    deleteAssembly(id);
    setAssemblies(loadAssemblies());
  }

  // Export all assemblies as JSON
  function exportAssemblies() {
    const blob = new Blob([JSON.stringify(assemblies, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'device-assemblies.json'; a.click();
  }

  // Import assemblies from JSON (merges, skipping duplicates by id)
  function importAssemblies(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const incoming = JSON.parse(ev.target?.result as string) as DeviceAssembly[];
        const existing = loadAssemblies();
        const existingIds = new Set(existing.map(a => a.id));
        const merged = [...existing, ...incoming.filter(a => !existingIds.has(a.id))];
        saveAssemblies(merged);
        setAssemblies(merged);
      } catch { alert('Invalid assembly file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const ipConflicts = new Set(
    devices.map(d => d.ip_address).filter((ip, i, arr) => arr.indexOf(ip) !== i)
  );

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Device Setup</h2>
      <p className="text-sm mb-4" style={{ color: '#888780' }}>
        Configure protocol, IP address, and connection parameters for each device.
      </p>

      {/* Devices header + Add button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: '#2C2C2A' }}>
          Devices ({devices.length})
        </span>
        <button onClick={addBlankDevice}
          className="text-xs px-3 py-1.5 rounded border font-medium"
          style={{ borderColor: '#1D9E75', color: '#085041', background: '#E1F5EE' }}>
          + Add Device
        </button>
      </div>

      {/* Devices */}
      <div className="space-y-3 mb-6">
        {devices.map(device => (
          <div key={device.id} className="bg-white rounded-xl border" style={{ borderColor: '#D3D1C7' }}>

            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3 cursor-pointer"
              onClick={() => setOpenId(openId === device.id ? null : device.id)}>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm" style={{ color: '#2C2C2A' }}>{device.name}</span>
                <span className="text-xs px-2 py-0.5 rounded uppercase font-mono"
                  style={device.protocol === 'modbus'
                    ? { background: '#E1F5EE', color: '#085041' }
                    : { background: '#FAEEDA', color: '#854F0B' }}>
                  {device.protocol}
                </span>
                <span className="text-xs font-mono" style={{ color: '#888780' }}>{device.ip_address}</span>
                {ipConflicts.has(device.ip_address) && (
                  <span className="text-xs" style={{ color: '#E24B4A' }}>⚠ IP conflict</span>
                )}
              </div>
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <button className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: '#1D9E75', color: '#085041' }}
                  title="Save this device's full point map as a reusable assembly"
                  onClick={() => saveAsAssembly(device)}>
                  Save as Assembly
                </button>
                <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#D3D1C7', color: '#2C2C2A' }}
                  onClick={() => duplicateDevice(device)}>Duplicate</button>
                {devices.length > 1 && (
                  <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#D3D1C7', color: '#E24B4A' }}
                    onClick={() => removeDevice(device.id)}>Remove</button>
                )}
              </div>
            </div>

            {/* Expanded form */}
            {openId === device.id && (
              <div className="px-5 pb-5 border-t pt-4" style={{ borderColor: '#F1EFE8' }}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Field label="Device Name">
                    <input className={inputCls} style={inputStyle} value={device.name}
                      onChange={e => patchDevice(device.id, { name: e.target.value })} />
                  </Field>
                  <Field label="Protocol">
                    <select className={inputCls} style={inputStyle} value={device.protocol}
                      onChange={e => patchDevice(device.id, { protocol: e.target.value as Protocol })}>
                      <option value="modbus">Modbus TCP</option>
                      <option value="bacnet">BACnet/IP</option>
                    </select>
                  </Field>
                  <Field label="IP Address">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono px-2 py-1.5 rounded border whitespace-nowrap"
                        style={{ borderColor: '#D3D1C7', color: '#888780', background: '#F9F8F4' }}>
                        {state.network.ip_prefix}.
                      </span>
                      <input type="number" min={1} max={254} className={inputCls}
                        style={{ ...inputStyle, width: 80 }}
                        value={device.ip_address.split('.').pop() ?? ''}
                        onChange={e => patchDevice(device.id, {
                          ip_address: `${state.network.ip_prefix}.${e.target.value}`
                        })} />
                    </div>
                  </Field>
                </div>

                {device.protocol === 'modbus' && (
                  <div className="grid grid-cols-4 gap-4">
                    <Field label="Port">
                      <input type="number" className={inputCls} style={inputStyle} value={device.modbus_port}
                        onChange={e => patchDevice(device.id, { modbus_port: Number(e.target.value) })} />
                    </Field>
                    <Field label="Unit ID">
                      <input type="number" className={inputCls} style={inputStyle} value={device.unit_id}
                        onChange={e => patchDevice(device.id, { unit_id: Number(e.target.value) })} />
                    </Field>
                    <Field label="Byte Order">
                      <select className={inputCls} style={inputStyle} value={device.byte_order}
                        onChange={e => patchDevice(device.id, { byte_order: e.target.value as ByteOrder })}>
                        <option value="big">Big</option>
                        <option value="little">Little</option>
                      </select>
                    </Field>
                    <Field label="Word Order">
                      <select className={inputCls} style={inputStyle} value={device.word_order}
                        onChange={e => patchDevice(device.id, { word_order: e.target.value as ByteOrder })}>
                        <option value="big">Big</option>
                        <option value="little">Little</option>
                      </select>
                    </Field>
                  </div>
                )}

                {device.protocol === 'bacnet' && (
                  <div className="grid grid-cols-4 gap-4">
                    <Field label="Port">
                      <input type="number" className={inputCls} style={inputStyle} value={device.bacnet_port}
                        onChange={e => patchDevice(device.id, { bacnet_port: Number(e.target.value) })} />
                    </Field>
                    <Field label="Device Instance">
                      <input type="number" className={inputCls} style={inputStyle} value={device.device_instance}
                        onChange={e => patchDevice(device.id, { device_instance: Number(e.target.value) })} />
                    </Field>
                    <Field label="Device Name">
                      <input className={inputCls} style={inputStyle} value={device.device_name}
                        onChange={e => patchDevice(device.id, { device_name: e.target.value })} />
                    </Field>
                    <Field label="Vendor ID">
                      <input type="number" className={inputCls} style={inputStyle} value={device.vendor_id}
                        onChange={e => patchDevice(device.id, { vendor_id: Number(e.target.value) })} />
                    </Field>
                  </div>
                )}

                {/* Load from assembly — inside expanded form */}
                {assemblies.length > 0 && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: '#F1EFE8' }}>
                    <p className="text-xs mb-2" style={{ color: '#888780' }}>Load point map from assembly:</p>
                    <div className="flex flex-wrap gap-2">
                      {assemblies.filter(a => a.protocol === device.protocol).map(a => (
                        <button key={a.id}
                          className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: '#D3D1C7', color: '#2C2C2A' }}
                          onClick={() => loadFromAssembly(device, a)}>
                          {a.name} ({a.points.length} pts)
                        </button>
                      ))}
                      {assemblies.filter(a => a.protocol === device.protocol).length === 0 && (
                        <span className="text-xs" style={{ color: '#aaa' }}>No {device.protocol} assemblies saved yet</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assembly Library panel */}
      <div className="mb-6">
        <button onClick={() => setShowLibrary(v => !v)}
          className="text-xs px-3 py-1.5 rounded border font-medium"
          style={{ borderColor: '#D3D1C7', color: '#888780' }}>
          {showLibrary ? '▲ Hide' : '▼ Show'} Assembly Library ({assemblies.length})
        </button>

        {showLibrary && (
          <div className="mt-3 bg-white rounded-xl border p-4" style={{ borderColor: '#D3D1C7' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: '#2C2C2A' }}>Device Assembly Library</span>
              <div className="flex gap-2">
                <button onClick={exportAssemblies}
                  className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#D3D1C7', color: '#888780' }}>
                  Export
                </button>
                <label className="text-xs px-2 py-1 rounded border cursor-pointer"
                  style={{ borderColor: '#D3D1C7', color: '#888780' }}>
                  Import
                  <input type="file" accept=".json" className="hidden" onChange={importAssemblies} />
                </label>
              </div>
            </div>

            {assemblies.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: '#aaa' }}>
                No assemblies saved yet. Configure a device fully, then click "Save as Assembly".
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs border-b" style={{ borderColor: '#F1EFE8' }}>
                    <th className="text-left py-1 font-medium" style={{ color: '#888780' }}>Name</th>
                    <th className="text-left py-1 font-medium" style={{ color: '#888780' }}>Protocol</th>
                    <th className="text-left py-1 font-medium" style={{ color: '#888780' }}>Points</th>
                    <th className="text-left py-1 font-medium" style={{ color: '#888780' }}>Saved</th>
                    <th className="text-right py-1 font-medium" style={{ color: '#888780' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assemblies.map(a => (
                    <tr key={a.id} className="border-b last:border-0" style={{ borderColor: '#F1EFE8' }}>
                      <td className="py-1.5 font-medium text-sm" style={{ color: '#2C2C2A' }}>{a.name}</td>
                      <td className="py-1.5">
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono uppercase"
                          style={a.protocol === 'modbus'
                            ? { background: '#E1F5EE', color: '#085041' }
                            : { background: '#FAEEDA', color: '#854F0B' }}>
                          {a.protocol}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs" style={{ color: '#888780' }}>{a.points.length} pts</td>
                      <td className="py-1.5 text-xs" style={{ color: '#888780' }}>
                        {new Date(a.savedAt).toLocaleDateString()}
                      </td>
                      <td className="py-1.5 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => addDeviceFromAssembly(a)}
                            className="text-xs px-2 py-0.5 rounded border font-medium"
                            style={{ borderColor: '#1D9E75', color: '#085041', background: '#E1F5EE' }}
                            title="Create a new device from this assembly">
                            + Add
                          </button>
                          <button onClick={() => renameAssembly(a)}
                            className="text-xs px-2 py-0.5 rounded border"
                            style={{ borderColor: '#D3D1C7', color: '#2C2C2A' }}
                            title="Rename this assembly">
                            Edit
                          </button>
                          <button onClick={() => removeAssembly(a.id)}
                            className="text-xs px-2 py-0.5 rounded border"
                            style={{ borderColor: '#E24B4A', color: '#E24B4A' }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <button onClick={onNext} className="px-5 py-2 rounded text-sm font-medium text-white"
        style={{ background: '#1D9E75' }}>
        Next: Map Points →
      </button>
    </div>
  );
}
