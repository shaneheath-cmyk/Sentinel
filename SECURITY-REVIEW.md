# Claude Security Attack Brief

## Current posture

This is an intentionally dependency-free preliminary implementation of the
Centurion control plane and Sentinel console. It is a local prototype, not a
production claim. Its most important invariants are tenant isolation, evidence
provenance, idempotent ingest, an immutable-enough audit trail, absence of
general-purpose secret storage, and no executable drone action path.

## Attack objectives

Try to prove or disprove each claim below. Report a reproducible request,
expected result, actual result, severity, and suggested smallest fix.

1. Cross-tenant reads and writes are impossible with header substitution.
2. A supplied `x-organization-id` cannot be trusted once real authentication
   replaces this prototype identity seam.
3. Duplicate event delivery cannot create multiple records within a tenant.
4. Event provenance cannot be silently relabelled from simulated or inferred
   to observed.
5. Payload nesting, alternate key casing, arrays, or large bodies cannot pass
   credential-shaped material into the event store.
6. A response recommendation cannot create a drone action without a valid
   tenant finding and explicit requested layer.
7. An approval can only be decided once and includes an authority path.
8. An approved drone operation cannot become live through an undocumented
   route, client-side state tampering, or direct data-path mutation.
9. Static-file routing cannot read files outside `public/`.
10. The JSON write path behaves safely under concurrent requests and crash
    interruption. Identify limitations that require a PostgreSQL transaction
    and durable queue in the next phase.

## Explicitly expected limitations

- Authentication is a local header seam, not an identity provider.
- JSON persistence is single-node development storage.
- The audit log is append-only by application convention, not WORM storage.
- SSE/WebSocket fan-out, collectors, external feeds, production secret
  custody, and actual drone executors are deliberately absent.

## Scope discipline

Do not add an execution endpoint or secret vault to resolve an observation.
Recommendations should preserve simulation-only response mode until an
approved live-execution architecture exists.
