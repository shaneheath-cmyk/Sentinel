# Centurion / Sentinel Preliminary Rebuild

This is a deliberately small, Base44-free foundation for the Centurion control
plane and its Sentinel operator console. It has no npm runtime dependencies.

## Run

```powershell
cd C:\Users\shane\Documents\Codex\2026-09-01\na\work\centurion-sentinel
npm start
```

Open `http://localhost:4173`. The server creates `data/centurion.json` on first
run; that file is local prototype data and is intentionally ignored by Git.

## Verify

```powershell
npm test
```

## Scope and guardrails

- Every record is organization-scoped.
- Canonical events require a source, timestamp, severity, provenance and an
  idempotency key. A scoped duplicate is rejected.
- Events, approvals and response recommendations append audit entries.
- Drone actions are simulation-only. Approval changes an action to `eligible`,
  but this prototype has no execution endpoint.
- No password, token, secret, or vault entity is modeled or accepted.
- The JSON store is a development seam, not a production datastore. Replace it
  with PostgreSQL, row-level tenant controls and a durable queue before a real
  deployment.

## API

- `GET /api/dashboard`
- `GET /api/sources`
- `GET /api/findings`
- `GET /api/scenarios`
- `GET /api/approvals`
- `GET /api/drone-actions`
- `GET /api/audit-log`
- `POST /api/events`
- `POST /api/response-recommendations`
- `POST /api/approvals/:id/decision`

All API calls use `x-organization-id` and `x-actor-id` headers. The local UI
uses the seeded Phalanx organization and operator identity.
