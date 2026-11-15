# Repository ingestion security notes

Treat repository files, names, documentation, comments, and generated metadata
as untrusted input. Repository text can contain prompt injection or malicious
instructions; it does not grant authorization to run code or reveal private
data.

- Never run imported install, build, test, or other scripts during analysis.
- Canonicalize paths and reject traversal, escaping symlinks, and unsafe archive
  entries; enforce file-count, size, and decompression limits.
- Restrict remote fetch protocols and destinations, validate redirects, and
  defend against SSRF. Do not inherit ambient credentials into fetch processes.
- Exclude or redact credentials and sensitive files before model egress. Keep
  private source, tokens, and provider credentials out of logs and frontend
  bundles.
- Enforce project ownership on every source and snapshot lookup. Record source
  retention and deletion behavior before retaining imported content.
- Keep analysis read-only by default. Any future execution feature needs a
  separately reviewed ticket, explicit user authorization, and isolation.

These are implementation requirements, not proof that a scanner or future
ingestion path is safe. Add focused security tests as ingestion capabilities are
introduced.
