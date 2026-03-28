// src/storage.ts
import { AppState, NetworkConfig } from './types';

const KEY = 'bms_sim_state';

const DEFAULT_NETWORK: NetworkConfig = {
  subnet: '192.168.1.0/24',
  gateway: '192.168.1.1',
  pi_ip: '192.168.1.200',
  parent_interface: 'eth0',
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return JSON.parse(raw) as AppState;
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function emptyState(): AppState {
  return {
    project_name: 'Project 1',
    imported: null,
    devices: [],
    network: { ...DEFAULT_NETWORK },
  };
}
