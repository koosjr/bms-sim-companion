// src/components/ImportTab.tsx
import { useRef } from 'react';
import type { AppState, SimulatorExport } from '../types';
import { defaultDeviceFromImport } from '../defaults';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<AppState>) => void;
  onNext: () => void;
}

export default function ImportTab({ state, onUpdate, onNext }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SimulatorExport;
        if (!parsed.devices || !Array.isArray(parsed.devices)) {
          alert('Invalid simulator export file — missing devices array.');
          return;
        }
        // Build default SimDevices; preserve existing mappings for matching source_ids
        const existing = state.devices;
        const devices = parsed.devices.map((imported, i) => {
          const match = existing.find(d => d.source_id === imported.id);
          return match ?? defaultDeviceFromImport(imported, i);
        });
        onUpdate({ imported: parsed, devices, project_name: parsed.project });
      } catch {
        alert('Could not parse file — ensure it is a valid simulator-export.json from BMSHub.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const { imported, devices } = state;

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: '#2C2C2A' }}>Import from BMSHub</h2>
      <p className="text-sm mb-6" style={{ color: '#888780' }}>
        Export a project from BMSHub using "Export for Simulator", then import it here.
      </p>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed rounded-xl p-10 text-center mb-6 cursor-pointer transition-colors hover:border-blue-400"
        style={{ borderColor: '#D3D1C7' }}
        onClick={() => fileRef.current?.click()}
      >
        <p className="text-sm font-medium mb-1" style={{ color: '#2C2C2A' }}>
          Click to select <code>simulator-export.json</code>
        </p>
        <p className="text-xs" style={{ color: '#888780' }}>or drag and drop</p>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview */}
      {imported && (
        <div className="bg-white rounded-xl border p-5 mb-6" style={{ borderColor: '#D3D1C7' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: '#2C2C2A' }}>{imported.project}</h3>
              <p className="text-xs" style={{ color: '#888780' }}>
                {devices.length} device{devices.length !== 1 ? 's' : ''}
                · Exported {new Date(imported.exported_at).toLocaleString()}
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded font-mono"
              style={{ background: '#E1F5EE', color: '#085041' }}>
              ✓ loaded
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: '#F1EFE8' }}>
            {imported.devices.map(d => (
              <div key={d.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium" style={{ color: '#2C2C2A' }}>{d.name}</span>
                  <span className="text-xs ml-2" style={{ color: '#888780' }}>{d.description}</span>
                </div>
                <span className="text-xs" style={{ color: '#888780' }}>
                  {d.points.length} points
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {imported && (
        <button
          onClick={onNext}
          className="px-5 py-2 rounded text-sm font-medium text-white"
          style={{ background: '#1D9E75' }}
        >
          Next: Configure Devices →
        </button>
      )}
    </div>
  );
}
