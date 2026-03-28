import { describe, it, expect } from 'vitest';
import { generateNetworkSetup } from '../generators/networkSetupGenerator';
import type { NetworkConfig } from '../types';

const NET: NetworkConfig = {
  ip_prefix: '192.168.1',
  subnet: '192.168.1.0/24', gateway: '192.168.1.1',
  pi_ip: '192.168.1.200', parent_interface: 'eth0',
};

describe('generateNetworkSetup', () => {
  it('references the correct parent interface', () => {
    const out = generateNetworkSetup(NET);
    expect(out).toContain('eth0');
  });

  it('assigns the Pi macvlan IP', () => {
    const out = generateNetworkSetup(NET);
    expect(out).toContain('192.168.1.200');
  });

  it('is a bash script', () => {
    const out = generateNetworkSetup(NET);
    expect(out.startsWith('#!/bin/bash')).toBe(true);
  });
});
