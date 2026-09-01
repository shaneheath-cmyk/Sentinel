import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './store.js';

const directory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = resolve(directory, '..');
const publicDirectory = join(root, 'public');
const forbiddenPayloadKeys = ['password', 'secret', 'token', 'privateKey', 'credential'];
const severities = new Set(['low', 'medium', 'high', 'critical']);
const mimeTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function id(prefix) { return `${prefix}-${randomUUID()}`; }
function now() { return new Date().toISOString(); }
function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
function apiError(response, status, message) { json(response, status, { error: message }); }
function organization(request) { return request.headers['x-organization-id'] || 'org-phalanx'; }
function actor(request) { return request.headers['x-actor-id'] || 'operator-local'; }
function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function containsForbiddenKey(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return false;
  return Object.entries(value).some(([key, child]) => forbiddenPayloadKeys.includes(key) || containsForbiddenKey(child));
}
async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request body exceeds 1 MB.');
  }
  try { return body ? JSON.parse(body) : {}; } catch { throw new Error('Request body must be valid JSON.'); }
}
function audit(state, organizationId, actorId, action, targetType, targetId, metadata = {}) {
  state.auditLog.unshift({ id: id('audit'), organizationId, actorId, action, targetType, targetId, occurredAt: now(), metadata });
}
function dashboard(store, organizationId) {
  const sources = store.list('sources', organizationId);
  const findings = store.list('findings', organizationId);
  const approvals = store.list('approvals', organizationId);
  const droneActions = store.list('droneActions', organizationId);
  return {
    mode: 'simulation-only',
    sources,
    findings,
    scenarios: store.list('scenarios', organizationId),
    approvals,
    droneActions,
    summary: {
      openFindings: findings.filter((finding) => finding.status === 'open').length,
      criticalFindings: findings.filter((finding) => finding.severity === 'critical' && finding.status === 'open').length,
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
      staleSources: sources.filter((source) => source.status !== 'healthy' && source.status !== 'simulation').length
    }
  };
}
function validateEvent(input, organizationId, state) {
  const required = ['sourceId', 'eventType', 'occurredAt', 'severity', 'provenance', 'idempotencyKey'];
  const missing = required.filter((key) => !input[key]);
  if (missing.length) return `Missing required event fields: ${missing.join(', ')}.`;
  if (!severities.has(input.severity)) return 'Event severity must be low, medium, high, or critical.';
  if (!['observed', 'inferred', 'simulated'].includes(input.provenance)) return 'Event provenance must be observed, inferred, or simulated.';
  if (Number.isNaN(Date.parse(input.occurredAt))) return 'Event occurredAt must be an ISO timestamp.';
  if (!state.sources.some((source) => source.id === input.sourceId && source.organizationId === organizationId)) return 'Event source is not registered for this organization.';
  if (containsForbiddenKey(input.payload)) return 'Event payload may not contain credentials or secrets.';
  return null;
}
async function serveStatic(request, response, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = resolve(publicDirectory, relativePath);
  if (!filePath.startsWith(publicDirectory)) return apiError(response, 403, 'Invalid file path.');
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return apiError(response, 404, 'Not found.');
    response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  } catch { apiError(response, 404, 'Not found.'); }
}

export async function createApp({ dataFile = join(root, 'data', 'centurion.json') } = {}) {
  const store = new JsonStore(dataFile);
  await store.init();
  const server = createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const organizationId = organization(request);
    const actorId = actor(request);
    try {
      if (request.method === 'GET' && url.pathname === '/api/dashboard') return json(response, 200, dashboard(store, organizationId));
      const collections = { '/api/sources': 'sources', '/api/findings': 'findings', '/api/scenarios': 'scenarios', '/api/approvals': 'approvals', '/api/drone-actions': 'droneActions', '/api/audit-log': 'auditLog' };
      if (request.method === 'GET' && collections[url.pathname]) return json(response, 200, store.list(collections[url.pathname], organizationId));

      if (request.method === 'POST' && url.pathname === '/api/events') {
        const input = await readBody(request);
        const validationError = validateEvent(input, organizationId, store.state);
        if (validationError) return apiError(response, 400, validationError);
        const duplicate = store.list('events', organizationId).find((event) => event.idempotencyKey === input.idempotencyKey);
        if (duplicate) return json(response, 409, { error: 'Duplicate idempotency key.', eventId: duplicate.id });
        const event = { id: id('event'), organizationId, sourceId: input.sourceId, eventType: input.eventType, occurredAt: input.occurredAt, receivedAt: now(), severity: input.severity, provenance: input.provenance, idempotencyKey: input.idempotencyKey, payload: input.payload || {}, contentHash: createHash('sha256').update(JSON.stringify(input.payload || {})).digest('hex') };
        await store.mutate((state) => { state.events.unshift(event); audit(state, organizationId, actorId, 'event.ingested', 'security_event', event.id, { provenance: event.provenance, severity: event.severity }); });
        return json(response, 201, event);
      }

      if (request.method === 'POST' && url.pathname === '/api/response-recommendations') {
        const input = await readBody(request);
        if (!input.findingId || !input.summary || !input.requestedLayer) return apiError(response, 400, 'findingId, summary and requestedLayer are required.');
        if (![0, 1, 2, 3].includes(input.requestedLayer)) return apiError(response, 400, 'requestedLayer must be 0, 1, 2, or 3.');
        if (!store.list('findings', organizationId).some((finding) => finding.id === input.findingId)) return apiError(response, 404, 'Finding not found for this organization.');
        const recommendation = { id: id('recommendation'), organizationId, findingId: input.findingId, summary: input.summary, requestedLayer: input.requestedLayer, status: 'awaiting-approval', createdAt: now() };
        const approval = { id: id('approval'), organizationId, recommendationId: recommendation.id, status: 'pending', requestedBy: actorId, authorityPath: input.authorityPath || 'unassigned', createdAt: now() };
        const droneAction = { id: id('drone-action'), organizationId, recommendationId: recommendation.id, mode: 'simulation', layer: input.requestedLayer, status: 'blocked-pending-approval', target: input.target || 'unassigned', rollbackMethod: input.rollbackMethod || 'not-applicable-in-simulation', createdAt: now() };
        await store.mutate((state) => { state.approvals.unshift(approval); state.droneActions.unshift(droneAction); audit(state, organizationId, actorId, 'response.recommended', 'response_recommendation', recommendation.id, { layer: input.requestedLayer, findingId: input.findingId }); });
        return json(response, 201, { recommendation, approval, droneAction });
      }

      const decisionMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/decision$/);
      if (request.method === 'POST' && decisionMatch) {
        const input = await readBody(request);
        if (!['approved', 'rejected'].includes(input.decision) || !input.authorityPath) return apiError(response, 400, 'decision (approved or rejected) and authorityPath are required.');
        const approval = store.list('approvals', organizationId).find((item) => item.id === decisionMatch[1]);
        if (!approval) return apiError(response, 404, 'Approval request not found.');
        if (approval.status !== 'pending') return apiError(response, 409, 'Approval request has already been decided.');
        await store.mutate((state) => {
          approval.status = input.decision; approval.decidedBy = actorId; approval.authorityPath = input.authorityPath; approval.decidedAt = now();
          const action = state.droneActions.find((item) => item.organizationId === organizationId && item.recommendationId === approval.recommendationId);
          if (action) action.status = input.decision === 'approved' ? 'eligible-simulation-only' : 'rejected';
          audit(state, organizationId, actorId, `approval.${input.decision}`, 'approval_request', approval.id, { authorityPath: input.authorityPath });
        });
        return json(response, 200, approval);
      }
      if (url.pathname.startsWith('/api/')) return apiError(response, 404, 'API route not found.');
      return serveStatic(request, response, url.pathname);
    } catch (error) { return apiError(response, 400, error.message || 'Request failed.'); }
  });
  return { server, store };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = await createApp();
  server.listen(4173, () => console.log('Centurion / Sentinel listening on http://localhost:4173'));
}
