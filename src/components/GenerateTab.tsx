// src/components/GenerateTab.tsx
import { useState } from 'react';
import type { AppState, NetworkConfig } from '../types';
import { buildProjectZip } from '../generators/zipBuilder';
import { generateThingsBoardJson } from '../generators/thingsBoardExporter';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
}

const inputCls = "border rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";
const inputStyle = { borderColor: '#D3D1C7' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1" style={{ color: '#888780' }}>{label}</label>
      {children}
    </div>
  );
}

export default function GenerateTab({ state, onUpdate }: Props) {
  const [downloading, setDownloading] = useState(false);
  const { network, devices, project_name } = state;

  function patchNetwork(patch: Partial<NetworkConfig>) {
    onUpdate({ network: { ...network, ...patch } });
  }

  function changePrefix(newPrefix: string) {
    // Extract last octets from current gateway and pi_ip
    const gwLast = network.gateway.split('.').pop() ?? '1';
    const piLast = network.pi_ip.split('.').pop() ?? '200';

    // Update all device IPs to use new prefix
    const updatedDevices = devices.map(d => {
      const lastOctet = d.ip_address.split('.').pop() ?? '101';
      return { ...d, ip_address: `${newPrefix}.${lastOctet}` };
    });

    onUpdate({
      network: {
        ...network,
        ip_prefix: newPrefix,
        subnet: `${newPrefix}.0/24`,
        gateway: `${newPrefix}.${gwLast}`,
        pi_ip: `${newPrefix}.${piLast}`,
      },
      devices: updatedDevices,
    });
  }

  async function downloadZip() {
    setDownloading(true);
    try {
      const blob = await buildProjectZip(state);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project_name.toLowerCase().replace(/\s+/g, '-')}-simulator.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function downloadThingsBoard() {
    const json = generateThingsBoardJson(devices);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project_name.toLowerCase().replace(/\s+/g, '-')}-thingsboard.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Generate</h2>
      <p className="text-sm mb-6" style={{ color: '#888780' }}>
        Configure the Pi network settings, then download your simulator package.
      </p>

      {/* Network settings */}
      <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: '#D3D1C7' }}>
        <h3 className="font-semibold text-sm mb-4" style={{ color: '#2C2C2A' }}>Raspberry Pi Network</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="IP Prefix (first 3 octets)">
            <input className={inputCls} style={inputStyle} value={network.ip_prefix}
              onChange={e => changePrefix(e.target.value)}
              placeholder="e.g. 192.168.1" />
          </Field>
          <Field label="Gateway">
            <input className={inputCls} style={inputStyle} value={network.gateway}
              onChange={e => patchNetwork({ gateway: e.target.value })} />
          </Field>
          <Field label="Pi macvlan IP (for Pi→container comms)">
            <input className={inputCls} style={inputStyle} value={network.pi_ip}
              onChange={e => patchNetwork({ pi_ip: e.target.value })} />
          </Field>
          <Field label="Parent interface (usually eth0)">
            <input className={inputCls} style={inputStyle} value={network.parent_interface}
              onChange={e => patchNetwork({ parent_interface: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Device summary */}
      <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: '#D3D1C7' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: '#2C2C2A' }}>Summary</h3>
        {devices.length === 0 ? (
          <p className="text-sm" style={{ color: '#888780' }}>No devices configured. Go back to Device Setup.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            {devices.map(d => (
              <div key={d.id} className="flex items-center justify-between">
                <span style={{ color: '#2C2C2A' }}>{d.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded uppercase font-mono"
                    style={d.protocol === 'modbus'
                      ? { background: '#E1F5EE', color: '#085041' }
                      : { background: '#FAEEDA', color: '#854F0B' }
                    }>
                    {d.protocol}
                  </span>
                  <span className="font-mono text-xs" style={{ color: '#888780' }}>{d.ip_address}</span>
                  <span className="text-xs" style={{ color: '#888780' }}>{d.points.length} pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Download buttons */}
      <div className="flex gap-3 flex-wrap mb-6">
        <button
          onClick={downloadZip}
          disabled={downloading || devices.length === 0}
          className="px-5 py-2.5 rounded text-sm font-medium text-white transition-opacity"
          style={{ background: '#1D9E75', opacity: downloading || devices.length === 0 ? 0.5 : 1 }}
        >
          {downloading ? 'Building ZIP\u2026' : '\u2b07 Download Simulator ZIP'}
        </button>
        <button
          onClick={downloadThingsBoard}
          disabled={devices.length === 0}
          className="px-5 py-2.5 rounded text-sm font-medium text-white transition-opacity"
          style={{ background: '#2C6BAD', opacity: devices.length === 0 ? 0.5 : 1 }}
        >
          \u2b07 Download ThingsBoard JSON
        </button>
      </div>

      {/* Pi instructions */}
      <div className="p-4 rounded-lg text-xs" style={{ background: '#F1EFE8', color: '#888780' }}>
        <strong style={{ color: '#2C2C2A' }}>On the Raspberry Pi:</strong>
        <pre className="mt-2 font-mono">{`unzip simulator.zip && cd simulator\nsudo ./setup-network.sh   # once\ndocker-compose up -d`}</pre>
      </div>
    </div>
  );
}
