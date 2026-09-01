import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const seededState = {
  organizations: [{ id: 'org-phalanx', name: 'Phalanx Prime' }],
  sources: [
    { id: 'source-atlas', organizationId: 'org-phalanx', name: 'ATLAS perimeter collector', kind: 'collector', status: 'healthy', lastSeenAt: '2026-09-01T00:15:00.000Z' },
    { id: 'source-wedge', organizationId: 'org-phalanx', name: 'Wedge device registry', kind: 'registry', status: 'warning', lastSeenAt: '2026-08-31T20:00:00.000Z' },
    { id: 'source-drone-sim', organizationId: 'org-phalanx', name: 'Drone simulator', kind: 'response-module', status: 'simulation', lastSeenAt: '2026-09-01T00:10:00.000Z' }
  ],
  events: [],
  findings: [
    { id: 'finding-001', organizationId: 'org-phalanx', title: 'Wedge device registry freshness degraded', severity: 'high', status: 'open', sourceId: 'source-wedge', provenance: 'observed', createdAt: '2026-09-01T00:00:00.000Z' }
  ],
  scenarios: [
    { id: 'scenario-001', organizationId: 'org-phalanx', name: 'Registry freshness recovery', status: 'triage', findingIds: ['finding-001'], createdAt: '2026-09-01T00:00:00.000Z' }
  ],
  approvals: [],
  droneActions: [],
  auditLog: [
    { id: 'audit-seed-001', organizationId: 'org-phalanx', actorId: 'system', action: 'prototype.seeded', targetType: 'system', targetId: 'centurion', occurredAt: '2026-09-01T00:00:00.000Z', metadata: { mode: 'simulation' } }
  ]
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = null;
    this.writeChain = Promise.resolve();
  }

  async init() {
    try {
      this.state = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.state = structuredClone(seededState);
      await this.persist();
    }
  }

  list(collection, organizationId) {
    return this.state[collection].filter((item) => item.organizationId === organizationId);
  }

  async mutate(fn) {
    const result = fn(this.state);
    await this.persist();
    return result;
  }

  async persist() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(this.state, null, 2), 'utf8');
      await rename(temporaryPath, this.filePath);
    });
    return this.writeChain;
  }
}
