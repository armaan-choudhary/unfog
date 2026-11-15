# Versioned API and graph contracts

These documents are the P0-04 draft contracts. The initial contract version is
`v1`. FastAPI now generates runtime OpenAPI from the application factory;
P1-05 will formalize client-safe OpenAPI/CORS behavior. Keep the versioned
error-response schema authoritative for error payloads.

## Snapshot boundary

Follow the approved phase-plan model: every graph and source citation belongs
to one immutable snapshot. A Git import uses the commit identity; an archive or
local tree without a Git commit uses a content-manifest hash. Analysis must
never silently combine records from different snapshots. Exact source storage,
retention, and deletion mechanics remain implementation decisions for later
tickets.

Each source entity and citation carries a `snapshot_id`. A graph response has
one `snapshot.id`; consumers and validators must require every nested
`snapshot_id` to equal it. Edges must resolve both endpoint symbols and all
evidence citations inside that same graph. Citations must resolve to the stated
file and line range. Symbol and citation ranges must be ordered and remain
within the file's line count. JSON Schema covers field shape and local
constraints; cross-record and cross-snapshot checks are semantic validation
requirements.

## Files

- [`source-graph.v1.schema.json`](source-graph.v1.schema.json) — graph, source
  symbols, edges, and citation provenance.
- [`api-responses.v1.schema.json`](api-responses.v1.schema.json) — standard API
  error envelope and asynchronous job response.
- [`examples/source-graph.v1.example.json`](examples/source-graph.v1.example.json)
  — synthetic graph fixture for schema review only.
- [`examples/api-error.v1.example.json`](examples/api-error.v1.example.json) —
  safe error envelope example.
- [`examples/job.v1.example.json`](examples/job.v1.example.json) — job status
  example.

Example IDs, paths, and hashes are synthetic contract fixtures. They are not
repository analysis and must never be shown to users as real Unfog results.

Run the dependency-free fixture invariant checks from the repository root:

```bash
python -m unittest discover -s backend/tests/contracts -v
```

These checks cover JSON syntax, local schema references/pattern syntax, and
cross-record invariants in the synthetic examples. The runtime implementation
must still validate API payloads against these contracts.

## Provenance values

- `static_verified`: supported by syntax extraction or a language indexer.
- `runtime_verified`: supported by an explicitly authorized isolated runtime
  observation and attached trace.
- `ai_inferred`: model-suggested interpretation supported by source citations,
  but not proven by static/runtime evidence.
- `unknown`: unresolved or insufficiently supported.

Confidence is optional metadata and never promotes `ai_inferred` to a verified
state. All persistent IDs are UUIDv4 values, generated in Python with
`uuid.uuid4()`, stored as PostgreSQL native `UUID`, and exposed as canonical
UUID strings. Do not encode readable prefixes in the stored identifier or infer
chronology from UUID ordering; use `created_at` for chronological ordering.

## Error and job rules

- Errors include a stable code and request ID. Messages are safe for the
  requesting user; never put private source, credentials, stack traces, or raw
  provider errors in this envelope.
- HTTP status remains the transport status; it is not duplicated as a mutable
  field in the error body.
- Job progress is explicit and server-reported. UI animation must not invent
  progress or completion.
- A failed job includes a safe error summary. It does not include source text.
