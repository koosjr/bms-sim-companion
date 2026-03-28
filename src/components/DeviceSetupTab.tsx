// src/components/DeviceSetupTab.tsx
import { useState } from 'react';
import type { AppState, SimDevice, Protocol, ByteOrder } from '../types';

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
  const { devices } = state;

  function patchDevice(id: string, patch: Partial<SimDevice>) {
    onUpdate({ devices: devices.map(d => d.id === id ? { ...d, ...patch } : d) });
  }

  function duplicateDevice(device: SimDevice) {
    const lastOctet = parseInt(device.ip_address.split('.').pop() ?? '101', 10);
    const newIp = `${state.network.ip_prefix}.${lastOctet + 1}`;

    const newDevice: SimDevice = {
      ...device,
      id: crypto.randomUUID(),
      name: `${device.name} (copy)`,
      ip_address: newIp,
      device_instance: device.device_instance + 1,
      points: device.points.map(p => ({ ...p })),  // deep-copy all point data including registers
    };

    onUpdate({ devices: [...devices, newDevice] });
    setOpenId(newDevice.id);
  }

  function removeDevice(id: string) {
    onUpdate({ devices: devices.filter(d => d.id !== id) });
  }

  const ipConflicts = new Set(
    devices
      .map(d => d.ip_address)
      .filter((ip, i, arr) => arr.indexOf(ip) !== i)
  );

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Device Setup</h2>
      <p className="text-sm mb-6" style={{ color: '#888780' }}>
        Configure protocol, IP address, and connection parameters for each device.
      </p>

      <div className="space-y-3">
        {devices.map(device => (
          <div key={device.id} className="bg-white rounded-xl border" style={{ borderColor: '#D3D1C7' }}>
            {/* Header row */}
            <div
              className="flex items-center justify-between px-5 py-3 cursor-pointer"
              onClick={() => setOpenId(openId === device.id ? null : device.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm" style={{ color: '#2C2C2A' }}>{device.name}</span>
                <span className="text-xs px-2 py-0.5 rounded uppercase font-mono"
                  style={device.protocol === 'modbus'
                    ? { background: '#E1F5EE', color: '#085041' }
                    : { background: '#FAEEDA', color: '#854F0B' }
                  }>
                  {device.protocol}
                </span>
                <span className="text-xs font-mono" style={{ color: '#888780' }}>{device.ip_address}</span>
                {ipConflicts.has(device.ip_address) && (
                  <span className="text-xs" style={{ color: '#E24B4A' }}>⚠ IP conflict</span>
                )}
              </div>
              <div className="flex gap-2">
                <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#D3D1C7', color: '#2C2C2A' }}
                  onClick={e => { e.stopPropagation(); duplicateDevice(device); }}>
                  Duplicate
                </button>
                {devices.length > 1 && (
                  <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#D3D1C7', color: '#E24B4A' }}
                    onClick={e => { e.stopPropagation(); removeDevice(device.id); }}>
                    Remove
                  </button>
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
                      <span className="text-sm font-mono px-2 py-1.5 rounded border bg-gray-50 whitespace-nowrap"
                        style={{ borderColor: '#D3D1C7', color: '#888780', background: '#F9F8F4' }}>
                        {state.network.ip_prefix}.
                      </span>
                      <input
                        type="number"
                        min={1} max={254}
                        className={inputCls}
                        style={{ ...inputStyle, width: 80 }}
                        value={device.ip_address.split('.').pop() ?? ''}
                        onChange={e => patchDevice(device.id, {
                          ip_address: `${state.network.ip_prefix}.${e.target.value}`
                        })}
                      />
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
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={onNext} className="mt-6 px-5 py-2 rounded text-sm font-medium text-white"
        style={{ background: '#1D9E75' }}>
        Next: Map Points →
      </button>
    </div>
  );
}
