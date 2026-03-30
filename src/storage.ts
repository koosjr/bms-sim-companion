// src/storage.ts
import { v4 as uuidv4 } from 'uuid';
import type { AppState, NetworkConfig } from './types';

const KEY = 'bms_sim_state';
const PROJECTS_KEY = 'bms_sim_projects';
const ACTIVE_KEY = 'bms_sim_active_project';

const DEFAULT_NETWORK: NetworkConfig = {
  ip_prefix: '192.168.1',
  subnet: '192.168.1.0/24',
  gateway: '192.168.1.1',
  pi_ip: '192.168.1.200',
  parent_interface: 'eth0',
};

// ── Legacy single-project API (kept for backward compat) ─────────────────────

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...parsed,
      network: { ...DEFAULT_NETWORK, ...parsed.network },  // ensure ip_prefix exists
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ── Multi-project types ───────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
}

// ── Multi-project API ─────────────────────────────────────────────────────────

export function loadProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ProjectMeta[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadProjectState(id: string): AppState | null {
  try {
    const raw = localStorage.getItem(`bms_sim_project_${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...parsed,
      network: { ...DEFAULT_NETWORK, ...parsed.network },
    };
  } catch {
    return null;
  }
}

export function saveProjectState(id: string, state: AppState): void {
  localStorage.setItem(`bms_sim_project_${id}`, JSON.stringify(state));
}

export function deleteProjectState(id: string): void {
  localStorage.removeItem(`bms_sim_project_${id}`);
}

export function getActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProjectId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

// ── Migration helper ──────────────────────────────────────────────────────────

/**
 * If the old single-project key exists and no projects list exists yet,
 * migrate the old state into a new project entry.
 * Returns the initial { projects, activeId, activeState } after migration.
 */
export function migrateIfNeeded(): {
  projects: ProjectMeta[];
  activeId: string;
  activeState: AppState;
} {
  const existingProjects = loadProjects();
  const existingActiveId = getActiveProjectId();

  // Already migrated
  if (existingProjects.length > 0 && existingActiveId) {
    const activeState = loadProjectState(existingActiveId) ?? emptyState();
    return { projects: existingProjects, activeId: existingActiveId, activeState };
  }

  // Check for legacy data
  const legacyRaw = localStorage.getItem(KEY);
  if (legacyRaw) {
    try {
      const legacyState = JSON.parse(legacyRaw) as AppState;
      const migratedState: AppState = {
        ...legacyState,
        network: { ...DEFAULT_NETWORK, ...legacyState.network },
      };
      const id = uuidv4();
      const name = migratedState.project_name || 'My Project';
      const meta: ProjectMeta = { id, name, updatedAt: new Date().toISOString() };
      saveProjectState(id, migratedState);
      saveProjects([meta]);
      setActiveProjectId(id);
      return { projects: [meta], activeId: id, activeState: migratedState };
    } catch {
      // Fall through to create a fresh project
    }
  }

  // No legacy data — create a blank first project
  const id = uuidv4();
  const name = 'My Project';
  const state = emptyState(name);
  const meta: ProjectMeta = { id, name, updatedAt: new Date().toISOString() };
  saveProjectState(id, state);
  saveProjects([meta]);
  setActiveProjectId(id);
  return { projects: [meta], activeId: id, activeState: state };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyState(name = 'Project 1'): AppState {
  return {
    project_name: name,
    imported: null,
    devices: [],
    network: { ...DEFAULT_NETWORK },
  };
}

export function createEmptyState(name: string): AppState {
  return {
    project_name: name,
    imported: null,
    devices: [],
    network: { ...DEFAULT_NETWORK },
  };
}
