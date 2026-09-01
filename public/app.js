const headers = { 'x-organization-id': 'org-phalanx', 'x-actor-id': 'operator-local', 'content-type': 'application/json' };
const empty = document.querySelector('#empty').content;
const escape = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const label = (value) => value.replaceAll('-', ' ');

function renderRows(element, items, render) {
  element.replaceChildren();
  if (!items.length) return element.append(empty.cloneNode(true));
  element.innerHTML = items.map(render).join('');
}
function row(title, detail, status) {
  return `<div class="row"><div class="row-main"><strong>${escape(title)}</strong><span>${escape(detail)}</span></div>${status ? `<span class="tag ${escape(status)}">${escape(label(status))}</span>` : ''}</div>`;
}
async function load() {
  const response = await fetch('/api/dashboard', { headers });
  const data = await response.json();
  document.querySelector('#metrics').innerHTML = [
    ['Open findings', data.summary.openFindings], ['Critical findings', data.summary.criticalFindings], ['Pending approvals', data.summary.pendingApprovals], ['Stale sources', data.summary.staleSources]
  ].map(([name, count]) => `<div class="metric"><p>${name}</p><strong>${count}</strong></div>`).join('');
  renderRows(document.querySelector('#findings'), data.findings, (item) => row(item.title, `${item.provenance} | ${item.sourceId}`, item.severity));
  renderRows(document.querySelector('#sources'), data.sources, (item) => row(item.name, `${item.kind} | last seen ${new Date(item.lastSeenAt).toLocaleString()}`, item.status));
  renderRows(document.querySelector('#approvals'), data.approvals, (item) => row(item.recommendationId, `${item.authorityPath} | ${item.requestedBy}`, item.status));
  renderRows(document.querySelector('#drone-actions'), data.droneActions, (item) => row(`${item.mode} layer ${item.layer}`, `${item.target} | ${item.rollbackMethod}`, item.status));
  const auditResponse = await fetch('/api/audit-log', { headers });
  const audit = await auditResponse.json();
  renderRows(document.querySelector('#audit'), audit.slice(0, 4), (item) => row(item.action, `${item.actorId} | ${new Date(item.occurredAt).toLocaleTimeString()}`, ''));
}
document.querySelector('#simulate-event').addEventListener('click', async () => {
  const event = { sourceId: 'source-drone-sim', eventType: 'perimeter.anomaly.simulated', occurredAt: new Date().toISOString(), severity: 'medium', provenance: 'simulated', idempotencyKey: crypto.randomUUID(), payload: { confidence: 0.76, location: 'test-sector-7', note: 'Operator initiated simulation.' } };
  const response = await fetch('/api/events', { method: 'POST', headers, body: JSON.stringify(event) });
  if (!response.ok) window.alert((await response.json()).error);
  await load();
});
load();
