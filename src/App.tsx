// src/App.tsx
import { useState } from 'react';
import type { AppState } from './types';
import { loadState, saveState } from './storage';
import ImportTab from './components/ImportTab';
import DeviceSetupTab from './components/DeviceSetupTab';
import PointMappingTab from './components/PointMappingTab';
import SimValuesTab from './components/SimValuesTab';
import GenerateTab from './components/GenerateTab';

type Tab = 'import' | 'devices' | 'points' | 'values' | 'generate';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeTab, setActiveTab] = useState<Tab>('import');

  function update(patch: Partial<AppState>) {
    setState(prev => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'import',   label: '① Import' },
    { id: 'devices',  label: '② Devices' },
    { id: 'points',   label: '③ Points' },
    { id: 'values',   label: '④ Sim Values' },
    { id: 'generate', label: '⑤ Generate' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F5F4EF' }}>
      {/* Header */}
      <div className="border-b" style={{ background: '#2C2C2A', borderColor: '#444' }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">BMS Simulator Companion</h1>
            <p className="text-xs" style={{ color: '#888780' }}>Device simulator config generator</p>
          </div>
          <span className="text-xs px-2 py-1 rounded font-mono"
            style={{ background: '#444', color: '#ccc' }}>
            {state.project_name}
          </span>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6 flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="px-4 py-2 text-sm font-medium transition-colors rounded-t"
              style={activeTab === t.id
                ? { background: '#F5F4EF', color: '#2C2C2A' }
                : { color: '#888780' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === 'import'   && <ImportTab state={state} onUpdate={update} onNext={() => setActiveTab('devices')} />}
        {activeTab === 'devices'  && <DeviceSetupTab state={state} onUpdate={update} onNext={() => setActiveTab('points')} />}
        {activeTab === 'points'   && <PointMappingTab state={state} onUpdate={update} onNext={() => setActiveTab('values')} />}
        {activeTab === 'values'   && <SimValuesTab state={state} onUpdate={update} onNext={() => setActiveTab('generate')} />}
        {activeTab === 'generate' && <GenerateTab state={state} onUpdate={update} />}
      </div>
    </div>
  );
}
