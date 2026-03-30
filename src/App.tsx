// src/App.tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from './types';
import {
  saveState,
  migrateIfNeeded,
  loadProjectState,
  saveProjectState,
  deleteProjectState,
  getActiveProjectId,
  setActiveProjectId,
  loadProjects,
  saveProjects,
  createEmptyState,
} from './storage';
import type { ProjectMeta } from './storage';
import ImportTab from './components/ImportTab';
import DeviceSetupTab from './components/DeviceSetupTab';
import PointMappingTab from './components/PointMappingTab';
import SimValuesTab from './components/SimValuesTab';
import GenerateTab from './components/GenerateTab';
import ProjectBar from './components/ProjectBar';

type Tab = 'import' | 'devices' | 'points' | 'values' | 'generate';

function initApp(): { projects: ProjectMeta[]; activeProjectId: string; state: AppState } {
  const { projects, activeId, activeState } = migrateIfNeeded();
  return { projects, activeProjectId: activeId, state: activeState };
}

export default function App() {
  const [{ projects, activeProjectId, state }, setAll] = useState(() => initApp());
  const [activeTab, setActiveTab] = useState<Tab>('import');

  // ── Core state updater ────────────────────────────────────────────────────
  function update(patch: Partial<AppState>) {
    setAll(prev => {
      const next = { ...prev.state, ...patch };
      // Keep legacy key in sync for any external tools that may read it
      saveState(next);
      saveProjectState(prev.activeProjectId, next);
      // Update the project's updatedAt in the metadata
      const updatedProjects = prev.projects.map(p =>
        p.id === prev.activeProjectId
          ? { ...p, name: next.project_name, updatedAt: new Date().toISOString() }
          : p
      );
      saveProjects(updatedProjects);
      return { ...prev, state: next, projects: updatedProjects };
    });
  }

  // ── Project management ────────────────────────────────────────────────────
  function switchProject(id: string) {
    if (id === activeProjectId) return;
    const loaded = loadProjectState(id);
    if (!loaded) return;
    setActiveProjectId(id);
    setAll(prev => ({ ...prev, activeProjectId: id, state: loaded }));
    setActiveTab('import');
  }

  function newProject(name: string) {
    const id = uuidv4();
    const trimmed = name.trim() || 'New Project';
    const newState = createEmptyState(trimmed);
    const meta: ProjectMeta = { id, name: trimmed, updatedAt: new Date().toISOString() };
    saveProjectState(id, newState);
    setActiveProjectId(id);
    setAll(prev => {
      const updated = [...prev.projects, meta];
      saveProjects(updated);
      return { projects: updated, activeProjectId: id, state: newState };
    });
    setActiveTab('import');
  }

  function deleteProject(id: string) {
    setAll(prev => {
      if (prev.projects.length <= 1) return prev;
      const updated = prev.projects.filter(p => p.id !== id);
      saveProjects(updated);
      deleteProjectState(id);
      // Switch to first remaining project
      const next = updated[0];
      const nextState = loadProjectState(next.id) ?? createEmptyState(next.name);
      setActiveProjectId(next.id);
      return { projects: updated, activeProjectId: next.id, state: nextState };
    });
  }

  function exportProject() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.project_name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importProject(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as AppState;
        const id = uuidv4();
        const name = parsed.project_name || file.name.replace(/\.json$/i, '') || 'Imported Project';
        const importedState: AppState = { ...parsed, project_name: name };
        const meta: ProjectMeta = { id, name, updatedAt: new Date().toISOString() };
        saveProjectState(id, importedState);
        setActiveProjectId(id);
        setAll(prev => {
          const updated = [...prev.projects, meta];
          saveProjects(updated);
          return { projects: updated, activeProjectId: id, state: importedState };
        });
        setActiveTab('import');
      } catch {
        alert('Failed to import project: invalid JSON file.');
      }
    };
    reader.readAsText(file);
  }

  // ── Handlers passed to ProjectBar ─────────────────────────────────────────
  function handleNew() {
    const name = window.prompt('Project name:', 'New Project');
    if (name === null) return; // cancelled
    newProject(name);
  }

  function handleDelete() {
    const current = projects.find(p => p.id === activeProjectId);
    if (!current) return;
    if (!window.confirm(`Delete project "${current.name}"? This cannot be undone.`)) return;
    deleteProject(activeProjectId);
  }

  // ── Unused imports kept for reference (getActiveProjectId used indirectly) -
  void getActiveProjectId;
  void loadProjects;

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

        {/* Project bar */}
        <ProjectBar
          projects={projects}
          activeProjectId={activeProjectId}
          onSwitch={switchProject}
          onNew={handleNew}
          onExport={exportProject}
          onImport={importProject}
          onDelete={handleDelete}
        />

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
