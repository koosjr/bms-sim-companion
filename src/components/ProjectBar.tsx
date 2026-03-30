// src/components/ProjectBar.tsx
import { useRef } from 'react';
import type { ProjectMeta } from '../storage';

interface Props {
  projects: ProjectMeta[];
  activeProjectId: string;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onDelete: () => void;
}

export default function ProjectBar({
  projects,
  activeProjectId,
  onSwitch,
  onNew,
  onExport,
  onImport,
  onDelete,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input so the same file can be re-imported if needed
      e.target.value = '';
    }
  }

  const btnBase: React.CSSProperties = {
    fontSize: '0.7rem',
    padding: '2px 8px',
    borderRadius: '3px',
    border: '1px solid #555',
    background: '#3A3A38',
    color: '#ccc',
    cursor: 'pointer',
    lineHeight: '1.6',
    whiteSpace: 'nowrap',
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.4,
    cursor: 'default',
  };

  return (
    <div
      style={{
        background: '#222220',
        borderBottom: '1px solid #444',
        padding: '4px 0',
      }}
    >
      <div
        className="max-w-5xl mx-auto px-6"
        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        {/* Project selector */}
        <select
          value={activeProjectId}
          onChange={e => onSwitch(e.target.value)}
          style={{
            fontSize: '0.7rem',
            padding: '2px 4px',
            borderRadius: '3px',
            border: '1px solid #555',
            background: '#3A3A38',
            color: '#ccc',
            cursor: 'pointer',
            minWidth: '140px',
            maxWidth: '260px',
          }}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <button style={btnBase} onClick={onNew} title="Create a new project">
          + New
        </button>

        <button style={btnBase} onClick={onExport} title="Export current project as JSON">
          Export
        </button>

        <button
          style={btnBase}
          onClick={() => fileInputRef.current?.click()}
          title="Import a project from JSON"
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          style={projects.length <= 1 ? btnDisabled : btnBase}
          disabled={projects.length <= 1}
          onClick={onDelete}
          title={
            projects.length <= 1
              ? 'Cannot delete the only project'
              : 'Delete current project'
          }
        >
          Delete
        </button>
      </div>
    </div>
  );
}
