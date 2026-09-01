import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

let server;
let baseUrl;
const headers = { 'x-organization-id': 'org-phalanx', 'x-actor-id': 'test-operator', 'content-type': 'application/json' };
before(async () => { const folder = await mkdtemp(join(tmpdir(), 'centurion-test-')); ({ server } = await createApp({ dataFile: join(folder, 'state.json') })); await new Promise((resolve) => server.listen(0, resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
async function call(path, options = {}) { return fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } }); }

test('dashboard is organization scoped and declares simulation mode', async () => {
  const response = await call('/api/dashboard');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, 'simulation-only');
  assert.equal(body.sources.length, 3);
});

test('events require canonical fields and reject duplicate scoped idempotency keys', async () => {
  const event = { sourceId: 'source-atlas', eventType: 'network.alert', occurredAt: '2026-09-01T01:00:00.000Z', severity: 'high', provenance: 'observed', idempotencyKey: 'canonical-event-1', payload: { host: 'edge-01' } };
  const created = await call('/api/events', { method: 'POST', body: JSON.stringify(event) });
  assert.equal(created.status, 201);
  const duplicate = await call('/api/events', { method: 'POST', body: JSON.stringify(event) });
  assert.equal(duplicate.status, 409);
});

test('credential-shaped payloads are refused', async () => {
  const event = { sourceId: 'source-atlas', eventType: 'network.alert', occurredAt: '2026-09-01T01:00:00.000Z', severity: 'high', provenance: 'observed', idempotencyKey: 'credential-event-1', payload: { token: 'not-allowed' } };
  const response = await call('/api/events', { method: 'POST', body: JSON.stringify(event) });
  assert.equal(response.status, 400);
});

test('approved drone work remains simulation-only and has no execution route', async () => {
  const request = await call('/api/response-recommendations', { method: 'POST', body: JSON.stringify({ findingId: 'finding-001', summary: 'Open a recovery task.', requestedLayer: 1, target: 'Wedge registry', authorityPath: 'SOC lead' }) });
  const created = await request.json();
  assert.equal(request.status, 201);
  const decision = await call(`/api/approvals/${created.approval.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: 'approved', authorityPath: 'SOC lead' }) });
  assert.equal(decision.status, 200);
  const actions = await call('/api/drone-actions');
  const body = await actions.json();
  assert.equal(body[0].status, 'eligible-simulation-only');
  const execution = await call(`/api/drone-actions/${body[0].id}/execute`, { method: 'POST', body: '{}' });
  assert.equal(execution.status, 404);
});
